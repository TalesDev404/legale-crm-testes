/**
 * Configura uma organização com os funis do Legale (Comercial e Implantação).
 *
 * Idempotente: procura cada funil e cada etapa pelo slug e atualiza o que já
 * existe; nunca apaga etapa (pode haver negócio nela). O funil "Pedidos" que o
 * gatilho de organização nova semeia é arquivado SÓ se estiver vazio.
 *
 * Uso:
 *   npx tsx scripts/legale-configurar-organizacao.ts --org <uuid ou slug da organização>
 *   npx tsx scripts/legale-configurar-organizacao.ts --org <...> --simular   (só mostra o que faria)
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local.
 */
import { createClient } from "@supabase/supabase-js";

import { FUNIS_DO_LEGALE, type FunilDoLegale } from "../lib/empresas/funis-do-legale";
import { carregarEnvLocal } from "../scripts/lib/env-de-teste";

const env = carregarEnvLocal();
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE || !CHAVE) {
  throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local");
}
const admin = createClient(URL_SUPABASE, CHAVE, { auth: { persistSession: false } });

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SIMULAR = process.argv.includes("--simular");

/** Identidade visual do Legale (a mesma da tela de login). */
const MARCA_DO_LEGALE = {
  app_name: "CRM Legale",
  logo_url: "/brand/legale-logo-oficial.png",
  accent_hex: "#8e24fe",
  show_powered_by: false,
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolverOrganizacao(chave: string): Promise<{ id: string; name: string }> {
  const query = admin.from("organizations").select("id,name:display_name");
  const { data, error } = UUID.test(chave) ? await query.eq("id", chave).maybeSingle() : await query.eq("slug", chave).maybeSingle();
  if (error) throw new Error(`Erro ao ler a organização: ${error.message}`);
  if (!data) throw new Error(`Organização "${chave}" não encontrada.`);
  return data as { id: string; name: string };
}

async function aplicarFunil(orgId: string, funil: FunilDoLegale, posicao: number): Promise<string> {
  const { data: existente } = await admin
    .from("crm_pipelines")
    .select("id,settings")
    .eq("organization_id", orgId)
    .eq("slug", funil.slug)
    .maybeSingle();

  const settings = {
    ...((existente?.settings as Record<string, unknown> | null) ?? {}),
    fields: funil.campos,
    lost_reasons: funil.motivosDePerda,
  };
  const linha = {
    organization_id: orgId,
    name: funil.nome,
    slug: funil.slug,
    description: funil.descricao,
    vocabulary: funil.vocabulario,
    settings,
    position: posicao,
    is_archived: false,
  };

  let pipelineId: string;
  if (existente) {
    pipelineId = existente.id as string;
    console.info(`  • funil "${funil.nome}" já existe — atualizando`);
    if (!SIMULAR) {
      const { error } = await admin.from("crm_pipelines").update(linha).eq("organization_id", orgId).eq("id", pipelineId);
      if (error) throw new Error(`funil ${funil.slug}: ${error.message}`);
    }
  } else {
    console.info(`  • criando funil "${funil.nome}"`);
    if (SIMULAR) return "simulado";
    const { data, error } = await admin.from("crm_pipelines").insert(linha).select("id").single();
    if (error) throw new Error(`funil ${funil.slug}: ${error.message}`);
    pipelineId = data.id as string;
  }

  const { data: etapasAtuais } = await admin
    .from("crm_stages")
    .select("id,slug")
    .eq("organization_id", orgId)
    .eq("pipeline_id", pipelineId);
  const porSlug = new Map(((etapasAtuais ?? []) as { id: string; slug: string }[]).map((e) => [e.slug, e.id]));

  for (const [i, etapa] of funil.etapas.entries()) {
    const dados = {
      organization_id: orgId,
      pipeline_id: pipelineId,
      name: etapa.nome,
      slug: etapa.slug,
      description: etapa.descricao,
      position: (i + 1) * 1000,
      color: etapa.cor,
      is_won: etapa.passo === "won",
      is_lost: etapa.passo === "lost",
      is_archived: false,
      expected_duration_hours: etapa.prazoHoras,
      win_probability: etapa.chance ?? null,
      agent_stage_hint: etapa.passo,
    };
    const id = porSlug.get(etapa.slug);
    console.info(`    - ${id ? "atualizando" : "criando"} etapa "${etapa.nome}"`);
    if (SIMULAR) continue;
    const { error } = id
      ? await admin.from("crm_stages").update(dados).eq("organization_id", orgId).eq("id", id)
      : await admin.from("crm_stages").insert(dados);
    if (error) throw new Error(`etapa ${etapa.slug}: ${error.message}`);
  }
  return pipelineId;
}

async function main() {
  const chave = argumento("org");
  if (!chave) throw new Error("Informe --org <uuid ou slug>");
  const org = await resolverOrganizacao(chave);
  console.info(`Organização: ${org.name} (${org.id})${SIMULAR ? " — SIMULAÇÃO" : ""}`);

  const ids: Record<string, string> = {};
  for (const [i, funil] of FUNIS_DO_LEGALE.entries()) {
    ids[funil.slug] = await aplicarFunil(org.id, funil, (i + 1) * 1000);
  }

  // O funil padrão: primeiro tira a marca de todos (índice único parcial),
  // depois põe no comercial.
  const padrao = FUNIS_DO_LEGALE.find((f) => f.padrao);
  if (padrao && !SIMULAR) {
    await admin.from("crm_pipelines").update({ is_default: false }).eq("organization_id", org.id).neq("id", ids[padrao.slug]);
    await admin.from("crm_pipelines").update({ is_default: true }).eq("organization_id", org.id).eq("id", ids[padrao.slug]);
    console.info(`  • "${padrao.nome}" é o funil padrão`);
  }

  const { data: pedidos } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", "pedidos")
    .eq("is_archived", false)
    .maybeSingle();
  if (pedidos) {
    const { count } = await admin
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("pipeline_id", pedidos.id);
    if ((count ?? 0) === 0) {
      console.info('  • arquivando o funil "Pedidos" (vazio, veio do padrão de e-commerce)');
      if (!SIMULAR) {
        await admin
          .from("crm_pipelines")
          .update({ is_archived: true, is_default: false })
          .eq("organization_id", org.id)
          .eq("id", pedidos.id);
      }
    } else {
      console.info(`  • funil "Pedidos" tem ${count} negócio(s) — mantido`);
    }
  }

  // A marca da instalação é a do Legale: nome, logo e o roxo da identidade.
  // `platform_branding` é linha única (id = 1); o upsert é idempotente.
  console.info(`  • marca da instalação: ${MARCA_DO_LEGALE.app_name}`);
  if (!SIMULAR) {
    const { error } = await admin
      .from("platform_branding")
      .upsert({ id: 1, ...MARCA_DO_LEGALE, seeded_from_env: false, updated_at: new Date().toISOString() });
    if (error) throw new Error(`platform_branding: ${error.message}`);
  }

  // O assistente de boas-vindas do produto base (WhatsApp, agente de IA,
  // quadro de nicho) não se aplica ao Legale: a configuração é este script.
  // Marca a organização como configurada só se ainda não estiver.
  const { data: orgAtual } = await admin.from("organizations").select("onboarded_at").eq("id", org.id).maybeSingle();
  if (!orgAtual?.onboarded_at) {
    console.info("  • marcando a organização como configurada (pula o assistente de WhatsApp/IA)");
    if (!SIMULAR) {
      const { error } = await admin
        .from("organizations")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", org.id)
        .is("onboarded_at", null);
      if (error) throw new Error(`onboarded_at: ${error.message}`);
    }
  }

  console.info("✅ Pronto.");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
