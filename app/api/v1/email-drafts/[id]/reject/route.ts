import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_drafts" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "E-mail inválido.", 422, { requestId });
  const { data, error } = await createAdminClient()
    .from("commercial_email_drafts")
    .update({ status: "rejected" })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível descartar o e-mail.", 500, { requestId });
  if (!data) return fail("state_conflict", "Este e-mail já foi processado.", 409, { requestId });
  void audit({
    action: "commercial_email.rejected",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "commercial_email_draft",
    resourceId: id,
    requestId,
  });
  return ok({ status: "rejected" }, { requestId });
}
