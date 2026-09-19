import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  CATALOGO_DA_PROPOSTA,
  COLUNAS_DA_PROPOSTA,
  propostaCreateSchema,
  valorMonitoramento,
  valorUsuarioLimitado,
} from "@/lib/schemas/propostas";
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

  // Quantidades e faixas conhecidas são recalculadas no servidor. O valor de
  // cada módulo é informado pelo comercial enquanto não há tabela homologada.
  const codigosDosModulos = new Set<string>(CATALOGO_DA_PROPOSTA.map((item) => item.codigo));
  const itensConferidos = parsed.data.items.map((item) => {
    let unitario = item.valor_unitario_cents;
    if (item.categoria === "modulo" && !codigosDosModulos.has(item.codigo)) unitario = -1;
    if (item.categoria === "usuario" && item.codigo === "usuarios_limitados") unitario = valorUsuarioLimitado(item.quantidade);
    if (item.categoria === "monitoramento" && item.codigo === "monitoramento_processos") unitario = valorMonitoramento(item.quantidade);
    return { ...item, valor_unitario_cents: unitario, total_cents: unitario * item.quantidade };
  });
  if (itensConferidos.some((item) => item.valor_unitario_cents < 0)) {
    return fail("validation_failed", "A proposta contém um módulo desconhecido.", 422, { requestId });
  }

  const mensal = itensConferidos
    .filter((item) => item.cobranca === "mensal")
    .reduce((total, item) => total + item.total_cents, 0);
  const ativacao = itensConferidos
    .filter((item) => item.cobranca === "unica")
    .reduce((total, item) => total + item.total_cents, 0);

  const supabase = await createClient();
  if (parsed.data.contact_id) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", parsed.data.contact_id)
      .is("is_merged_into", null)
      .maybeSingle();
    if (!contato) return fail("validation_failed", "O contato não pertence à organização ativa.", 422, { requestId });
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
