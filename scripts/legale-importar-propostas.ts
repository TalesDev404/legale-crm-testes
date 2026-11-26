/**
 * Importa as propostas da ferramenta antiga (legalecrm.vercel.app) para
 * `commercial_proposals`, ligadas à empresa, ao negócio do funil comercial e ao
 * contato.
 *
 * Entrada: a aba "Propostas" do `propostas.xlsx` exportado da ferramenta antiga,
 * convertida em JSON (lista de linhas) — o CRM não carrega biblioteca de Excel só
 * para isso. O painel comercial já tem o `xlsx`:
 *
 *   node -e "const X=require('./painel-comercial/tools/node_modules/xlsx');const w=X.readFile('propostas.xlsx');
 *     require('fs').writeFileSync('propostas.json',JSON.stringify(X.utils.sheet_to_json(w.Sheets.Propostas,{header:1,raw:false,defval:''})))"
 *
 *   npx tsx scripts/legale-importar-propostas.ts --org legale --arquivo <propostas.json> [--simular]
 *
 * Os dados são de clientes e NUNCA entram no git.
 *
 * A exportação só traz os TOTAIS (mensalidade e monitoramento), não os itens.
 * Cada proposta vira, então, até dois itens: "Mensalidade (proposta da
 * ferramenta antiga)" e "Monitoramento de processos". O detalhamento continua no
 * link da ferramenta antiga.
 *
 * Datas: a ferramenta antiga grava em "Data de Emissão" a data da ÚLTIMA
 * EDIÇÃO; em parte das propostas a validade é anterior a ela. Nesses casos a
 * emissão passa a ser a menor das duas (o banco exige validade >= emissão) e a
 * data original fica nas observações.
 *
 * Idempotente: proposta é achada por empresa + validade (o valor muda quando a
 * proposta é editada; a validade quase nunca); rodar de
 * novo atualiza status e valores. Empresa que não existe vira prospect.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { chaveDoNome, codigoWDoNome } from "../lib/schemas/empresas";
import { carregarEnvLocal } from "./lib/env-de-teste";

const env = carregarEnvLocal();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SIMULAR = process.argv.includes("--simular");

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const limpo = (v: unknown) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t && !/^(na|n\/a|-|—)$/i.test(t) ? t : "";
};
function data(v: unknown): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpo(v));
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const br = (iso: string) => iso.split("-").reverse().join("/");
/** "995.45" ou "R$ 1.004,52" → centavos. */
function centavos(v: unknown): number {
  let t = limpo(v).replace(/[^\d,.]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Os mesmos apelidos do importador da planilha — a mesma empresa com nomes diferentes. */
const APELIDOS: [RegExp, string][] = [
  [/moore/, "moore brasil"], [/mrtc|marques rosado/, "mrtc"], [/faiani|fbl /, "faiani borges e lopes"],
  [/diego ferreira/, "diego ferreira"], [/h[oö]fling/, "hofling"], [/rivaben/, "rivaben"], [/grupo blb/, "grupo blb"],
  [/r ?& ?o urbanismo|ro urbanismo/, "r&o urbanismo"], [/andr[eé]a ara[uú]jo/, "andrea araujo"],
  [/thiago (humberto|alves)/, "thiago alves"], [/sousa farias/, "sousa farias"],
  [/del ?mastre|delbianco/, "delbianco brentini zocollaro"], [/arteb/, "arteb"], [/bertuso/, "bertuso galicia"],
  [/netafim/, "netafim"], [/r[eé]gulus/, "eregulus"], [/adianta ?jus/, "adianta jus"], [/okubo/, "okubo"],
  [/mazzotta/, "mazzotta"], [/emerson silva/, "emerson silva"], [/ferreira donato/, "ferreira donato"],
  [/takahashi/, "takahashi mizumukai"], [/zacchi/, "zacchi e freire"], [/albaugh/, "albaugh"],
  [/matos zolin/, "matos zolin e macedo"], [/alves,? ricci/, "alves ricci ribeiro"], [/misaque/, "misaque barros"],
  [/fornari/, "fornari"], [/edna cristina/, "edna cristina"], [/de paula/, "grupo de paula"],
  [/del vecchio/, "del vecchio borges"], [/dvb/, "dvb"], [/danilo nunes/, "danilo nunes"], [/brn/, "brn bernardino"],
  [/vilja/, "vilja"], [/^sso\b|action process/, "sso medicina do trabalho"], [/jos[eé] augusto/, "jose augusto"],
  [/pazzoto/, "pazzoto pisciotta belo"], [/fiuza/, "fiuza day care"], [/prisma$|^prisma/, "prisma"],
  [/tortul|simone salom/, "tortul"], [/figueiredo leite/, "figueiredo leite vaz e salmazi"],
  [/lourenço|lourenco/, "lourenco"], [/petrenas/, "petrenas duarte e lencione"], [/rocha advogados/, "rocha"],
  [/santos e marinho/, "santos e marinho"], [/felipe devecchi/, "felipe devecchi daige"], [/bonato/, "bonato e bonato"],
  [/colombo/, "colombo agroindustria"], [/sergio menezes/, "sergio menezes"], [/biffi/, "aguinaldo biffi"],
  [/laure/, "laure defina"], [/rocha,? leite/, "rocha leite"], [/bianco & martineti|bem - bianco/, "bianco martineti"],
  [/acirp/, "acirp"], [/chiappa/, "chiappa"], [/colucci/, "colucci"], [/oliveira e karam/, "oliveira e karam"],
  [/f ?& ?v fuzatti/, "fuzatti e vidal"], [/ddtax/, "ddtax"], [/helena cassanti/, "helena cassanti fiori"],
];
function chaveDeUnificacao(nome: string): string {
  const cru = semAcento(nome).replace(/\s+/g, " ");
  for (const [re, chave] of APELIDOS) if (re.test(cru)) return chave;
  return chaveDoNome(nome);
}

const STATUS: Record<string, "rascunho" | "enviada" | "aprovada" | "recusada"> = {
  inicial: "rascunho",
  enviado: "enviada",
  enviada: "enviada",
  "em analise": "enviada",
  aprovada: "aprovada",
  aprovado: "aprovada",
  "nao aprovada": "recusada",
  recusada: "recusada",
};

/** Empresa de agro, indústria etc. é departamento jurídico; o resto, escritório. */
function tipoDeCliente(nome: string): "escritorio" | "departamento_juridico" {
  const n = semAcento(nome);
  if (/advoga|advocacia|\badv\b|juridic|soc\.? de|sociedade|law|consultoria/.test(n)) return "escritorio";
  if (/\b(s\.?a\.?|ltda|agro|industria|unimed|cooperativa|grupo|brasil)\b/.test(n)) return "departamento_juridico";
  return "escritorio";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const arquivo = argumento("arquivo");
  const chaveOrg = argumento("org");
  if (!arquivo || !chaveOrg) throw new Error("Uso: --org <slug|uuid> --arquivo <propostas.json> [--simular]");

  const q = admin.from("organizations").select("id");
  const { data: org } = UUID.test(chaveOrg) ? await q.eq("id", chaveOrg).maybeSingle() : await q.eq("slug", chaveOrg).maybeSingle();
  if (!org) throw new Error(`Organização "${chaveOrg}" não encontrada.`);
  const orgId = org.id as string;

  const todas = JSON.parse(readFileSync(arquivo, "utf8")) as string[][];
  if (!Array.isArray(todas) || !/cliente/i.test(String(todas[0]?.[1]))) {
    throw new Error('O JSON não parece a aba "Propostas" (2ª coluna do cabeçalho deveria ser "Cliente").');
  }
  const linhas = todas.slice(1).filter((r) => limpo(r[1]));
  console.info(`${linhas.length} propostas no arquivo${SIMULAR ? " — SIMULAÇÃO (nada é gravado)" : ""}`);

  // Empresas, negócios e contatos que já existem.
  const { data: empresas } = await admin
    .from("customer_accounts").select("id,name,legale_code,client_kind,source").eq("organization_id", orgId);
  const porCodigo = new Map<string, { id: string; client_kind: string | null; source: string | null }>();
  const porChave = new Map<string, { id: string; client_kind: string | null; source: string | null }>();
  for (const e of empresas ?? []) {
    const info = { id: e.id as string, client_kind: e.client_kind as string | null, source: e.source as string | null };
    if (e.legale_code) porCodigo.set(e.legale_code as string, info);
    porChave.set(chaveDeUnificacao(e.name as string), info);
  }
  const { data: negocios } = await admin
    .from("crm_leads").select("id,account_id,updated_at").eq("organization_id", orgId).not("account_id", "is", null)
    .order("updated_at", { ascending: false });
  const negocioDaEmpresa = new Map<string, string>();
  for (const n of negocios ?? []) if (!negocioDaEmpresa.has(n.account_id as string)) negocioDaEmpresa.set(n.account_id as string, n.id as string);
  const { data: contatos } = await admin
    .from("contacts").select("id,account_id,name").eq("organization_id", orgId).not("account_id", "is", null);

  const contagem = { criadas: 0, atualizadas: 0, empresasNovas: 0, datasAjustadas: 0, semValor: 0 };
  const empresasNovas: string[] = [];

  for (const r of linhas) {
    const [origem, cliente, contato, , emissaoTxt, validadeTxt, mensalTxt, monitTxt, statusTxt, prob, obs] = r.map(limpo);
    const emissaoOriginal = data(emissaoTxt) ?? new Date().toISOString().slice(0, 10);
    const validade = data(validadeTxt) ?? emissaoOriginal;
    const emissao = validade < emissaoOriginal ? validade : emissaoOriginal;
    if (emissao !== emissaoOriginal) contagem.datasAjustadas++;

    // Empresa: acha ou cria como prospect.
    const codigo = codigoWDoNome(cliente);
    const chave = chaveDeUnificacao(cliente);
    let empresa = (codigo && porCodigo.get(codigo)) || porChave.get(chave);
    if (!empresa) {
      contagem.empresasNovas++;
      empresasNovas.push(cliente);
      const nova = {
        organization_id: orgId,
        name: cliente.replace(/\s*\(\s*w\s*\d+\s*\)\s*/i, " ").trim(),
        name_key: chaveDoNome(cliente),
        legale_code: codigo,
        lifecycle: "prospect",
        client_kind: tipoDeCliente(cliente),
        source: origem || null,
        notes: "Empresa criada a partir de uma proposta da ferramenta antiga.",
      };
      if (SIMULAR) empresa = { id: `simulado-${chave}`, client_kind: nova.client_kind, source: nova.source };
      else {
        const { data: criada, error } = await admin.from("customer_accounts").insert(nova).select("id").single();
        if (error) throw new Error(`empresa ${cliente}: ${error.message}`);
        empresa = { id: criada.id as string, client_kind: nova.client_kind, source: nova.source };
      }
      porChave.set(chave, empresa);
      if (codigo) porCodigo.set(codigo, empresa);
    } else if (!SIMULAR && !empresa.source && origem) {
      await admin.from("customer_accounts").update({ source: origem }).eq("organization_id", orgId).eq("id", empresa.id);
      empresa.source = origem;
    }

    const mensal = centavos(mensalTxt);
    const monit = centavos(monitTxt);
    const itens = [
      ...(mensal > 0 || monit === 0
        ? [{
            codigo: "mensalidade_legado",
            nome: "Mensalidade (proposta da ferramenta antiga)",
            descricao: mensal > 0 ? "Total mensal da proposta original; o detalhamento por módulo está na ferramenta antiga." : "Valor não informado na ferramenta antiga.",
            quantidade: 1,
            valor_unitario_cents: mensal,
            total_cents: mensal,
            cobranca: "mensal",
            categoria: "modulo",
          }]
        : []),
      ...(monit > 0
        ? [{
            codigo: "monitoramento_legado",
            nome: "Monitoramento de processos",
            descricao: "Total mensal de monitoramento da proposta original.",
            quantidade: 1,
            valor_unitario_cents: monit,
            total_cents: monit,
            cobranca: "mensal",
            categoria: "monitoramento",
          }]
        : []),
    ];
    if (mensal + monit === 0) contagem.semValor++;

    const notas = [
      "Importada da ferramenta antiga de propostas.",
      origem && `Origem: ${origem}.`,
      prob && `Probabilidade: ${prob}.`,
      emissao !== emissaoOriginal && `Data de emissão na ferramenta antiga: ${br(emissaoOriginal)} (provavelmente a última edição).`,
      obs && `Observações: ${obs}`,
    ].filter(Boolean).join("\n");

    const contatoId = contato
      ? (contatos ?? []).find((c) => c.account_id === empresa!.id && semAcento(String(c.name ?? "")) === semAcento(contato))?.id ?? null
      : null;

    const proposta = {
      organization_id: orgId,
      account_id: SIMULAR ? null : empresa.id,
      lead_id: negocioDaEmpresa.get(empresa.id) ?? null,
      contact_id: contatoId,
      client_name: cliente.replace(/\s*\(\s*w\s*\d+\s*\)\s*/i, " ").trim(),
      client_kind: (empresa.client_kind as "escritorio" | "departamento_juridico" | null) ?? tipoDeCliente(cliente),
      recipient_name: contato || null,
      status: STATUS[semAcento(statusTxt)] ?? "enviada",
      issue_date: emissao,
      valid_until: validade,
      monthly_total_cents: mensal + monit,
      activation_total_cents: 0,
      items: itens,
      notes: notas,
    };

    if (SIMULAR) {
      contagem.criadas++;
      continue;
    }
    const { data: ja } = await admin
      .from("commercial_proposals").select("id")
      .eq("organization_id", orgId).eq("account_id", empresa.id).eq("valid_until", validade)
      .like("notes", "Importada da ferramenta antiga%")
      .limit(1).maybeSingle();
    const { error } = ja
      ? await admin.from("commercial_proposals").update(proposta).eq("organization_id", orgId).eq("id", ja.id)
      : await admin.from("commercial_proposals").insert(proposta);
    if (error) throw new Error(`proposta ${cliente} (${emissaoTxt}): ${error.message}`);
    if (ja) contagem.atualizadas++;
    else contagem.criadas++;
  }

  console.info("\nResumo:");
  for (const [k, v] of Object.entries(contagem)) console.info(`  ${k}: ${v}`);
  if (empresasNovas.length) console.info(`\nEmpresas criadas como prospect (${empresasNovas.length}):\n  ${empresasNovas.join("\n  ")}`);
  console.info(SIMULAR ? "\n(simulação — nada foi gravado)" : "\n✅ Propostas importadas.");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
