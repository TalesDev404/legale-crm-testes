import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { saoDaEquipe } from "@/lib/empresas/equipe";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DA_EMPRESA, chaveDoNome, empresaPatchSchema } from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "customer_accounts" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_accounts")
    .select(COLUNAS_DA_EMPRESA)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao abrir a empresa.", 500, { requestId });
  if (!data) return fail("not_found", "Empresa não encontrada.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "customer_accounts" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  const bruto = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = empresaPatchSchema.safeParse(bruto);
  if (!bruto || !parsed.success) {
    return fail("validation_failed", "Confira os dados da empresa.", 422, {
      requestId,
      details: parsed.success ? undefined : (parsed.error.flatten().fieldErrors as Record<string, unknown>),
    });
  }

  // Só grava o que veio no corpo: o Zod 4 aplica `default` mesmo em campo
  // opcional, e um PATCH que mandou só o telefone não pode zerar o contrato.
  const enviados = new Set(Object.keys(bruto));
  const mudancas: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(parsed.data)) {
    if (enviados.has(chave)) mudancas[chave] = valor;
  }
  if (Object.keys(mudancas).length === 0) {
    return fail("validation_failed", "Nada para alterar.", 422, { requestId });
  }
  if (typeof mudancas.name === "string") mudancas.name_key = chaveDoNome(mudancas.name);
  if ("health_override" in mudancas) {
    if (mudancas.health_override) {
      mudancas.health_override_at = new Date().toISOString();
      mudancas.health_override_by_user_id = authz.user.id;
    } else {
      mudancas.health_override_reason = null;
      mudancas.health_override_at = null;
      mudancas.health_override_by_user_id = null;
    }
  }

  if (
    !(await saoDaEquipe(authz.org.orgId, [
      mudancas.commercial_owner_user_id as string | null | undefined,
      mudancas.cs_owner_user_id as string | null | undefined,
    ]))
  ) {
    return fail("validation_failed", "O responsável não faz parte da equipe.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_accounts")
    .update(mudancas)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS_DA_EMPRESA)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Já existe uma empresa com este código do Legale.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao salvar a empresa.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "customer_account.updated",
    resourceType: "customer_accounts",
    resourceId: id,
    requestId,
    metadata: { campos: Object.keys(mudancas) },
  });

  return ok(data, { requestId });
}
