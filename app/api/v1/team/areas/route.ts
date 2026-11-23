import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { equipeDaOrganizacao, saoDaEquipe } from "@/lib/empresas/equipe";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { areasDoMembroSchema } from "@/lib/schemas/empresas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organization_member_areas" });
  if (!authz.ok) return authz.response;
  return ok(await equipeDaOrganizacao(authz.org.orgId), { requestId });
}

/**
 * Define as áreas de UMA pessoa (substitui o conjunto). Só admin: a área decide
 * de quem é a carteira, e a tabela não tem policy de escrita para
 * `authenticated` — a gravação vai pelo service role, com a organização vinda
 * do cookie validado e o alvo conferido como membro ativo dela.
 */
export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "organization_member_areas" });
  if (!authz.ok) return authz.response;
  if (!isServiceRoleConfigured()) {
    return fail("service_unavailable", "Configuração do servidor incompleta.", 503, { requestId });
  }

  const parsed = areasDoMembroSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Áreas inválidas.", 422, { requestId });
  if (!(await saoDaEquipe(authz.org.orgId, [parsed.data.user_id]))) {
    return fail("validation_failed", "A pessoa não faz parte da equipe.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { error: apagarErro } = await admin
    .from("organization_member_areas")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("user_id", parsed.data.user_id);
  if (apagarErro) return fail("internal_error", "Erro ao salvar as áreas.", 500, { requestId });

  const areas = [...new Set(parsed.data.areas)];
  if (areas.length > 0) {
    const { error } = await admin.from("organization_member_areas").insert(
      areas.map((area) => ({ organization_id: authz.org.orgId, user_id: parsed.data.user_id, area })),
    );
    if (error) return fail("internal_error", "Erro ao salvar as áreas.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "organization_member_area.updated",
    resourceType: "organization_member_areas",
    resourceId: parsed.data.user_id,
    requestId,
    bypassedRls: true,
    metadata: { areas },
  });

  return ok({ user_id: parsed.data.user_id, areas }, { requestId });
}
