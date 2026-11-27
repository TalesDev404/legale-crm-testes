import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { MODULOS_DO_LEGALE } from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpo = z.object({ modulo: z.enum(MODULOS_DO_LEGALE.map((m) => m.codigo) as [string, ...string[]]) });

/**
 * Cria, a partir do mapa de módulos da ficha, o negócio de upsell de um módulo
 * que a empresa ainda não contratou. Entra no funil padrão (o comercial), na
 * primeira etapa, já ligado à empresa, com o módulo em "Módulos de interesse" e
 * origem "Cliente da base (upsell)" — quem abre o card sabe de onde ele veio.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", "Empresa não encontrada.", 404, { requestId });

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Módulo desconhecido.", 422, { requestId });
  const modulo = MODULOS_DO_LEGALE.find((m) => m.codigo === parsed.data.modulo)!;

  const org = authz.org.orgId;
  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("customer_accounts")
    .select("id,name,commercial_owner_user_id,contracted_modules")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (!empresa) return fail("not_found", "Empresa não encontrada.", 404, { requestId });
  if ((empresa.contracted_modules as string[]).includes(modulo.codigo)) {
    return fail("conflict", "A empresa já tem este módulo contratado.", 409, { requestId });
  }

  const { data: funil } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", org)
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();
  if (!funil) return fail("not_found", "Nenhum funil padrão configurado.", 404, { requestId });

  const { data: etapa } = await supabase
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org)
    .eq("pipeline_id", funil.id)
    .eq("is_archived", false)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!etapa) return fail("not_found", "O funil padrão não tem etapa aberta.", 404, { requestId });

  const { data: lead, error } = await supabase
    .from("crm_leads")
    .insert({
      organization_id: org,
      pipeline_id: funil.id,
      stage_id: etapa.id,
      account_id: id,
      title: `Upsell ${modulo.nome} · ${empresa.name}`.slice(0, 200),
      status: "open",
      currency: "BRL",
      owner_user_id: (empresa.commercial_owner_user_id as string | null) ?? authz.user.id,
      source: "upsell",
      custom_fields: { modulos_interesse: [modulo.codigo], origem: "Cliente da base (upsell)" },
      created_by_user_id: authz.user.id,
    })
    .select("id")
    .single();
  if (error || !lead) return fail("internal_error", "Erro ao criar o negócio.", 500, { requestId });

  await audit({
    organizationId: org,
    actorUserId: authz.user.id,
    action: "customer_account.upsell_created",
    resourceType: "crm_leads",
    resourceId: lead.id,
    requestId,
    metadata: { account_id: id, modulo: modulo.codigo },
  });

  return ok({ id: lead.id }, { requestId, status: 201 });
}
