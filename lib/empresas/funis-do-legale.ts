/**
 * OS FUNIS DO LEGALE — a configuração que `scripts/legale-configurar-organizacao.ts`
 * aplica na organização.
 *
 * O comercial é o funil da planilha "Controle de CRM e CS" com as
 * apresentações dentro dele: a demonstração do sistema é o momento em que o
 * Legale ganha ou perde a venda, e na planilha ela só existia no Outlook.
 *
 * A implantação é o funil do Sucesso do Cliente nos primeiros meses: do
 * contrato assinado ao escritório usando o sistema.
 *
 * `prazoHoras` vira `crm_stages.expected_duration_hours` (o SLA da etapa) e
 * `passo` vira `agent_stage_hint` — um por funil, com `won`/`lost` coerentes
 * com `is_won`/`is_lost` (migration 0084).
 */
import type { CustomFieldDef } from "@/lib/schemas/settings";

export type PassoDoAgente = "new" | "contacted" | "qualifying" | "qualified" | "negotiating" | "won" | "lost";

export interface EtapaDoFunil {
  nome: string;
  slug: string;
  passo: PassoDoAgente | null;
  prazoHoras: number | null;
  cor: string;
  descricao: string;
}

export interface FunilDoLegale {
  nome: string;
  slug: string;
  descricao: string;
  padrao: boolean;
  vocabulario: { lead: string; lead_plural: string; deal: string; deal_plural: string; won: string; lost: string };
  etapas: EtapaDoFunil[];
  campos: CustomFieldDef[];
  motivosDePerda: string[];
}

const ORIGENS = ["Site", "Indicação", "Evento", "Prospecção ativa", "Parceiro", "Cliente da base (upsell)"];

export const FUNIL_COMERCIAL: FunilDoLegale = {
  nome: "Comercial Legale",
  slug: "comercial-legale",
  descricao: "Do primeiro contato ao contrato: apresentação do sistema, proposta e negociação.",
  padrao: true,
  vocabulario: {
    lead: "Empresa",
    lead_plural: "Empresas",
    deal: "Negócio",
    deal_plural: "Negócios",
    won: "Ganho",
    lost: "Perdido",
  },
  etapas: [
    {
      nome: "Novo lead",
      slug: "novo_lead",
      passo: "new",
      prazoHoras: 24,
      cor: "#64748b",
      descricao: "Chegou pelo site, indicação ou evento. Responder em até 1 dia útil.",
    },
    {
      nome: "Contato feito",
      slug: "contato_feito",
      passo: "contacted",
      prazoHoras: 72,
      cor: "#0ea5e9",
      descricao: "Já conversamos. Próximo passo: marcar a apresentação.",
    },
    {
      nome: "Apresentação agendada",
      slug: "apresentacao_agendada",
      passo: "qualifying",
      prazoHoras: 168,
      cor: "#6366f1",
      descricao: "Demonstração marcada no Outlook.",
    },
    {
      nome: "Apresentação realizada",
      slug: "apresentacao_realizada",
      passo: "qualified",
      prazoHoras: 72,
      cor: "#8b5cf6",
      descricao: "Sistema apresentado. Montar e enviar a proposta.",
    },
    {
      nome: "Proposta enviada",
      slug: "proposta_enviada",
      passo: null,
      prazoHoras: 168,
      cor: "#f59e0b",
      descricao: "Proposta com o cliente. Follow-up em 3 dias.",
    },
    {
      nome: "Negociação",
      slug: "negociacao",
      passo: "negotiating",
      prazoHoras: 240,
      cor: "#f97316",
      descricao: "Ajuste de escopo, preço ou prazo. Envolver a diretoria se precisar.",
    },
    {
      nome: "Ganho",
      slug: "ganho",
      passo: "won",
      prazoHoras: null,
      cor: "#16a34a",
      descricao: "Contrato fechado. A empresa passa para o Sucesso do Cliente.",
    },
    {
      nome: "Perdido",
      slug: "perdido",
      passo: "lost",
      prazoHoras: null,
      cor: "#dc2626",
      descricao: "Registrar o motivo da perda.",
    },
  ],
  campos: [
    { key: "origem", label: "Origem", type: "select", options: ORIGENS.map((o) => ({ value: o, label: o })) },
    {
      key: "tipo_cliente",
      label: "Tipo de cliente",
      type: "select",
      options: [
        { value: "escritorio", label: "Escritório" },
        { value: "departamento_juridico", label: "Departamento jurídico" },
      ],
    },
    { key: "qtd_usuarios", label: "Quantidade de usuários", type: "number" },
    {
      key: "modulos_interesse",
      label: "Módulos de interesse",
      type: "multiselect",
      options: [
        { value: "legale", label: "Legale (gestão jurídica)" },
        { value: "bi", label: "Legale Analytics / BI" },
        { value: "monitoramento", label: "Monitoramento de processos" },
        { value: "publicacoes", label: "Publicações" },
        { value: "financeiro", label: "Financeiro" },
        { value: "ged", label: "GED e assinatura" },
        { value: "tv_legale", label: "TV Legale" },
        { value: "api", label: "API Legale" },
      ],
    },
    { key: "sistema_atual", label: "Sistema que usa hoje", type: "text" },
    { key: "data_apresentacao", label: "Data da apresentação", type: "date" },
    { key: "link_proposta_legada", label: "Link da proposta (ferramenta antiga)", type: "url" },
  ],
  motivosDePerda: [
    "Preço",
    "Escolheu concorrente",
    "Sem orçamento agora",
    "Adiou o projeto",
    "Parou de responder",
    "Falta funcionalidade",
    "Fora do perfil",
  ],
};

export const FUNIL_IMPLANTACAO: FunilDoLegale = {
  nome: "Implantação (CS)",
  slug: "implantacao-cs",
  descricao: "Do contrato assinado ao escritório usando o Legale no dia a dia.",
  padrao: false,
  vocabulario: {
    lead: "Cliente",
    lead_plural: "Clientes",
    deal: "Implantação",
    deal_plural: "Implantações",
    won: "Em uso",
    lost: "Cancelado",
  },
  etapas: [
    { nome: "Contrato assinado", slug: "contrato_assinado", passo: "new", prazoHoras: 72, cor: "#64748b", descricao: "Agendar o kickoff." },
    { nome: "Kickoff", slug: "kickoff", passo: "contacted", prazoHoras: 168, cor: "#0ea5e9", descricao: "Reunião inicial, acessos e cronograma." },
    {
      nome: "Configuração e migração",
      slug: "configuracao_migracao",
      passo: "qualifying",
      prazoHoras: 504,
      cor: "#6366f1",
      descricao: "Cadastros base, importação de processos e integrações.",
    },
    { nome: "Treinamento", slug: "treinamento", passo: "qualified", prazoHoras: 336, cor: "#8b5cf6", descricao: "Treinamentos por módulo." },
    {
      nome: "Acompanhamento inicial",
      slug: "acompanhamento_inicial",
      passo: "negotiating",
      prazoHoras: 720,
      cor: "#f59e0b",
      descricao: "Primeiros 30 dias de uso, com contato semanal.",
    },
    { nome: "Em uso", slug: "em_uso", passo: "won", prazoHoras: null, cor: "#16a34a", descricao: "Implantação concluída." },
    { nome: "Cancelado", slug: "cancelado", passo: "lost", prazoHoras: null, cor: "#dc2626", descricao: "Registrar o motivo." },
  ],
  campos: [
    { key: "codigo_w", label: "Código no Legale", type: "text" },
    { key: "data_kickoff", label: "Data do kickoff", type: "date" },
    { key: "data_go_live", label: "Data de início de uso", type: "date" },
  ],
  motivosDePerda: ["Desistiu antes de usar", "Problema na migração", "Falta funcionalidade", "Financeiro"],
};

export const FUNIS_DO_LEGALE: readonly FunilDoLegale[] = [FUNIL_COMERCIAL, FUNIL_IMPLANTACAO];
