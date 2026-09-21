import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  catalogoComercialEfetivo,
  precoDoCatalogo,
  type ItemDoCatalogo,
} from "@/lib/schemas/proposta-catalogo";
import { COLUNAS_DA_PROPOSTA, propostaCreateSchema } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_proposals" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_proposals")
    .select(COLUNAS_DA_PROPOSTA)
    .eq("organization_id", authz.org.orgId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return fail("internal_error", "Erro ao listar as propostas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "commercial_proposals" });
  if (!authz.ok) return authz.response;

  const parsed = propostaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira os dados da proposta.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data: catalogRows, error: catalogError } = await supabase
    .from("proposal_catalog_items")
    .select(
      "codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,ativo,ordem",
    )
    .eq("organization_id", authz.org.orgId)
    .eq("ativo", true);
  if (catalogError)
    return fail("internal_error", "Erro ao conferir o catálogo comercial.", 500, { requestId });

  const effectiveCatalog = catalogoComercialEfetivo(catalogRows as ItemDoCatalogo[] | null);
  const catalogByCode = new Map(effectiveCatalog.map((item) => [item.codigo, item]));
  const specialCodes = new Set(["ativacao"]);
  const itensConferidos = parsed.data.items.map((item) => {
    let unitario = item.valor_unitario_cents;
    const isSetup = item.codigo.endsWith("_setup");
    const catalogCode = isSetup ? item.codigo.slice(0, -6) : item.codigo;
    const catalogItem = catalogByCode.get(catalogCode);
    const primeiraFaixa = catalogItem?.faixas_preco[0];
    if (!specialCodes.has(item.codigo) && !catalogItem) unitario = -1;
    if (
      catalogItem &&
      !isSetup &&
      (catalogItem.categoria === "usuario" ||
        catalogItem.categoria === "migracao" ||
        catalogItem.faixas_preco.length > 0)
    )
      unitario = precoDoCatalogo(catalogItem, item.quantidade, parsed.data.client_kind);
    if (primeiraFaixa && item.quantidade < primeiraFaixa.quantidade_minima) unitario = -1;
    if (catalogItem && isSetup) unitario = catalogItem.setup_cents;
    return {
      ...item,
      unidade: catalogItem?.unidade ?? item.unidade,
      valor_unitario_cents: unitario,
      total_cents: unitario * item.quantidade,
    };
  });
  if (itensConferidos.some((item) => item.valor_unitario_cents < 0)) {
    return fail(
      "validation_failed",
      "A proposta contém um item desconhecido ou abaixo da quantidade mínima.",
      422,
      {
        requestId,
      },
    );
  }

  const mensal = itensConferidos
    .filter((item) => item.cobranca === "mensal")
    .reduce((total, item) => total + item.total_cents, 0);
  const ativacao = itensConferidos
    .filter((item) => item.cobranca === "unica")
    .reduce((total, item) => total + item.total_cents, 0);

  if (parsed.data.contact_id) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", parsed.data.contact_id)
      .is("is_merged_into", null)
      .maybeSingle();
    if (!contato)
      return fail("validation_failed", "O contato não pertence à organização ativa.", 422, {
        requestId,
      });
  }
  const { data, error } = await supabase
    .from("commercial_proposals")
    .insert({
      ...parsed.data,
      items: itensConferidos,
      contact_id: parsed.data.contact_id || null,
      recipient_name: parsed.data.recipient_name || null,
      recipient_email: parsed.data.recipient_email || null,
      notes: parsed.data.notes || null,
      payment_terms: parsed.data.payment_terms || null,
      organization_id: authz.org.orgId,
      created_by: authz.user.id,
      currency: "BRL",
      monthly_total_cents: mensal,
      activation_total_cents: ativacao,
    })
    .select(COLUNAS_DA_PROPOSTA)
    .single();

  if (error) return fail("internal_error", "Erro ao salvar a proposta.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "commercial_proposal.created",
    resourceType: "commercial_proposals",
    resourceId: (data as { id: string }).id,
    requestId,
  });

  return ok(data, { requestId, status: 201 });
}
