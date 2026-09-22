import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DA_PROPOSTA } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const vinculoSchema = z.object({ lead_id: z.string().uuid().nullable() }).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "commercial_proposals" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", "Proposta inválida.", 422, { requestId });

  const parsed = vinculoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Escolha um negócio válido.", 422, { requestId });

  const supabase = await createClient();
  if (parsed.data.lead_id) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", parsed.data.lead_id)
      .maybeSingle();
    if (!lead)
      return fail("validation_failed", "O negócio não pertence à organização ativa.", 422, {
        requestId,
      });
  }

  const { data, error } = await supabase
    .from("commercial_proposals")
    .update({ lead_id: parsed.data.lead_id })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS_DA_PROPOSTA)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao vincular a proposta.", 500, { requestId });
  if (!data) return fail("not_found", "Proposta não encontrada.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "commercial_proposal.linked",
    resourceType: "commercial_proposals",
    resourceId: id,
    requestId,
    metadata: { lead_id: parsed.data.lead_id },
  });
  return ok(data, { requestId });
}
