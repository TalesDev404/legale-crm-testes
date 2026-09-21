import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  catalogoComercialSchema,
  CATALOGO_COMERCIAL_INICIAL,
} from "@/lib/schemas/proposta-catalogo";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "proposal_catalog_items" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposal_catalog_items")
    .select(
      "id,codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,ativo,ordem",
    )
    .eq("organization_id", authz.org.orgId)
    .order("ordem");
  if (error)
    return fail("internal_error", "Erro ao carregar o catálogo comercial.", 500, { requestId });
  return ok(data?.length ? data : CATALOGO_COMERCIAL_INICIAL, { requestId });
}

export async function PUT(req: NextRequest) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "proposal_catalog_items" });
  if (!authz.ok) return authz.response;
  const parsed = catalogoComercialSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Confira os itens do catálogo.", 422, { requestId });
  const supabase = await createClient();
  const linhas = parsed.data.itens.map(({ id: _id, ...item }) => ({
    ...item,
    organization_id: authz.org.orgId,
  }));
  const { data, error } = await supabase
    .from("proposal_catalog_items")
    .upsert(linhas, { onConflict: "organization_id,codigo" })
    .select(
      "id,codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,ativo,ordem",
    )
    .order("ordem");
  if (error)
    return fail("internal_error", "Erro ao salvar o catálogo comercial.", 500, { requestId });
  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "commercial_catalog.updated",
    resourceType: "proposal_catalog_items",
    requestId,
    metadata: { itens: linhas.length },
  });
  return ok(data ?? [], { requestId });
}
