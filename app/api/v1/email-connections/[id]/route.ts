import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_connections" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Conta inválida.", 422, { requestId });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("commercial_email_connections")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!row) return fail("not_found", "Conta não encontrada.", 404, { requestId });
  const { error } = await admin
    .from("commercial_email_connections")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", "Não foi possível desconectar a conta.", 500, { requestId });
  void audit({
    action: "commercial_email.outlook_disconnected",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "commercial_email_connection",
    resourceId: id,
    requestId,
  });
  return ok({ disconnected: true }, { requestId });
}
