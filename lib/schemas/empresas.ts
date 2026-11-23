import { z } from "zod";

/**
 * EMPRESA — a ficha única do Legale (migration 0318).
 *
 * O vocabulário abaixo espelha os CHECKs de `customer_accounts`,
 * `customer_account_activities` e `organization_member_areas`. Mudou um lado,
 * mude o outro na mesma migration.
 */
export const CICLOS_DA_EMPRESA = ["prospect", "onboarding", "cliente", "ex_cliente"] as const;
export type CicloDaEmpresa = (typeof CICLOS_DA_EMPRESA)[number];

export const ROTULO_DO_CICLO: Record<CicloDaEmpresa, string> = {
  prospect: "Prospect",
  onboarding: "Em implantação",
  cliente: "Cliente",
  ex_cliente: "Ex-cliente",
};

export const TIPOS_DE_EMPRESA = ["escritorio", "departamento_juridico"] as const;
export const ROTULO_DO_TIPO: Record<(typeof TIPOS_DE_EMPRESA)[number], string> = {
  escritorio: "Escritório",
  departamento_juridico: "Departamento jurídico",
};

export const NIVEIS_DE_SAUDE = ["saudavel", "atencao", "em_risco", "churn"] as const;
export type NivelDeSaude = (typeof NIVEIS_DE_SAUDE)[number];
export const ROTULO_DA_SAUDE: Record<NivelDeSaude, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  em_risco: "Em risco",
  churn: "Churn",
};

export const TIMES = ["comercial", "cs"] as const;
export type Time = (typeof TIMES)[number];
export const ROTULO_DO_TIME: Record<Time, string> = { comercial: "Comercial", cs: "Sucesso do Cliente" };

export const CANAIS_DE_CONTATO = [
  "email",
  "whatsapp",
  "ligacao",
  "reuniao",
  "apresentacao",
  "visita",
  "outro",
] as const;
export type CanalDeContato = (typeof CANAIS_DE_CONTATO)[number];
export const ROTULO_DO_CANAL: Record<CanalDeContato, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  reuniao: "Reunião",
  apresentacao: "Apresentação",
  visita: "Visita",
  outro: "Outro",
};

export const AREAS_DA_EQUIPE = ["comercial", "cs", "diretoria"] as const;
export type AreaDaEquipe = (typeof AREAS_DA_EQUIPE)[number];
export const ROTULO_DA_AREA: Record<AreaDaEquipe, string> = {
  comercial: "Comercial",
  cs: "Sucesso do Cliente",
  diretoria: "Diretoria",
};

/** Módulos que aparecem na ficha (o catálogo completo vive nas propostas). */
export const MODULOS_DO_LEGALE = [
  { codigo: "legale", nome: "Legale (gestão jurídica)" },
  { codigo: "bi", nome: "Legale Analytics / BI" },
  { codigo: "monitoramento", nome: "Monitoramento de processos" },
  { codigo: "publicacoes", nome: "Publicações" },
  { codigo: "financeiro", nome: "Financeiro" },
  { codigo: "ged", nome: "GED e assinatura" },
  { codigo: "tv_legale", nome: "TV Legale" },
  { codigo: "api", nome: "API Legale" },
] as const;

export const COLUNAS_DA_EMPRESA =
  "id,organization_id,name,name_key,legal_name,cnpj,legale_code,client_kind,lifecycle,source," +
  "commercial_owner_user_id,cs_owner_user_id,phone,email,website,city,state,customer_since," +
  "renewal_date,follow_up_every_days,next_follow_up_on,contract_signed,pays_legale,pays_bi," +
  "pays_monitoring,contracted_modules,monthly_revenue_cents,currency,health_override," +
  "health_override_reason,health_override_at,notes,created_at,updated_at";

export interface Empresa {
  id: string;
  organization_id: string;
  name: string;
  name_key: string;
  legal_name: string | null;
  cnpj: string | null;
  legale_code: string | null;
  client_kind: (typeof TIPOS_DE_EMPRESA)[number] | null;
  lifecycle: CicloDaEmpresa;
  source: string | null;
  commercial_owner_user_id: string | null;
  cs_owner_user_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  customer_since: string | null;
  renewal_date: string | null;
  follow_up_every_days: number | null;
  next_follow_up_on: string | null;
  contract_signed: boolean;
  pays_legale: boolean;
  pays_bi: boolean;
  pays_monitoring: boolean;
  contracted_modules: string[];
  monthly_revenue_cents: number | null;
  currency: string;
  health_override: NivelDeSaude | null;
  health_override_reason: string | null;
  health_override_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const COLUNAS_DA_ATIVIDADE =
  "id,account_id,lead_id,team,channel,summary,performed_at,performed_by_user_id,source,created_at";

export interface AtividadeDaEmpresa {
  id: string;
  account_id: string;
  lead_id: string | null;
  team: Time;
  channel: CanalDeContato;
  summary: string;
  performed_at: string;
  performed_by_user_id: string | null;
  source: "manual" | "planilha" | "outlook" | "automacao";
  created_at: string;
}

/**
 * Nome comparável: sem acento, minúsculo, sem o código W entre parênteses e
 * sem os sufixos que variam entre planilha, proposta e contrato
 * ("Sociedade de Advogados", "Advocacia", "Ltda"...). É a mesma régua do
 * painel comercial, sem a lista de apelidos — apelido é decisão de quem
 * conhece o cliente e entra na importação, não aqui.
 */
export function chaveDoNome(nome: string): string {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(\s*w?\d+\s*\)/g, " ")
    .replace(
      /sociedade (individual )?de advoga\w*|soc\. de advogados|advogados associados|advogados|advocacia|e consultoria|ltda\.?|\bs\/?a\b|\bme\b|\beireli\b|sociedade/g,
      " ",
    )
    .replace(/[.,;:&\-/'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || nome.trim().toLowerCase();
}

/** "Chiappa Advogados (W463)" → "W463". Aceita "w 463", "W-463". */
export function codigoWDoNome(nome: string): string | null {
  const achado = /\(\s*w\s*-?\s*(\d{1,6})\s*\)/i.exec(nome);
  return achado ? `W${Number(achado[1])}` : null;
}

export function normalizarCodigoW(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const achado = /^\s*w?\s*-?\s*(\d{1,6})\s*$/i.exec(valor);
  return achado ? `W${Number(achado[1])}` : null;
}

export function normalizarCnpj(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

export function formatarCnpj(cnpj: string | null): string {
  if (!cnpj || cnpj.length !== 14) return cnpj ?? "";
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

// ---------------------------------------------------------------------------
// SAÚDE DO CLIENTE
// ---------------------------------------------------------------------------

export interface MotivoDaSaude {
  pontos: number;
  texto: string;
}

export interface SaudeCalculada {
  /** 0–100. `null` para quem ainda não é cliente: prospect não tem saúde. */
  nota: number | null;
  nivel: NivelDeSaude | null;
  /** O que tirou pontos, do maior para o menor. */
  motivos: MotivoDaSaude[];
  /** `true` quando o nível exibido veio do ajuste manual do CS. */
  ajustadoAMao: boolean;
}

const DIA_MS = 86_400_000;

function diasEntre(deIso: string, ate: Date): number {
  const de = new Date(deIso.length === 10 ? `${deIso}T12:00:00` : deIso);
  return Math.floor((ate.getTime() - de.getTime()) / DIA_MS);
}

/** Frequência padrão de acompanhamento quando a ficha não diz nenhuma. */
export const FREQUENCIA_PADRAO_DIAS = 30;

/**
 * Nota de saúde de 0 a 100, a partir do que a ficha já sabe. Cada regra tira
 * pontos e diz por quê — a tela mostra os motivos, porque uma nota sem motivo
 * vira número que ninguém confia.
 *
 * O ajuste manual (`health_override`) troca o NÍVEL exibido, mas a nota e os
 * motivos continuam calculados: o CS vê o que o sistema acha e o que ele decidiu.
 */
export function saudeDaEmpresa(
  empresa: Pick<
    Empresa,
    | "lifecycle"
    | "follow_up_every_days"
    | "next_follow_up_on"
    | "contract_signed"
    | "pays_legale"
    | "renewal_date"
    | "health_override"
  >,
  ultimoContatoIso: string | null,
  hoje: Date = new Date(),
): SaudeCalculada {
  if (empresa.lifecycle === "prospect") {
    return { nota: null, nivel: null, motivos: [], ajustadoAMao: false };
  }
  if (empresa.lifecycle === "ex_cliente") {
    return { nota: 0, nivel: "churn", motivos: [{ pontos: 100, texto: "Não é mais cliente" }], ajustadoAMao: false };
  }

  const motivos: MotivoDaSaude[] = [];
  const frequencia = empresa.follow_up_every_days ?? FREQUENCIA_PADRAO_DIAS;

  if (!ultimoContatoIso) {
    motivos.push({ pontos: 30, texto: "Nenhum contato registrado" });
  } else {
    const dias = diasEntre(ultimoContatoIso, hoje);
    if (dias > frequencia * 2) {
      motivos.push({ pontos: 35, texto: `${dias} dias sem contato (combinado: a cada ${frequencia})` });
    } else if (dias > frequencia) {
      motivos.push({ pontos: 20, texto: `${dias} dias sem contato (combinado: a cada ${frequencia})` });
    }
  }

  if (empresa.next_follow_up_on && diasEntre(empresa.next_follow_up_on, hoje) > 0) {
    motivos.push({ pontos: 10, texto: "Próximo contato agendado já venceu" });
  }

  if (empresa.lifecycle === "cliente" && !empresa.pays_legale) {
    motivos.push({ pontos: 25, texto: "Pagamento do Legale não confirmado" });
  }

  if (!empresa.contract_signed) {
    motivos.push({ pontos: 15, texto: "Contrato ainda não assinado" });
  }

  if (empresa.renewal_date) {
    const faltam = -diasEntre(empresa.renewal_date, hoje);
    if (faltam < 0) motivos.push({ pontos: 15, texto: "Data de renovação já passou" });
    else if (faltam <= 60) motivos.push({ pontos: 10, texto: `Renovação em ${faltam} dias` });
  }

  motivos.sort((a, b) => b.pontos - a.pontos);
  const nota = Math.max(0, 100 - motivos.reduce((total, m) => total + m.pontos, 0));
  const calculado: NivelDeSaude = nota >= 75 ? "saudavel" : nota >= 50 ? "atencao" : "em_risco";

  if (empresa.health_override) {
    return { nota, nivel: empresa.health_override, motivos, ajustadoAMao: true };
  }
  return { nota, nivel: calculado, motivos, ajustadoAMao: false };
}

// ---------------------------------------------------------------------------
// ENTRADA DA API
// ---------------------------------------------------------------------------

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const dataOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null))
  .transform((v) => v || null);

const uuidOpcional = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null))
  .transform((v) => v || null);

const camposDaEmpresa = {
  name: z.string().trim().min(2, "Informe o nome da empresa").max(160),
  legal_name: textoOpcional(200),
  cnpj: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const cnpj = normalizarCnpj(v);
      if (!cnpj) ctx.addIssue({ code: "custom", message: "CNPJ precisa ter 14 dígitos" });
      return cnpj;
    }),
  legale_code: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const codigo = normalizarCodigoW(v);
      if (!codigo) ctx.addIssue({ code: "custom", message: "Código do Legale no formato W123" });
      return codigo;
    }),
  client_kind: z.enum(TIPOS_DE_EMPRESA).optional().nullable().transform((v) => v ?? null),
  lifecycle: z.enum(CICLOS_DA_EMPRESA).default("prospect"),
  source: textoOpcional(80),
  commercial_owner_user_id: uuidOpcional,
  cs_owner_user_id: uuidOpcional,
  phone: textoOpcional(40),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null))
    .transform((v) => v || null),
  website: textoOpcional(200),
  city: textoOpcional(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF com 2 letras")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null))
    .transform((v) => v || null),
  customer_since: dataOpcional,
  renewal_date: dataOpcional,
  follow_up_every_days: z.number().int().min(1).max(365).optional().nullable().transform((v) => v ?? null),
  next_follow_up_on: dataOpcional,
  contract_signed: z.boolean().default(false),
  pays_legale: z.boolean().default(false),
  pays_bi: z.boolean().default(false),
  pays_monitoring: z.boolean().default(false),
  contracted_modules: z.array(z.string().min(1).max(40)).max(30).default([]),
  monthly_revenue_cents: z.number().int().min(0).optional().nullable().transform((v) => v ?? null),
  notes: textoOpcional(5000),
};

export const empresaCreateSchema = z.object(camposDaEmpresa);
export type EmpresaCreate = z.infer<typeof empresaCreateSchema>;

/** PATCH: tudo opcional, e o ajuste de saúde exige motivo. */
export const empresaPatchSchema = empresaCreateSchema
  .partial()
  .extend({
    health_override: z.enum(NIVEIS_DE_SAUDE).nullable().optional(),
    health_override_reason: textoOpcional(500),
  })
  .superRefine((valor, ctx) => {
    const v = valor as { health_override?: string | null; health_override_reason?: string | null };
    if (v.health_override && (!v.health_override_reason || v.health_override_reason.length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["health_override_reason"],
        message: "Diga por que a saúde foi ajustada à mão",
      });
    }
  });
export type EmpresaPatch = Partial<EmpresaCreate> & {
  health_override?: NivelDeSaude | null;
  health_override_reason?: string | null;
};

export const atividadeCreateSchema = z.object({
  team: z.enum(TIMES),
  channel: z.enum(CANAIS_DE_CONTATO),
  summary: z.string().trim().min(2, "Escreva o resumo do contato").max(5000),
  performed_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => v ?? new Date().toISOString()),
  lead_id: uuidOpcional,
  /** Opcional: já remarca o próximo contato da empresa. */
  next_follow_up_on: dataOpcional,
});
export type AtividadeCreate = z.infer<typeof atividadeCreateSchema>;

export const areasDoMembroSchema = z.object({
  user_id: z.string().uuid(),
  areas: z.array(z.enum(AREAS_DA_EQUIPE)).max(3),
});
