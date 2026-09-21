import { z } from "zod";

export const TIPOS_DO_ITEM_COMERCIAL = ["modulo", "usuario", "servico", "migracao"] as const;

export const faixaDePrecoSchema = z.object({
  quantidade_minima: z.number().int().min(1).max(1_000_000),
  preco_escritorio_cents: z.number().int().min(0),
  preco_departamento_cents: z.number().int().min(0),
});

export type FaixaDePreco = z.infer<typeof faixaDePrecoSchema>;

export const itemDoCatalogoSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/)
    .max(80),
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(500).default(""),
  categoria: z.enum(TIPOS_DO_ITEM_COMERCIAL),
  cobranca: z.enum(["mensal", "unica"]).default("mensal"),
  preco_escritorio_cents: z.number().int().min(0),
  preco_departamento_cents: z.number().int().min(0),
  setup_cents: z.number().int().min(0).default(0),
  unidade: z.string().trim().min(1).max(60).default("unidade"),
  faixas_preco: z.array(faixaDePrecoSchema).max(30).default([]),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(10_000).default(0),
});

export const catalogoComercialSchema = z
  .object({ itens: z.array(itemDoCatalogoSchema).max(200) })
  .superRefine(({ itens }, ctx) => {
    const codigos = new Set<string>();
    itens.forEach((item, indice) => {
      if (codigos.has(item.codigo)) {
        ctx.addIssue({
          code: "custom",
          path: ["itens", indice, "codigo"],
          message: "Código duplicado.",
        });
      }
      codigos.add(item.codigo);
      for (let i = 1; i < item.faixas_preco.length; i += 1) {
        const faixaAtual = item.faixas_preco[i];
        const faixaAnterior = item.faixas_preco[i - 1];
        if (
          faixaAtual &&
          faixaAnterior &&
          faixaAtual.quantidade_minima <= faixaAnterior.quantidade_minima
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "faixas_preco"],
            message: "As faixas devem estar em ordem crescente.",
          });
          break;
        }
      }
    });
  });
export type ItemDoCatalogo = z.infer<typeof itemDoCatalogoSchema>;

export function precoDoCatalogo(
  item: ItemDoCatalogo,
  quantidade: number,
  tipo: "escritorio" | "departamento_juridico",
): number {
  const faixa = [...item.faixas_preco]
    .sort((a, b) => b.quantidade_minima - a.quantidade_minima)
    .find((candidate) => quantidade >= candidate.quantidade_minima);
  if (faixa) {
    return tipo === "escritorio" ? faixa.preco_escritorio_cents : faixa.preco_departamento_cents;
  }
  return tipo === "escritorio" ? item.preco_escritorio_cents : item.preco_departamento_cents;
}

export const CATALOGO_COMERCIAL_INICIAL: ItemDoCatalogo[] = [
  {
    codigo: "gestao_processos",
    nome: "Gestão de processos",
    descricao: "Organiza processos, prazos, movimentações e alertas.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 14225,
    preco_departamento_cents: 14225,
    setup_cents: 0,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 10,
  },
  {
    codigo: "publicacoes",
    nome: "Publicações",
    descricao: "Captura e organiza publicações para a equipe jurídica.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 14225,
    preco_departamento_cents: 14225,
    setup_cents: 0,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 20,
  },
  {
    codigo: "contratos",
    nome: "Contratos",
    descricao: "Centraliza contratos, vencimentos, responsáveis e documentos.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 12800,
    preco_departamento_cents: 12800,
    setup_cents: 0,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 30,
  },
  {
    codigo: "atividades_juridicas",
    nome: "Atividades jurídicas",
    descricao: "Distribui tarefas e acompanha a execução da rotina jurídica.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 0,
    preco_departamento_cents: 0,
    setup_cents: 0,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 40,
  },
  {
    codigo: "assinatura_digital",
    nome: "Assinatura digital",
    descricao: "Fluxos de assinatura integrados à operação.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 4225,
    preco_departamento_cents: 4225,
    setup_cents: 120000,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 50,
  },
  {
    codigo: "legal_analytics",
    nome: "Legal Analytics",
    descricao: "Indicadores para acompanhar a operação e apoiar decisões.",
    categoria: "modulo",
    cobranca: "mensal",
    preco_escritorio_cents: 19990,
    preco_departamento_cents: 19990,
    setup_cents: 0,
    unidade: "módulo",
    faixas_preco: [],
    ativo: true,
    ordem: 60,
  },
  {
    codigo: "usuario_legale",
    nome: "Usuário Legale",
    descricao: "Acesso completo à plataforma.",
    categoria: "usuario",
    cobranca: "mensal",
    preco_escritorio_cents: 4790,
    preco_departamento_cents: 4790,
    setup_cents: 0,
    unidade: "usuário",
    faixas_preco: [],
    ativo: true,
    ordem: 100,
  },
  {
    codigo: "area_cliente",
    nome: "Área do Cliente",
    descricao: "Acesso destinado ao cliente do escritório.",
    categoria: "usuario",
    cobranca: "mensal",
    preco_escritorio_cents: 4200,
    preco_departamento_cents: 4200,
    setup_cents: 0,
    unidade: "usuário",
    faixas_preco: [],
    ativo: true,
    ordem: 110,
  },
  {
    codigo: "usuario_bi",
    nome: "Usuário BI",
    descricao: "Acesso aos painéis de indicadores.",
    categoria: "usuario",
    cobranca: "mensal",
    preco_escritorio_cents: 3990,
    preco_departamento_cents: 3990,
    setup_cents: 0,
    unidade: "usuário",
    faixas_preco: [],
    ativo: true,
    ordem: 120,
  },
  {
    codigo: "tv_legale",
    nome: "TV Legale",
    descricao: "Usuário ou dispositivo para exibição de painéis.",
    categoria: "usuario",
    cobranca: "mensal",
    preco_escritorio_cents: 990,
    preco_departamento_cents: 990,
    setup_cents: 0,
    unidade: "usuário",
    faixas_preco: [],
    ativo: true,
    ordem: 130,
  },
  {
    codigo: "usuarios_limitados",
    nome: "Usuários limitados",
    descricao: "Acessos para consulta e operação conforme as permissões contratadas.",
    categoria: "usuario",
    cobranca: "mensal",
    preco_escritorio_cents: 4200,
    preco_departamento_cents: 4200,
    setup_cents: 0,
    unidade: "usuário",
    faixas_preco: [
      { quantidade_minima: 1, preco_escritorio_cents: 4200, preco_departamento_cents: 4200 },
      { quantidade_minima: 11, preco_escritorio_cents: 2800, preco_departamento_cents: 2800 },
      { quantidade_minima: 31, preco_escritorio_cents: 1800, preco_departamento_cents: 1800 },
      { quantidade_minima: 76, preco_escritorio_cents: 1500, preco_departamento_cents: 1500 },
      { quantidade_minima: 101, preco_escritorio_cents: 1000, preco_departamento_cents: 1000 },
    ],
    ativo: true,
    ordem: 140,
  },
  {
    codigo: "monitoramento_processos",
    nome: "Monitoramento de processos",
    descricao: "Acompanhamento de movimentações e geração de alertas.",
    categoria: "servico",
    cobranca: "mensal",
    preco_escritorio_cents: 85,
    preco_departamento_cents: 85,
    setup_cents: 0,
    unidade: "processo",
    faixas_preco: [
      { quantidade_minima: 100, preco_escritorio_cents: 85, preco_departamento_cents: 85 },
      { quantidade_minima: 1000, preco_escritorio_cents: 75, preco_departamento_cents: 75 },
      { quantidade_minima: 10000, preco_escritorio_cents: 65, preco_departamento_cents: 65 },
      { quantidade_minima: 20001, preco_escritorio_cents: 55, preco_departamento_cents: 55 },
    ],
    ativo: true,
    ordem: 200,
  },
];

export function catalogoComercialEfetivo(
  cadastrados: ItemDoCatalogo[] | null | undefined,
): ItemDoCatalogo[] {
  const porCodigo = new Map(CATALOGO_COMERCIAL_INICIAL.map((item) => [item.codigo, item] as const));
  for (const item of cadastrados ?? []) porCodigo.set(item.codigo, item);
  return [...porCodigo.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
