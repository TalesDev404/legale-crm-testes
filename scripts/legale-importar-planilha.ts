/**
 * Importa a planilha "Controle de CRM e CS" para o CRM do Legale.
 *
 * Entrada: o JSON que sai do texto do conector Microsoft 365 (abas como listas
 * de linhas). Os dados de clientes NUNCA entram no git — o arquivo fica fora do
 * repositório e é passado por argumento.
 *
 *   npx tsx scripts/legale-importar-planilha.ts --org legale --arquivo <raw.json> [--simular]
 *
 * O que vira o quê:
 *   - CRM + Sucesso do Cliente → `customer_accounts` (unificadas pelo código W
 *     ou pelo nome comparável + apelidos conhecidos)
 *   - CRM → um negócio por empresa no funil "Comercial Legale" + contato
 *   - Sucesso do Cliente → contato principal
 *   - Histórico CRM / Histórico CS → `customer_account_activities` (source 'planilha')
 *   - Tarefas → `crm_tasks` ligadas à empresa
 *
 * Idempotente: empresas são achadas por código W / nome; negócios por
 * `external_id`; atividades por `external_id` (hash da linha); contatos por
 * e-mail; tarefas por empresa + título. Rodar de novo atualiza, não duplica.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { chaveDoNome, codigoWDoNome } from "../lib/schemas/empresas";
import { carregarEnvLocal } from "./lib/env-de-teste";

type Linha = string[];
type Planilha = Record<string, Linha[]>;

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

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Apelidos conhecidos (os mesmos do painel comercial): nomes diferentes da mesma empresa. */
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
  const cru = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  for (const [re, chave] of APELIDOS) if (re.test(cru)) return chave;
  return chaveDoNome(nome);
}

const limpo = (v: string | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t && !/^(na|n\/a|-|—)$/i.test(t) ? t : "";
};

/** "07/01/2026" → "2026-01-07"; qualquer outra coisa → null. */
function data(v: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpo(v));
  if (!m) return null;
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "R$ 1.004,52" → 100452. */
function centavos(v: string | undefined): number | null {
  const t = limpo(v).replace(/[^\d,.-]/g, "");
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Primeiro e-mail válido de "a@x.com , b@y.com". */
function email(v: string | undefined): string | null {
  const achado = limpo(v).match(/[^\s@,;/]+@[^\s@,;/]+\.[^\s@,;/]+/);
  return achado ? achado[0].toLowerCase() : null;
}

/** Telefone brasileiro → E.164 (+55...). Fora do padrão → null (fica só no texto). */
function telefoneE164(v: string | undefined): string | null {
  let d = limpo(v).split(/[\/,;]| e /)[0].replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? `+${d}` : null;
}

const booleano = (v: string | undefined) => /^(verdadeiro|true|sim|x)$/i.test(limpo(v));

function hash(...partes: string[]): string {
  return createHash("sha1").update(partes.join("|")).digest("hex").slice(0, 20);
}

const ETAPA_POR_NOME: Record<string, string> = {
  "": "novo_lead",
  "novo lead": "novo_lead",
  "contato feito": "contato_feito",
  "apresentacao agendada": "apresentacao_agendada",
  "apresentacao realizada": "apresentacao_realizada",
  "proposta enviada": "proposta_enviada",
  negociacao: "negociacao",
  "fechado ganho": "ganho",
  "fechado perdido": "perdido",
};
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const CANAL: Record<string, string> = {
  "e-mail": "email",
  email: "email",
  whatsapp: "whatsapp",
  ligacao: "ligacao",
  reuniao: "reuniao",
  apresentacao: "apresentacao",
  visita: "visita",
};

// ---------------------------------------------------------------------------
// Leitura da planilha → modelo intermediário
// ---------------------------------------------------------------------------

interface EmpresaDaPlanilha {
  chave: string;
  nome: string;
  codigoW: string | null;
  crm?: Linha;
  cs?: Linha;
  /** Só existe no histórico/tarefas — não tem linha nas abas CRM e CS. */
  soNoHistorico?: "cliente" | "prospect";
}

function linhasComDado(rows: Linha[] | undefined): Linha[] {
  return (rows ?? []).slice(1).filter((r) => limpo(r[0]));
}
function linhasDeHistorico(rows: Linha[] | undefined): Linha[] {
  return (rows ?? []).filter((r) => data(r[0]) && limpo(r[1]));
}

function montarEmpresas(p: Planilha): Map<string, EmpresaDaPlanilha> {
  const empresas = new Map<string, EmpresaDaPlanilha>();
  const porCodigo = new Map<string, string>();
  const registrar = (nome: string, aba: "crm" | "cs", linha: Linha) => {
    const codigoW = codigoWDoNome(nome);
    const chave = (codigoW && porCodigo.get(codigoW)) || chaveDeUnificacao(nome);
    const atual = empresas.get(chave) ?? { chave, nome: nome.replace(/\s*\(\s*w\s*\d+\s*\)\s*/i, " ").trim(), codigoW };
    if (codigoW && !atual.codigoW) atual.codigoW = codigoW;
    // A linha do CS é a mais recente sobre quem já é cliente: o nome dela vence.
    if (aba === "cs") atual.nome = nome.replace(/\s*\(\s*w\s*\d+\s*\)\s*/i, " ").trim();
    atual[aba] = atual[aba] ?? linha;
    empresas.set(chave, atual);
    if (atual.codigoW) porCodigo.set(atual.codigoW, chave);
  };
  for (const r of linhasComDado(p["CRM"])) registrar(limpo(r[0]), "crm", r);
  for (const r of linhasComDado(p["Sucesso do Cliente"])) registrar(limpo(r[0]), "cs", r);

  // Empresas que só aparecem no histórico ou nas tarefas: com código W é cliente
  // que faltou na aba de CS; sem código, só vale o que veio do Histórico CRM
  // (prospect). Texto solto no Histórico CS sem código W é linha deslocada.
  const conhecida = (nome: string) => {
    const w = codigoWDoNome(nome);
    return (w && porCodigo.has(w)) || empresas.has(chaveDeUnificacao(nome));
  };
  const extras: [Linha[] | undefined, boolean][] = [
    [p["Histórico CRM"], true],
    [p["Histórico CS"], false],
    [p["Tarefas"], false],
  ];
  for (const [rows, aceitaSemCodigo] of extras) {
    for (const r of linhasDeHistorico(rows)) {
      const nome = limpo(r[1]);
      if (conhecida(nome)) continue;
      const codigoW = codigoWDoNome(nome);
      if (!codigoW && !aceitaSemCodigo) continue;
      const chave = chaveDeUnificacao(nome);
      empresas.set(chave, {
        chave,
        nome: nome.replace(/\s*\(\s*w\s*\d+\s*\)\s*/i, " ").trim(),
        codigoW,
        soNoHistorico: codigoW ? "cliente" : "prospect",
      });
      if (codigoW) porCodigo.set(codigoW, chave);
    }
  }
  return empresas;
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolverOrganizacao(chave: string): Promise<string> {
  const q = admin.from("organizations").select("id");
  const { data: org, error } = UUID.test(chave) ? await q.eq("id", chave).maybeSingle() : await q.eq("slug", chave).maybeSingle();
  if (error || !org) throw new Error(`Organização "${chave}" não encontrada.`);
  return org.id as string;
}

/** "Carla" / "Tales" → usuário da organização, pelo nome de exibição ou pelo começo do e-mail. */
async function mapaDeResponsaveis(orgId: string): Promise<(nome: string) => string | null> {
  const { data: membros } = await admin.from("user_organizations").select("user_id").eq("organization_id", orgId);
  const ids = new Set((membros ?? []).map((m) => m.user_id as string));
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const pessoas = (lista?.users ?? [])
    .filter((u) => ids.has(u.id))
    .map((u) => ({
      id: u.id,
      nomes: [
        semAcento(String(u.user_metadata?.display_name ?? u.user_metadata?.full_name ?? "")),
        semAcento((u.email ?? "").split("@")[0]),
      ].filter(Boolean),
    }));
  return (nome: string) => {
    const n = semAcento(nome).split(/\s+/)[0];
    if (!n) return null;
    return pessoas.find((p) => p.nomes.some((x) => x.startsWith(n)))?.id ?? null;
  };
}

const contagem = {
  empresasCriadas: 0, empresasAtualizadas: 0, negociosCriados: 0, negociosAtualizados: 0,
  contatosCriados: 0, contatosAtualizados: 0, atividades: 0, atividadesSinteticas: 0, tarefas: 0,
};
const avisos: string[] = [];

async function main() {
  const arquivo = argumento("arquivo");
  const chaveOrg = argumento("org");
  if (!arquivo || !chaveOrg) throw new Error("Uso: --org <slug|uuid> --arquivo <raw.json> [--simular]");
  const planilha = JSON.parse(readFileSync(arquivo, "utf8")) as Planilha;
  const orgId = await resolverOrganizacao(chaveOrg);
  const responsavel = await mapaDeResponsaveis(orgId);
  console.info(`Importando para a organização ${orgId}${SIMULAR ? " — SIMULAÇÃO (nada é gravado)" : ""}`);

  const empresas = montarEmpresas(planilha);

  // Funil comercial e etapas.
  const { data: funil } = await admin
    .from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "comercial-legale").maybeSingle();
  if (!funil) throw new Error('Funil "comercial-legale" não existe — rode scripts/legale-configurar-organizacao.ts antes.');
  const { data: etapas } = await admin.from("crm_stages").select("id,slug").eq("organization_id", orgId).eq("pipeline_id", funil.id);
  const etapaId = new Map((etapas ?? []).map((e) => [e.slug as string, e.id as string]));

  // Empresas que já existem no banco.
  const { data: existentes } = await admin
    .from("customer_accounts").select("id,name,name_key,legale_code").eq("organization_id", orgId);
  const idPorCodigo = new Map<string, string>();
  const idPorChave = new Map<string, string>();
  for (const e of existentes ?? []) {
    if (e.legale_code) idPorCodigo.set(e.legale_code as string, e.id as string);
    idPorChave.set(chaveDeUnificacao(e.name as string), e.id as string);
  }

  const idDaEmpresa = new Map<string, string>(); // chave de unificação → id
  const negocioDaEmpresa = new Map<string, string>(); // chave → lead id
  const ultimoContatoDaPlanilha = new Map<string, { data: string; time: "comercial" | "cs"; quem: string }>();

  let posicao = 1000;
  for (const emp of empresas.values()) {
    const crm = emp.crm;
    const cs = emp.cs;
    const etapaCrm = ETAPA_POR_NOME[semAcento(limpo(crm?.[7]))] ?? "novo_lead";
    const saudeCs = semAcento(limpo(cs?.[6]));

    const lifecycle = emp.soNoHistorico
      ? emp.soNoHistorico
      : cs
        ? saudeCs === "churn" ? "ex_cliente" : "cliente"
        : etapaCrm === "ganho" ? "cliente" : "prospect";

    const notas = [
      crm && limpo(crm[12]) && `Comercial: ${limpo(crm[12])}`,
      cs && limpo(cs[17]) && `CS (Carla): ${limpo(cs[17])}`,
      cs && limpo(cs[18]) && `CS (Tales): ${limpo(cs[18])}`,
      crm && limpo(crm[13]) && /^https?:/.test(limpo(crm[13])) && `Proposta: ${limpo(crm[13])}`,
    ].filter(Boolean).join("\n\n");

    const proximo = [data(cs?.[14]), data(crm?.[10])].filter(Boolean).sort()[0] ?? null;
    const valor = etapaCrm === "ganho" ? centavos(crm?.[14]) : null;

    const linha: Record<string, unknown> = {
      organization_id: orgId,
      name: emp.nome,
      name_key: chaveDoNome(emp.nome),
      legale_code: emp.codigoW,
      lifecycle,
      source: limpo(crm?.[4]) || null,
      commercial_owner_user_id: crm ? responsavel(limpo(crm[5])) : null,
      cs_owner_user_id: cs ? responsavel(limpo(cs[4])) : null,
      phone: limpo(cs?.[2]) || limpo(crm?.[2]) || null,
      email: email(cs?.[3]) ?? email(crm?.[3]),
      customer_since: data(cs?.[5]),
      renewal_date: data(cs?.[16]),
      next_follow_up_on: proximo,
      ...(cs
        ? {
            pays_legale: booleano(cs[8]),
            pays_bi: booleano(cs[9]),
            pays_monitoring: booleano(cs[10]),
            contract_signed: booleano(cs[11]),
          }
        : {}),
      ...(valor ? { monthly_revenue_cents: valor } : {}),
      ...(saudeCs === "em risco"
        ? { health_override: "em_risco", health_override_reason: "Marcado como 'Em risco' na planilha", health_override_at: new Date().toISOString() }
        : {}),
      notes: notas || null,
    };

    let id = (emp.codigoW && idPorCodigo.get(emp.codigoW)) || idPorChave.get(emp.chave);
    if (id) {
      // Não sobrescreve com vazio o que alguém já preencheu na tela.
      const semVazios = Object.fromEntries(Object.entries(linha).filter(([, v]) => v !== null && v !== ""));
      contagem.empresasAtualizadas++;
      if (!SIMULAR) {
        const { error } = await admin.from("customer_accounts").update(semVazios).eq("organization_id", orgId).eq("id", id);
        if (error) throw new Error(`empresa ${emp.nome}: ${error.message}`);
      }
    } else {
      contagem.empresasCriadas++;
      if (SIMULAR) id = `simulado-${emp.chave}`;
      else {
        const { data: nova, error } = await admin.from("customer_accounts").insert(linha).select("id").single();
        if (error) throw new Error(`empresa ${emp.nome}: ${error.message}`);
        id = nova.id as string;
      }
    }
    idDaEmpresa.set(emp.chave, id);

    // Último contato informado na planilha (vira atividade se o histórico não cobrir).
    for (const [linhaAba, col, time, colResp] of [[cs, 12, "cs", 4], [crm, 8, "comercial", 5]] as const) {
      const d = data(linhaAba?.[col]);
      if (d && linhaAba) {
        const atual = ultimoContatoDaPlanilha.get(emp.chave);
        if (!atual || d > atual.data) ultimoContatoDaPlanilha.set(emp.chave, { data: d, time, quem: limpo(linhaAba[colResp]) });
      }
    }

    // Contatos (comercial e CS), deduplicados por e-mail.
    for (const r of [crm && { nome: limpo(crm[1]), tel: crm[2], mail: crm[3] }, cs && { nome: limpo(cs[1]), tel: cs[2], mail: cs[3] }]) {
      if (!r || (!r.nome && !email(r.mail))) continue;
      const mail = email(r.mail);
      const contato = {
        organization_id: orgId,
        name: r.nome || mail,
        display_name: r.nome || mail,
        email: mail,
        phone_number: telefoneE164(r.tel),
        account_id: SIMULAR ? null : id,
        source: "planilha",
      };
      const { data: achado } = mail
        ? await admin.from("contacts").select("id").eq("organization_id", orgId).eq("email_normalized", mail).maybeSingle()
        : await admin.from("contacts").select("id").eq("organization_id", orgId).eq("account_id", id).eq("name", r.nome).maybeSingle();
      if (achado) {
        contagem.contatosAtualizados++;
        if (!SIMULAR) await admin.from("contacts").update({ account_id: id }).eq("organization_id", orgId).eq("id", achado.id);
        if (r === crm) negocioDaEmpresa.set(`${emp.chave}:contato`, achado.id as string);
      } else {
        contagem.contatosCriados++;
        if (!SIMULAR) {
          const { data: novo, error } = await admin.from("contacts").insert(contato).select("id").single();
          if (error) avisos.push(`contato de ${emp.nome}: ${error.message}`);
          else negocioDaEmpresa.set(`${emp.chave}:contato`, novo.id as string);
        }
      }
    }

    // Negócio no funil comercial (só quem está na aba CRM).
    if (crm) {
      const externo = `planilha-crm:${emp.chave}`;
      const status = etapaCrm === "ganho" ? "won" : etapaCrm === "perdido" ? "lost" : "open";
      const fechamento = data(crm[8]) ?? data(crm[6]) ?? new Date().toISOString().slice(0, 10);
      const link = limpo(crm[13]);
      const negocio: Record<string, unknown> = {
        organization_id: orgId,
        pipeline_id: funil.id,
        stage_id: etapaId.get(etapaCrm),
        title: emp.nome,
        description: limpo(crm[12]) || null,
        status,
        closed_at: status === "open" ? null : `${fechamento}T12:00:00-03:00`,
        lost_reason: status === "lost" ? "Não registrado" : null,
        value_cents: centavos(crm[14]),
        currency: "BRL",
        owner_user_id: responsavel(limpo(crm[5])),
        expected_close_date: null,
        source: "planilha",
        external_id: externo,
        account_id: SIMULAR ? null : id,
        contact_id: negocioDaEmpresa.get(`${emp.chave}:contato`) ?? null,
        custom_fields: {
          ...(limpo(crm[4]) ? { origem: limpo(crm[4]) } : {}),
          ...(/^https?:/.test(link) ? { link_proposta_legada: link } : {}),
        },
        created_at: data(crm[6]) ? `${data(crm[6])}T12:00:00-03:00` : undefined,
      };
      if (!negocio.stage_id) throw new Error(`etapa "${etapaCrm}" não existe no funil comercial`);
      const { data: ja } = await admin
        .from("crm_leads").select("id").eq("organization_id", orgId).eq("source", "planilha").eq("external_id", externo).maybeSingle();
      if (ja) {
        contagem.negociosAtualizados++;
        negocioDaEmpresa.set(emp.chave, ja.id as string);
        if (!SIMULAR) {
          const { created_at: _c, ...semCriacao } = negocio;
          const { error } = await admin.from("crm_leads").update(semCriacao).eq("organization_id", orgId).eq("id", ja.id);
          if (error) throw new Error(`negócio ${emp.nome}: ${error.message}`);
        }
      } else {
        contagem.negociosCriados++;
        if (!SIMULAR) {
          const { data: novo, error } = await admin
            .from("crm_leads").insert({ ...negocio, position_in_stage: (posicao += 1000) }).select("id").single();
          if (error) throw new Error(`negócio ${emp.nome}: ${error.message}`);
          negocioDaEmpresa.set(emp.chave, novo.id as string);
        }
      }
    }
  }

  // Histórico → atividades da empresa.
  const acharEmpresa = (nome: string): string | null => {
    const codigo = codigoWDoNome(nome);
    for (const e of empresas.values()) if (codigo && e.codigoW === codigo) return e.chave;
    const chave = chaveDeUnificacao(nome);
    return idDaEmpresa.has(chave) ? chave : null;
  };
  // O índice único de external_id é PARCIAL, e o upsert do PostgREST não o usa
  // como alvo de conflito: os já importados são lidos uma vez e pulados.
  const jaImportadas = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const { data: pagina } = await admin
      .from("customer_account_activities").select("external_id")
      .eq("organization_id", orgId).eq("source", "planilha").range(de, de + 999);
    for (const x of pagina ?? []) jaImportadas.add(x.external_id as string);
    if (!pagina || pagina.length < 1000) break;
  }
  const inserirAtividade = async (atividade: Record<string, unknown>): Promise<string | null> => {
    const externo = atividade.external_id as string;
    if (jaImportadas.has(externo)) return null;
    const { error } = await admin.from("customer_account_activities").insert(atividade);
    if (error && error.code !== "23505") return error.message;
    jaImportadas.add(externo);
    return null;
  };
  const maisRecenteNoHistorico = new Map<string, string>();
  const repeticoes = new Map<string, number>();
  for (const [aba, time] of [["Histórico CRM", "comercial"], ["Histórico CS", "cs"]] as const) {
    for (const r of linhasDeHistorico(planilha[aba])) {
      const quando = data(r[0])!;
      const chave = acharEmpresa(limpo(r[1]));
      if (!chave) {
        avisos.push(`${aba}: "${limpo(r[1])}" (${r[0]}) não bate com nenhuma empresa — linha ignorada`);
        continue;
      }
      const resumo = limpo(r[4]) || `${limpo(r[3]) || "Contato"} registrado na planilha`;
      const base = hash(aba, quando, chave, limpo(r[3]), resumo);
      const n = (repeticoes.get(base) ?? 0) + 1;
      repeticoes.set(base, n);
      if (!maisRecenteNoHistorico.has(chave) || quando > maisRecenteNoHistorico.get(chave)!) maisRecenteNoHistorico.set(chave, quando);
      const atividade = {
        organization_id: orgId,
        account_id: idDaEmpresa.get(chave),
        lead_id: time === "comercial" ? negocioDaEmpresa.get(chave) ?? null : null,
        team: time,
        channel: CANAL[semAcento(limpo(r[3]))] ?? "outro",
        summary: resumo.length >= 2 ? resumo : `${resumo} (planilha)`,
        performed_at: `${quando}T12:00:00-03:00`,
        performed_by_user_id: responsavel(limpo(r[2])),
        source: "planilha",
        external_id: `planilha:${base}:${n}`,
      };
      contagem.atividades++;
      if (!SIMULAR) {
        const error = await inserirAtividade(atividade);
        if (error) throw new Error(`atividade ${aba} ${r[0]} ${r[1]}: ${error}`);
      }
    }
  }

  // "Data do Último Contato" sem linha no histórico: vira uma atividade, senão a
  // saúde calcula "nenhum contato registrado" para quem foi contatado ontem.
  for (const [chave, ultimo] of ultimoContatoDaPlanilha) {
    if ((maisRecenteNoHistorico.get(chave) ?? "") >= ultimo.data) continue;
    contagem.atividadesSinteticas++;
    if (SIMULAR) continue;
    const error = await inserirAtividade(
      {
        organization_id: orgId,
        account_id: idDaEmpresa.get(chave),
        team: ultimo.time,
        channel: "outro",
        summary: "Último contato informado na planilha (sem detalhe no histórico)",
        performed_at: `${ultimo.data}T12:00:00-03:00`,
        performed_by_user_id: responsavel(ultimo.quem),
        source: "planilha",
        external_id: `planilha:ultimo:${chave}:${ultimo.data}`,
      },
    );
    if (error) throw new Error(`último contato ${chave}: ${error}`);
  }

  // Tarefas.
  for (const r of linhasDeHistorico(planilha["Tarefas"])) {
    const chave = acharEmpresa(limpo(r[1]));
    if (!chave) {
      avisos.push(`Tarefas: "${limpo(r[1])}" não bate com nenhuma empresa — tarefa ignorada`);
      continue;
    }
    const titulo = limpo(r[3]).slice(0, 200) || "Tarefa da planilha";
    const status = /andamento/i.test(r[4] ?? "") ? "in_progress" : /conclu|feito|finaliz/i.test(r[4] ?? "") ? "done" : "pending";
    const tarefa = {
      organization_id: orgId,
      title: titulo,
      description: [`Aberta em ${limpo(r[0])} (planilha).`, limpo(r[2]) && `Com quem: ${limpo(r[2])}.`, /pausad/i.test(r[4] ?? "") && "Estava PAUSADA na planilha."]
        .filter(Boolean).join(" "),
      status,
      priority: "medium",
      account_id: idDaEmpresa.get(chave),
      lead_id: negocioDaEmpresa.get(chave) ?? null,
    };
    contagem.tarefas++;
    if (SIMULAR) continue;
    const { data: ja } = await admin
      .from("crm_tasks").select("id").eq("organization_id", orgId).eq("account_id", tarefa.account_id!).eq("title", titulo).maybeSingle();
    const { error } = ja
      ? await admin.from("crm_tasks").update(tarefa).eq("organization_id", orgId).eq("id", ja.id)
      : await admin.from("crm_tasks").insert(tarefa);
    if (error) throw new Error(`tarefa ${titulo}: ${error.message}`);
  }

  console.info("\nResumo:");
  for (const [k, v] of Object.entries(contagem)) console.info(`  ${k}: ${v}`);
  const semResponsavel = [...empresas.values()]
    .flatMap((e) => [limpo(e.crm?.[5]), limpo(e.cs?.[4])])
    .filter((n) => n && !responsavel(n));
  if (semResponsavel.length) {
    avisos.push(`Responsáveis sem usuário no CRM (ficam em branco até a pessoa ser convidada): ${[...new Set(semResponsavel)].join(", ")}`);
  }
  if (avisos.length) {
    console.info("\nAvisos:");
    for (const a of avisos) console.info(`  - ${a}`);
  }
  console.info(SIMULAR ? "\n(simulação — nada foi gravado)" : "\n✅ Importação concluída.");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
