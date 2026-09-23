import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_drafts" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "E-mail inválido.", 422, { requestId });
  const body = z.object({ confirmed_not_sent: z.literal(true) }).strict().safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("validation_failed", "Confirme que verificou a pasta Enviados.", 422, { requestId });
  const admin = createAdminClient();
  const { data: draft } = await admin.from("commercial_email_drafts")
    .select("status, updated_at")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!draft) return fail("not_found", "E-mail não encontrado.", 404, { requestId });
  if (draft.status !== "needs_review" && draft.status !== "sending") {
    return fail("state_conflict", "Este e-mail não precisa ser reaberto.", 409, { requestId });
  }
  if (draft.status === "sending" && Date.now() - new Date(draft.updated_at).getTime() < 5 * 60_000) {
    return fail("state_conflict", "Aguarde alguns minutos para conferir o resultado do envio.", 409, { requestId });
  }
  const { data, error } = await admin.from("commercial_email_drafts")
    .update({ status: "pending", approved_by_user_id: null, approved_at: null, last_error: null })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", draft.status)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível reabrir o e-mail.", 500, { requestId });
  if (!data) return fail("state_conflict", "O estado do e-mail mudou. Atualize a tela.", 409, { requestId });
  void audit({
    action: "commercial_email.reopened_after_manual_check",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "commercial_email_draft",
    resourceId: id,
    requestId,
  });
  return ok({ status: "pending" }, { requestId });
}
