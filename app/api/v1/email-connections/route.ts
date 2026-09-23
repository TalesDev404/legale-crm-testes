import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { outlookConfig } from "@/lib/email/outlook/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_connections" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("commercial_email_connections")
    .select("id, account_email, account_name, send_as_email, status, connected_by_user_id, connected_at")
    .eq("organization_id", authz.org.orgId)
    .order("connected_at", { ascending: false });
  if (error) return fail("internal_error", "Não foi possível carregar as contas de e-mail.", 500, { requestId });
  return ok({ configured: Boolean(outlookConfig()), connections: data ?? [] }, { requestId });
}
