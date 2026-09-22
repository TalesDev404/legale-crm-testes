import { z } from "zod";

export const TIPOS_DO_ITEM_COMERCIAL = ["modulo", "usuario", "servico", "migracao"] as const;

export const faixaDePrecoSchema = z.object({
  quantidade_minima: z.number().int().min(1).max(1_000_000),
  preco_escritorio_cents: z.number().int().min(0),
  preco_departamento_cents: z.number().int().min(0),
});

export const opcaoDePrecoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/)
    .max(40),
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(300).default(""),
  preco_escritorio_cents: z.number().int().min(0),
  preco_departamento_cents: z.number().int().min(0),
});

export type FaixaDePreco = z.infer<typeof faixaDePrecoSchema>;
export type OpcaoDePreco = z.infer<typeof opcaoDePrecoSchema>;

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
  opcoes_preco: z.array(opcaoDePrecoSchema).max(40).default([]),
  minimo_opcoes: z.number().int().min(0).max(40).default(0),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(10_000).default(0),
});

export const catalogoComercialSchema = z
  .object({ itens: z.array(itemDoCatalogoSchema).max(250) })
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
        const atual = item.faixas_preco[i];
        const anterior = item.faixas_preco[i - 1];
        if (atual && anterior && atual.quantidade_minima <= anterior.quantidade_minima) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "faixas_preco"],
            message: "As faixas devem estar em ordem crescente.",
          });
          break;
        }
      }
      const opcoes = new Set<string>();
      item.opcoes_preco.forEach((opcao, opcaoIndice) => {
        if (opcoes.has(opcao.codigo)) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "opcoes_preco", opcaoIndice, "codigo"],
            message: "Código de opção duplicado.",
          });
        }
        opcoes.add(opcao.codigo);
      });
      if (item.ativo && item.minimo_opcoes > item.opcoes_preco.length) {
        ctx.addIssue({
          code: "custom",
          path: ["itens", indice, "minimo_opcoes"],
          message: "Cadastre as opções obrigatórias antes de tornar o item visível.",
        });
      }
    });
    itens.forEach((item, indice) => {
      if (!item.ativo) return;
      for (const requisito of REQUISITOS_DA_CONTRATACAO[item.codigo] ?? []) {
        const itemExigido = itens.find((candidate) => candidate.codigo === requisito.codigo);
        if (!itemExigido?.ativo) {
          ctx.addIssue({
            code: "custom",
            path: ["itens", indice, "ativo"],
            message: `Ative também ${itemExigido?.nome ?? requisito.codigo}.`,
          });
        }
      }
    });
  });

export type ItemDoCatalogo = z.infer<typeof itemDoCatalogoSchema>;

export const REQUISITOS_DA_CONTRATACAO: Readonly<
  Record<string, ReadonlyArray<{ codigo: string; quantidade_minima: number }>>
> = {
  legal_analytics: [{ codigo: "usuario_bi", quantidade_minima: 1 }],
  tv_legale: [
    { codigo: "tv_legale_ponto_fisico", quantidade_minima: 1 },
    { codigo: "tv_legale_armazenamento", quantidade_minima: 1 },
  ],
};

export const SEPARADOR_DA_OPCAO = "__opcao__";

export function codigoDaOpcao(itemCodigo: string, opcaoCodigo: string): string {
  return `${itemCodigo}${SEPARADOR_DA_OPCAO}${opcaoCodigo}`;
}

export function separarCodigoDaOpcao(codigo: string): [string, string] | null {
  const [itemCodigo, opcaoCodigo, excedente] = codigo.split(SEPARADOR_DA_OPCAO);
  return itemCodigo && opcaoCodigo && !excedente ? [itemCodigo, opcaoCodigo] : null;
}

export function erroNaComposicaoDaProposta(
  catalogo: ItemDoCatalogo[],
  itens: ReadonlyArray<{ codigo: string; quantidade: number }>,
): string | null {
  const catalogoPorCodigo = new Map(
    catalogo.map((catalogItem) => [catalogItem.codigo, catalogItem]),
  );
  const quantidadePorCodigo = new Map(
    itens.map((proposalItem) => [proposalItem.codigo, proposalItem.quantidade]),
  );
  const selecionados = new Set(
    itens
      .map((proposalItem) => proposalItem.codigo)
      .filter((codigo) => !codigo.endsWith("_setup") && !separarCodigoDaOpcao(codigo)),
  );

  for (const [codigo, requisitos] of Object.entries(REQUISITOS_DA_CONTRATACAO)) {
    if (!selecionados.has(codigo)) continue;
    for (const requisito of requisitos) {
      if ((quantidadePorCodigo.get(requisito.codigo) ?? 0) < requisito.quantidade_minima) {
        const nome = catalogoPorCodigo.get(codigo)?.nome ?? codigo;
        const nomeExigido = catalogoPorCodigo.get(requisito.codigo)?.nome ?? requisito.codigo;
        return `${nome} exige pelo menos ${requisito.quantidade_minima} ${nomeExigido}.`;
      }
    }
  }

  for (const [codigoPai, requisitos] of Object.entries(REQUISITOS_DA_CONTRATACAO)) {
    for (const requisito of requisitos) {
      if (!selecionados.has(requisito.codigo) || selecionados.has(codigoPai)) continue;
      const nomeExigido = catalogoPorCodigo.get(requisito.codigo)?.nome ?? requisito.codigo;
      const nomePai = catalogoPorCodigo.get(codigoPai)?.nome ?? codigoPai;
      return `${nomeExigido} só pode ser contratado com ${nomePai}.`;
    }
  }

  for (const catalogItem of catalogo) {
    if (!selecionados.has(catalogItem.codigo) || catalogItem.minimo_opcoes === 0) continue;
    const quantidadeOpcoes = itens.filter((proposalItem) => {
      const separada = separarCodigoDaOpcao(proposalItem.codigo);
      return separada?.[0] === catalogItem.codigo;
    }).length;
    if (quantidadeOpcoes < catalogItem.minimo_opcoes) {
      return `${catalogItem.nome} exige ao menos ${catalogItem.minimo_opcoes} contexto(s).`;
    }
  }
  return null;
}

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

type NovoItem = Pick<ItemDoCatalogo, "codigo" | "nome" | "descricao" | "categoria" | "ordem"> &
  Partial<Omit<ItemDoCatalogo, "codigo" | "nome" | "descricao" | "categoria" | "ordem">>;

function item(informacoes: NovoItem): ItemDoCatalogo {
  return {
    cobranca: "mensal",
    preco_escritorio_cents: 0,
    preco_departamento_cents: 0,
    setup_cents: 0,
    unidade: informacoes.categoria === "usuario" ? "usuário" : "módulo",
    faixas_preco: [],
    opcoes_preco: [],
    minimo_opcoes: 0,
    ativo: false,
    ...informacoes,
  };
}

export const CATALOGO_COMERCIAL_INICIAL: ItemDoCatalogo[] = [
  item({
    codigo: "gestao_processos",
    nome: "Gestão de Processo",
    descricao: "Organiza processos, prazos, movimentações e alertas.",
    categoria: "modulo",
    preco_escritorio_cents: 14225,
    preco_departamento_cents: 14225,
    ativo: true,
    ordem: 10,
  }),
  item({
    codigo: "publicacoes",
    nome: "Gestão de Publicação",
    descricao: "Captura e organiza publicações para a equipe jurídica.",
    categoria: "modulo",
    preco_escritorio_cents: 14225,
    preco_departamento_cents: 14225,
    ativo: true,
    ordem: 20,
  }),
  item({
    codigo: "similaridade_publicacoes",
    nome: "Gestão de Similaridade entre Publicações",
    descricao: "Identifica publicações semelhantes e ajuda a reduzir tratamentos repetidos.",
    categoria: "modulo",
    ordem: 30,
  }),
  item({
    codigo: "api_legale",
    nome: "API Legale",
    descricao: "Libera integrações por contexto contratado.",
    categoria: "modulo",
    unidade: "contexto",
    minimo_opcoes: 1,
    ordem: 40,
  }),
  item({
    codigo: "gestao_extrajudicial",
    nome: "Gestão Extrajudicial",
    descricao: "Organiza demandas e atividades extrajudiciais.",
    categoria: "modulo",
    ordem: 50,
  }),
  item({
    codigo: "gestao_tempo",
    nome: "Gestão de Tempo (Time Sheet)",
    descricao: "Registra e acompanha o tempo dedicado às atividades.",
    categoria: "modulo",
    ordem: 60,
  }),
  item({
    codigo: "gestao_financeira",
    nome: "Gestão Financeira",
    descricao: "Acompanha receitas, despesas e informações financeiras da operação.",
    categoria: "modulo",
    ordem: 70,
  }),
  item({
    codigo: "modulo_negocial",
    nome: "Gestão Módulo Negocial",
    descricao: "Organiza oportunidades e rotinas negociais.",
    categoria: "modulo",
    ordem: 80,
  }),
  item({
    codigo: "automacao_guias",
    nome: "Automação de Pagamento de Guias",
    descricao: "Automatiza o fluxo de pagamento e controle de guias.",
    categoria: "modulo",
    ordem: 90,
  }),
  item({
    codigo: "legal_analytics",
    nome: "Legale Analytics",
    descricao: "Indicadores para acompanhar a operação e apoiar decisões.",
    categoria: "modulo",
    preco_escritorio_cents: 19990,
    preco_departamento_cents: 19990,
    ativo: true,
    ordem: 100,
  }),
  item({
    codigo: "contratos",
    nome: "Gestão de Contratos",
    descricao: "Centraliza contratos, vencimentos, responsáveis e documentos.",
    categoria: "modulo",
    preco_escritorio_cents: 12800,
    preco_departamento_cents: 12800,
    ativo: true,
    ordem: 110,
  }),
  item({
    codigo: "assinatura_digital",
    nome: "Integração e Gestão de Assinatura Digital por Operadora",
    descricao: "Gerencia fluxos de assinatura integrados à operadora contratada.",
    categoria: "modulo",
    preco_escritorio_cents: 4225,
    preco_departamento_cents: 4225,
    setup_cents: 120000,
    ativo: true,
    ordem: 120,
  }),
  item({
    codigo: "recursos_humanos",
    nome: "Gestão de Recursos Humanos",
    descricao: "Centraliza rotinas e informações de recursos humanos.",
    categoria: "modulo",
    ordem: 130,
  }),
  item({
    codigo: "quadro_avisos",
    nome: "Gestão de Quadro de Avisos e Comunicação",
    descricao: "Publica avisos e comunicações internas para a equipe.",
    categoria: "modulo",
    ordem: 140,
  }),
  item({
    codigo: "portal_curriculos",
    nome: "Gestão Portal de Currículos",
    descricao: "Organiza a captação e a gestão de currículos.",
    categoria: "modulo",
    ordem: 150,
  }),
  item({
    codigo: "tv_legale",
    nome: "TV Legale",
    descricao: "Exibe informações e painéis da operação em pontos físicos.",
    categoria: "modulo",
    ordem: 160,
  }),
  item({
    codigo: "tv_legale_ponto_fisico",
    nome: "TV Legale — Ponto físico",
    descricao: "Ponto físico utilizado para exibição da TV Legale.",
    categoria: "servico",
    unidade: "ponto",
    faixas_preco: [
      { quantidade_minima: 1, preco_escritorio_cents: 0, preco_departamento_cents: 0 },
    ],
    ordem: 161,
  }),
  item({
    codigo: "tv_legale_armazenamento",
    nome: "TV Legale — Armazenamento",
    descricao: "Armazenamento utilizado pela TV Legale.",
    categoria: "servico",
    unidade: "GB",
    preco_escritorio_cents: 150,
    preco_departamento_cents: 150,
    faixas_preco: [
      { quantidade_minima: 1, preco_escritorio_cents: 150, preco_departamento_cents: 150 },
    ],
    ordem: 162,
  }),
  item({
    codigo: "ged_email",
    nome: "GED por e-mail",
    descricao: "Organiza documentos recebidos e enviados por e-mail.",
    categoria: "modulo",
    ordem: 170,
  }),
  item({
    codigo: "ia_resumo_publicacao",
    nome: "IA de Resumo e Sugestão de Publicação",
    descricao: "Resume publicações e sugere encaminhamentos para análise da equipe.",
    categoria: "modulo",
    ordem: 180,
  }),
  item({
    codigo: "plataforma_white_label",
    nome: "Plataforma White Label",
    descricao: "Disponibiliza a plataforma com identidade visual personalizada.",
    categoria: "modulo",
    ordem: 190,
  }),
  item({
    codigo: "gestao_correspondente",
    nome: "Gestão de Correspondente",
    descricao: "Organiza demandas e acompanhamento de correspondentes.",
    categoria: "modulo",
    ordem: 200,
  }),
  item({
    codigo: "usuario_legale",
    nome: "Usuário Legale",
    descricao: "Acesso completo à plataforma.",
    categoria: "usuario",
    preco_escritorio_cents: 4790,
    preco_departamento_cents: 4790,
    ativo: true,
    ordem: 300,
  }),
  item({
    codigo: "area_cliente",
    nome: "Área do Cliente",
    descricao: "Acesso destinado ao cliente do escritório.",
    categoria: "usuario",
    preco_escritorio_cents: 4200,
    preco_departamento_cents: 4200,
    ativo: true,
    ordem: 310,
  }),
  item({
    codigo: "usuario_bi",
    nome: "Usuário BI",
    descricao: "Acesso aos painéis do Legale Analytics.",
    categoria: "usuario",
    preco_escritorio_cents: 3990,
    preco_departamento_cents: 3990,
    ativo: true,
    ordem: 320,
  }),
  item({
    codigo: "usuarios_limitados",
    nome: "Usuários limitados",
    descricao: "Acessos para consulta e operação conforme as permissões contratadas.",
    categoria: "usuario",
    preco_escritorio_cents: 4200,
    preco_departamento_cents: 4200,
    faixas_preco: [
      { quantidade_minima: 1, preco_escritorio_cents: 4200, preco_departamento_cents: 4200 },
      { quantidade_minima: 11, preco_escritorio_cents: 2800, preco_departamento_cents: 2800 },
      { quantidade_minima: 31, preco_escritorio_cents: 1800, preco_departamento_cents: 1800 },
      { quantidade_minima: 76, preco_escritorio_cents: 1500, preco_departamento_cents: 1500 },
      { quantidade_minima: 101, preco_escritorio_cents: 1000, preco_departamento_cents: 1000 },
    ],
    ativo: true,
    ordem: 330,
  }),
  item({
    codigo: "monitoramento_processos",
    nome: "Monitoramento de processos",
    descricao: "Acompanhamento de movimentações e geração de alertas.",
    categoria: "servico",
    unidade: "processo",
    preco_escritorio_cents: 85,
    preco_departamento_cents: 85,
    faixas_preco: [
      { quantidade_minima: 100, preco_escritorio_cents: 85, preco_departamento_cents: 85 },
      { quantidade_minima: 1000, preco_escritorio_cents: 75, preco_departamento_cents: 75 },
      { quantidade_minima: 10000, preco_escritorio_cents: 65, preco_departamento_cents: 65 },
      { quantidade_minima: 20001, preco_escritorio_cents: 55, preco_departamento_cents: 55 },
    ],
    ativo: true,
    ordem: 400,
  }),
];

export function catalogoComercialEfetivo(
  cadastrados: ItemDoCatalogo[] | null | undefined,
): ItemDoCatalogo[] {
  const porCodigo = new Map(
    CATALOGO_COMERCIAL_INICIAL.map((catalogItem) => [catalogItem.codigo, catalogItem] as const),
  );
  for (const itemCadastrado of cadastrados ?? []) {
    const parsed = itemDoCatalogoSchema.safeParse(itemCadastrado);
    if (parsed.success) porCodigo.set(parsed.data.codigo, parsed.data);
  }
  return [...porCodigo.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
