import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { saoDaEquipe } from "@/lib/empresas/equipe";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  CICLOS_DA_EMPRESA,
  COLUNAS_DA_EMPRESA,
  chaveDoNome,
  empresaCreateSchema,
} from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function escaparLike(texto: string): string {
  return texto.replace(/[%_\\]/g, "\\$&");
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "customer_accounts" });
  if (!authz.ok) return authz.response;

  const params = new URL(req.url).searchParams;
  const busca = params.get("search")?.trim();
  const ciclo = params.get("lifecycle");
  if (busca && busca.length > 80) return fail("validation_failed", "Busca muito longa.", 422, { requestId });
  if (ciclo && !(CICLOS_DA_EMPRESA as readonly string[]).includes(ciclo)) {
    return fail("validation_failed", "Ciclo de vida inválido.", 422, { requestId });
  }

  const supabase = await createClient();
  let query = supabase
    .from("customer_accounts")
    .select(COLUNAS_DA_EMPRESA)
    .eq("organization_id", authz.org.orgId)
    .order("name", { ascending: true })
    .limit(500);
  if (ciclo) query = query.eq("lifecycle", ciclo);
  if (busca) {
    const termo = escaparLike(busca);
    query = query.or(`name.ilike.%${termo}%,legale_code.ilike.%${termo}%,name_key.ilike.%${escaparLike(chaveDoNome(busca))}%`);
  }
  const { data, error } = await query;
  if (error) return fail("internal_error", "Erro ao listar as empresas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "customer_accounts" });
  if (!authz.ok) return authz.response;

  const parsed = empresaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira os dados da empresa.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  if (
    !(await saoDaEquipe(authz.org.orgId, [
      parsed.data.commercial_owner_user_id,
      parsed.data.cs_owner_user_id,
    ]))
  ) {
    return fail("validation_failed", "O responsável não faz parte da equipe.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_accounts")
    .insert({
      ...parsed.data,
      name_key: chaveDoNome(parsed.data.name),
      organization_id: authz.org.orgId,
      created_by_user_id: authz.user.id,
    })
    .select(COLUNAS_DA_EMPRESA)
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Já existe uma empresa com este código do Legale.", 409, { requestId });
    }
    if (error.code === "23503") {
      return fail("validation_failed", "Responsável inválido.", 422, { requestId });
    }
    return fail("internal_error", "Erro ao salvar a empresa.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "customer_account.created",
    resourceType: "customer_accounts",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
  });

  return ok(data, { requestId, status: 201 });
}
