import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { finalidadesDoContatoSchema } from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Marca para que serve a pessoa dentro da empresa (decisor, quem assina,
 * financeiro/NF, usuário-chave, TI). Só aceita contato que já está ligado a
 * esta empresa: o vínculo em si continua sendo feito no cadastro do contato.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contatoId: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const { id, contatoId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(id).success || !uuid.safeParse(contatoId).success) {
    return fail("not_found", "Contato não encontrado.", 404, { requestId });
  }

  const parsed = finalidadesDoContatoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Finalidade desconhecida.", 422, { requestId });
  const finalidades = [...new Set(parsed.data.account_roles)];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ account_roles: finalidades })
    .eq("organization_id", authz.org.orgId)
    .eq("account_id", id)
    .eq("id", contatoId)
    .select("id,account_roles")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao salvar.", 500, { requestId });
  if (!data) return fail("not_found", "Contato não encontrado nesta empresa.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "customer_account.contact_roles_updated",
    resourceType: "contacts",
    resourceId: contatoId,
    requestId,
    metadata: { account_id: id, account_roles: finalidades },
  });

  return ok(data, { requestId });
}
