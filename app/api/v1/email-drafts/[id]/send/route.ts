import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { OutlookPreflightError, enviarPeloOutlook } from "@/lib/email/outlook/send";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body_text: z.string().trim().min(1).max(6000),
  connection_id: z.uuid(),
}).strict();

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
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Revise o assunto, o texto e a conta de envio.", 422, { requestId });
  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("commercial_email_drafts")
    .select("id, contact_id, to_email, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!draft) return fail("not_found", "E-mail não encontrado.", 404, { requestId });
  if (draft.status !== "pending") return fail("state_conflict", "Este e-mail não está aguardando aprovação.", 409, { requestId });

  if (!draft.contact_id) {
    return fail("validation_failed", "O contato deste e-mail não está mais disponível.", 422, { requestId });
  }
  const { data: contact } = await admin
    .from("contacts")
    .select("email, is_blocked, is_anonymized, is_merged_into, consent")
    .eq("organization_id", authz.org.orgId)
    .eq("id", draft.contact_id)
    .maybeSingle();
  const consent = contact?.consent as { marketing?: { declined_at?: string | null } } | null;
  if (!contact || contact.email?.toLowerCase() !== draft.to_email.toLowerCase() || contact.is_blocked || contact.is_anonymized || contact.is_merged_into || consent?.marketing?.declined_at) {
    return fail("validation_failed", "O contato mudou ou não pode mais receber este e-mail. Revise o cadastro.", 422, { requestId });
  }

  const { data: connection } = await admin
    .from("commercial_email_connections")
    .select("id, organization_id, account_email, send_as_email, refresh_token_encrypted, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.connection_id)
    .maybeSingle();
  if (!connection || connection.status !== "connected") {
    return fail("validation_failed", "Conecte uma conta Outlook ativa antes de aprovar.", 422, { requestId });
  }

  // Compare-and-set: um segundo clique não consegue disparar uma segunda mensagem.
  const { data: claimed, error: claimError } = await admin
    .from("commercial_email_drafts")
    .update({
      status: "sending",
      subject: parsed.data.subject,
      body_text: parsed.data.body_text,
      connection_id: connection.id,
      approved_by_user_id: authz.user.id,
      approved_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) return fail("internal_error", "Não foi possível aprovar o e-mail.", 500, { requestId });
  if (!claimed) return fail("state_conflict", "Este e-mail já foi processado.", 409, { requestId });

  try {
    const result = await enviarPeloOutlook(admin, connection, {
      to_email: draft.to_email,
      subject: parsed.data.subject,
      body_text: parsed.data.body_text,
    });
    const next = result.accepted ? "submitted" : result.uncertain ? "needs_review" : "pending";
    const { error: saveError } = await admin.from("commercial_email_drafts").update({
      status: next,
      submitted_at: result.accepted ? new Date().toISOString() : null,
      last_error: result.reason ?? null,
    }).eq("organization_id", authz.org.orgId).eq("id", id);
    void audit({
      action: result.accepted ? "commercial_email.submitted" : "commercial_email.send_failed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "commercial_email_draft",
      resourceId: id,
      requestId,
      metadata: { result: result.reason ?? "accepted" },
    });
    if (saveError) return fail("internal_error", "O resultado do Outlook não foi registrado. Confira a pasta Enviados antes de tentar novamente.", 500, { requestId });
    if (!result.accepted) return fail("internal_error", result.uncertain
      ? "Não foi possível confirmar o envio. Confira a pasta Enviados antes de tentar novamente."
      : "O Outlook recusou o envio. Revise a conexão e tente novamente.", 502, { requestId });
    return ok({ status: "submitted" }, { requestId });
  } catch (error) {
    const preflight = error instanceof OutlookPreflightError;
    await admin.from("commercial_email_drafts").update({
      status: preflight ? "pending" : "needs_review",
      last_error: preflight
        ? "Não foi possível renovar a conexão Outlook. Reconecte a conta."
        : "Resultado incerto: confira a pasta Enviados antes de tentar novamente.",
    }).eq("organization_id", authz.org.orgId).eq("id", id);
    void audit({
      action: "commercial_email.send_failed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "commercial_email_draft",
      resourceId: id,
      requestId,
      metadata: { preflight },
    });
    return fail("internal_error", preflight
      ? "Reconecte o Outlook e tente novamente."
      : "Não foi possível confirmar o resultado do envio. Confira a pasta Enviados.", 502, { requestId });
  }
}
