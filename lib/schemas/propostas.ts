import { z } from "zod";

export const TIPOS_DE_CLIENTE = ["escritorio", "departamento_juridico"] as const;
export const STATUS_DA_PROPOSTA = [
  "rascunho",
  "enviada",
  "aprovada",
  "recusada",
  "expirada",
] as const;

export const CATALOGO_DA_PROPOSTA = [
  {
    codigo: "gestao_processos",
    nome: "Gestão de processos",
    descricao: "Organiza processos, prazos, movimentações e alertas.",
  },
  {
    codigo: "publicacoes",
    nome: "Publicações",
    descricao: "Captura e organiza publicações para a equipe jurídica.",
  },
  {
    codigo: "contratos",
    nome: "Contratos",
    descricao: "Centraliza contratos, vencimentos, responsáveis e documentos.",
  },
  {
    codigo: "atividades_juridicas",
    nome: "Atividades jurídicas",
    descricao: "Distribui tarefas e acompanha a execução da rotina jurídica.",
  },
  {
    codigo: "assinatura_digital",
    nome: "Assinatura digital",
    descricao: "Fluxos de assinatura integrados à operação.",
  },
  {
    codigo: "legal_analytics",
    nome: "Legal Analytics",
    descricao: "Indicadores para acompanhar a operação e apoiar decisões.",
  },
] as const;

export const FAIXAS_USUARIOS_LIMITADOS = [
  { ate: 10, valor_cents: 4200 },
  { ate: 30, valor_cents: 2800 },
  { ate: 75, valor_cents: 1800 },
  { ate: 100, valor_cents: 1500 },
  { ate: Number.POSITIVE_INFINITY, valor_cents: 1000 },
] as const;

export const FAIXAS_MONITORAMENTO = [
  { minimo: 100, valor_cents: 85 },
  { minimo: 1_000, valor_cents: 75 },
  { minimo: 10_000, valor_cents: 65 },
  { minimo: 20_001, valor_cents: 55 },
] as const;

export function valorUsuarioLimitado(quantidade: number): number {
  return FAIXAS_USUARIOS_LIMITADOS.find((faixa) => quantidade <= faixa.ate)?.valor_cents ?? 1000;
}

export function valorMonitoramento(quantidade: number): number {
  return (
    [...FAIXAS_MONITORAMENTO].reverse().find((faixa) => quantidade >= faixa.minimo)?.valor_cents ??
    0
  );
}

export const itemDaPropostaSchema = z.object({
  codigo: z.string().trim().min(1).max(80),
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(500).default(""),
  unidade: z.string().trim().min(1).max(60).optional(),
  quantidade: z.number().int().min(1).max(1_000_000),
  valor_unitario_cents: z.number().int().min(0),
  total_cents: z.number().int().min(0),
  cobranca: z.enum(["mensal", "unica"]),
  categoria: z.enum(["modulo", "usuario", "monitoramento", "ativacao", "servico", "migracao"]),
});

export const propostaCreateSchema = z
  .object({
    contact_id: z.string().uuid().nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
    client_name: z.string().trim().min(2, "Informe o nome do cliente.").max(200),
    client_kind: z.enum(TIPOS_DE_CLIENTE),
    recipient_name: z.string().trim().max(160).optional(),
    recipient_email: z.string().trim().email().max(254).optional().or(z.literal("")),
    issue_date: z.string().date(),
    valid_until: z.string().date(),
    status: z.enum(STATUS_DA_PROPOSTA).default("rascunho"),
    notes: z.string().trim().max(4000).optional(),
    payment_terms: z.string().trim().max(2000).optional(),
    items: z.array(itemDaPropostaSchema).min(1, "Inclua ao menos um item."),
  })
  .superRefine((valor, ctx) => {
    if (valor.valid_until < valor.issue_date) {
      ctx.addIssue({
        code: "custom",
        path: ["valid_until"],
        message: "A validade não pode ser anterior à emissão.",
      });
    }
    for (const [indice, item] of valor.items.entries()) {
      if (
        item.categoria === "monitoramento" &&
        item.codigo === "monitoramento_processos" &&
        item.quantidade < 100
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["items", indice, "quantidade"],
          message: "A contratação mínima é de 100 processos.",
        });
      }
      if (item.total_cents !== item.quantidade * item.valor_unitario_cents) {
        ctx.addIssue({
          code: "custom",
          path: ["items", indice, "total_cents"],
          message: "O total do item não confere.",
        });
      }
    }
  });

export type ItemDaProposta = z.infer<typeof itemDaPropostaSchema>;
export type PropostaCreate = z.infer<typeof propostaCreateSchema>;

export interface PropostaComercial {
  id: string;
  organization_id: string;
  contact_id: string | null;
  lead_id: string | null;
  created_by: string | null;
  client_name: string;
  client_kind: (typeof TIPOS_DE_CLIENTE)[number];
  recipient_name: string | null;
  recipient_email: string | null;
  status: (typeof STATUS_DA_PROPOSTA)[number];
  issue_date: string;
  valid_until: string;
  version: number;
  currency: string;
  monthly_total_cents: number;
  activation_total_cents: number;
  items: ItemDaProposta[];
  notes: string | null;
  payment_terms: string | null;
  created_at: string;
  updated_at: string;
}

export const COLUNAS_DA_PROPOSTA =
  "id, organization_id, contact_id, lead_id, created_by, client_name, client_kind, recipient_name, recipient_email, status, issue_date, valid_until, version, currency, monthly_total_cents, activation_total_cents, items, notes, payment_terms, created_at, updated_at";
