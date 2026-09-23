import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_drafts" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("commercial_email_drafts")
    .select("id, rule_id, lead_id, proposal_id, contact_id, to_email, subject, body_text, source, status, last_error, created_at, updated_at, approved_at, submitted_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail("internal_error", "Não foi possível carregar os e-mails.", 500, { requestId });
  return ok(data ?? [], { requestId });
}
