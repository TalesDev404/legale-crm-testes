import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DA_ATIVIDADE, atividadeCreateSchema } from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Registra um contato com a empresa (o que era uma linha nas abas "Histórico
 * CRM" e "Histórico CS"). Se vier `next_follow_up_on`, a ficha já fica com o
 * próximo contato remarcado — o passo que a planilha esquecia.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "customer_account_activities" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  const parsed = atividadeCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira o registro do contato.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!empresa) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  if (parsed.data.lead_id) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", parsed.data.lead_id)
      .maybeSingle();
    if (!lead) return fail("validation_failed", "O negócio não pertence à organização ativa.", 422, { requestId });
  }

  const { data, error } = await supabase
    .from("customer_account_activities")
    .insert({
      organization_id: authz.org.orgId,
      account_id: id,
      lead_id: parsed.data.lead_id,
      team: parsed.data.team,
      channel: parsed.data.channel,
      summary: parsed.data.summary,
      performed_at: parsed.data.performed_at,
      performed_by_user_id: authz.user.id,
      source: "manual",
    })
    .select(COLUNAS_DA_ATIVIDADE)
    .single();
  if (error) return fail("internal_error", "Erro ao registrar o contato.", 500, { requestId });

  if (parsed.data.next_follow_up_on) {
    await supabase
      .from("customer_accounts")
      .update({ next_follow_up_on: parsed.data.next_follow_up_on })
      .eq("organization_id", authz.org.orgId)
      .eq("id", id);
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "customer_account.activity_logged",
    resourceType: "customer_account_activities",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
    metadata: { account_id: id, team: parsed.data.team, channel: parsed.data.channel },
  });

  return ok(data, { requestId, status: 201 });
}
