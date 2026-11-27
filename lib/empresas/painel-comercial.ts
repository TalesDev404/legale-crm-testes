/**
 * OS NÚMEROS DO FUNIL COMERCIAL — o bloco do painel gerencial que responde
 * "quanto deve entrar, quanto entrou e o que está travado".
 *
 * Função pura sobre o que a tela já carregou: sem banco aqui, para o cálculo
 * ser testado com números escritos à mão.
 *
 * Valor de um negócio = mensalidade das propostas ligadas a ele
 * (`proposal_monthly_cents`, mantida pelo gatilho da migration 0316) ou, sem
 * proposta, o valor digitado no card (`value_cents`). O Legale vende
 * mensalidade, então tudo aqui é R$/mês.
 */

export interface NegocioDoPainel {
  id: string;
  title: string;
  status: string;
  stage_id: string;
  created_at: string;
  closed_at: string | null;
  stage_changed_at: string | null;
  proposal_monthly_cents: number | null;
  value_cents: number | null;
  account_id: string | null;
}

export interface EtapaDoPainel {
  id: string;
  name: string;
  position: number;
  is_archived: boolean;
  is_won: boolean;
  is_lost: boolean;
  win_probability: number | null;
  expected_duration_hours: number | null;
}

export interface TarefaDoPainel {
  lead_id: string | null;
  status: string;
}

export interface NegocioEmDestaque {
  id: string;
  title: string;
  account_id: string | null;
  etapa: string;
  dias: number;
  prazoDias: number | null;
  valorCents: number;
}

export interface PainelComercial {
  abertos: { qtd: number; mensalCents: number };
  ponderadoCents: number;
  ganhos: { qtd: number; mensalCents: number };
  perdidos: number;
  /** 0–100, ou `null` quando nada fechou no período. */
  taxaDeGanho: number | null;
  /** Dias da criação ao ganho, média dos ganhos do período. */
  cicloMedioDias: number | null;
  porEtapa: Array<{ etapa: EtapaDoPainel; qtd: number; mensalCents: number; ponderadoCents: number }>;
  /** Abertos sem nenhuma tarefa pendente: ninguém combinou o próximo passo. */
  semProximoPasso: NegocioEmDestaque[];
  /** Abertos há mais tempo na etapa do que o prazo dela. */
  parados: NegocioEmDestaque[];
}

const DIA_MS = 86_400_000;

export function valorDoNegocio(n: Pick<NegocioDoPainel, "proposal_monthly_cents" | "value_cents">): number {
  return Number(n.proposal_monthly_cents ?? n.value_cents ?? 0);
}

/** Dias inteiros que o negócio está na etapa atual. */
export function diasNaEtapa(
  n: Pick<NegocioDoPainel, "stage_changed_at" | "created_at">,
  agora: number,
): number {
  const desde = Date.parse(n.stage_changed_at ?? n.created_at);
  return Math.max(0, Math.floor((agora - desde) / DIA_MS));
}

export function calcularPainelComercial(entrada: {
  negocios: NegocioDoPainel[];
  etapas: EtapaDoPainel[];
  tarefas: TarefaDoPainel[];
  /** ISO, inclusivo. */
  inicio: string;
  /** ISO, exclusivo. */
  fimExclusivo: string;
  agora: number;
}): PainelComercial {
  const { negocios, etapas, tarefas, inicio, fimExclusivo, agora } = entrada;
  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));
  const abertos = negocios.filter((n) => n.status === "open");
  const noPeriodo = (iso: string | null) => !!iso && iso >= inicio && iso < fimExclusivo;
  const ganhos = negocios.filter((n) => n.status === "won" && noPeriodo(n.closed_at));
  const perdidos = negocios.filter((n) => n.status === "lost" && noPeriodo(n.closed_at));

  const chance = (n: NegocioDoPainel) => etapaPorId.get(n.stage_id)?.win_probability ?? 0;
  const ponderado = (n: NegocioDoPainel) => Math.round((valorDoNegocio(n) * chance(n)) / 100);
  const soma = (lista: NegocioDoPainel[], f: (n: NegocioDoPainel) => number) =>
    lista.reduce((t, n) => t + f(n), 0);

  const ciclos = ganhos
    .filter((n) => n.closed_at)
    .map((n) => (Date.parse(n.closed_at as string) - Date.parse(n.created_at)) / DIA_MS);

  const comTarefa = new Set(
    tarefas
      .filter((t) => t.lead_id && (t.status === "pending" || t.status === "in_progress"))
      .map((t) => t.lead_id as string),
  );

  const destaque = (n: NegocioDoPainel): NegocioEmDestaque => {
    const etapa = etapaPorId.get(n.stage_id);
    return {
      id: n.id,
      title: n.title,
      account_id: n.account_id,
      etapa: etapa?.name ?? "—",
      dias: diasNaEtapa(n, agora),
      prazoDias: etapa?.expected_duration_hours ? Math.ceil(etapa.expected_duration_hours / 24) : null,
      valorCents: valorDoNegocio(n),
    };
  };

  const porEtapa = etapas
    .filter((e) => !e.is_archived && !e.is_won && !e.is_lost)
    .sort((a, b) => a.position - b.position)
    .map((etapa) => {
      const daEtapa = abertos.filter((n) => n.stage_id === etapa.id);
      return {
        etapa,
        qtd: daEtapa.length,
        mensalCents: soma(daEtapa, valorDoNegocio),
        ponderadoCents: soma(daEtapa, ponderado),
      };
    })
    .filter((e) => e.qtd > 0);

  const fechados = ganhos.length + perdidos.length;
  return {
    abertos: { qtd: abertos.length, mensalCents: soma(abertos, valorDoNegocio) },
    ponderadoCents: soma(abertos, ponderado),
    ganhos: { qtd: ganhos.length, mensalCents: soma(ganhos, valorDoNegocio) },
    perdidos: perdidos.length,
    taxaDeGanho: fechados > 0 ? Math.round((ganhos.length / fechados) * 100) : null,
    cicloMedioDias: ciclos.length > 0 ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null,
    porEtapa,
    semProximoPasso: abertos
      .filter((n) => !comTarefa.has(n.id))
      .map(destaque)
      .sort((a, b) => b.valorCents - a.valorCents),
    parados: abertos
      .map(destaque)
      .filter((d) => d.prazoDias != null && d.dias > d.prazoDias)
      .sort((a, b) => b.dias - (b.prazoDias ?? 0) - (a.dias - (a.prazoDias ?? 0))),
  };
}
