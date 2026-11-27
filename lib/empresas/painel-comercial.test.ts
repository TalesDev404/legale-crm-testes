import { describe, expect, it } from "vitest";

import { calcularPainelComercial, type EtapaDoPainel, type NegocioDoPainel } from "./painel-comercial";

const etapa = (id: string, position: number, chance: number | null, prazoHoras: number | null, extra: Partial<EtapaDoPainel> = {}): EtapaDoPainel => ({
  id,
  name: id,
  position,
  is_archived: false,
  is_won: false,
  is_lost: false,
  win_probability: chance,
  expected_duration_hours: prazoHoras,
  ...extra,
});

const negocio = (id: string, n: Partial<NegocioDoPainel>): NegocioDoPainel => ({
  id,
  title: id,
  status: "open",
  stage_id: "novo",
  created_at: "2026-11-01T12:00:00Z",
  closed_at: null,
  stage_changed_at: "2026-11-01T12:00:00Z",
  proposal_monthly_cents: null,
  value_cents: null,
  account_id: null,
  ...n,
});

const ETAPAS = [
  etapa("novo", 1, 10, 24),
  etapa("negociacao", 2, 75, 240),
  etapa("ganho", 3, 100, null, { is_won: true }),
  etapa("perdido", 4, 0, null, { is_lost: true }),
];
const AGORA = Date.parse("2026-11-26T12:00:00Z");
const PERIODO = { inicio: "2026-11-01T03:00:00.000Z", fimExclusivo: "2026-11-27T03:00:00.000Z", agora: AGORA };

describe("painel comercial", () => {
  it("pondera o pipeline pela chance da etapa e usa a mensalidade da proposta antes do valor do card", () => {
    const p = calcularPainelComercial({
      negocios: [
        negocio("a", { stage_id: "novo", value_cents: 100_000 }),
        negocio("b", { stage_id: "negociacao", value_cents: 1, proposal_monthly_cents: 200_000 }),
      ],
      etapas: ETAPAS,
      tarefas: [],
      ...PERIODO,
    });
    expect(p.abertos).toEqual({ qtd: 2, mensalCents: 300_000 });
    expect(p.ponderadoCents).toBe(10_000 + 150_000);
    expect(p.porEtapa.map((e) => [e.etapa.id, e.qtd])).toEqual([
      ["novo", 1],
      ["negociacao", 1],
    ]);
  });

  it("conta ganhos e perdas só do período, com taxa de ganho e ciclo médio", () => {
    const p = calcularPainelComercial({
      negocios: [
        negocio("g1", { status: "won", created_at: "2026-11-01T12:00:00Z", closed_at: "2026-11-11T12:00:00Z", value_cents: 50_000 }),
        negocio("g2", { status: "won", created_at: "2026-10-22T12:00:00Z", closed_at: "2026-11-21T12:00:00Z", value_cents: 50_000 }),
        negocio("p1", { status: "lost", closed_at: "2026-11-05T12:00:00Z" }),
        negocio("velho", { status: "won", closed_at: "2026-09-01T12:00:00Z" }),
      ],
      etapas: ETAPAS,
      tarefas: [],
      ...PERIODO,
    });
    expect(p.ganhos).toEqual({ qtd: 2, mensalCents: 100_000 });
    expect(p.perdidos).toBe(1);
    expect(p.taxaDeGanho).toBe(67);
    expect(p.cicloMedioDias).toBe(20);
  });

  it("sem nada fechado, taxa e ciclo ficam vazios em vez de zero", () => {
    const p = calcularPainelComercial({ negocios: [], etapas: ETAPAS, tarefas: [], ...PERIODO });
    expect(p.taxaDeGanho).toBeNull();
    expect(p.cicloMedioDias).toBeNull();
  });

  it("aponta quem está sem próximo passo e quem passou do prazo da etapa", () => {
    const p = calcularPainelComercial({
      negocios: [
        negocio("com-tarefa", { stage_id: "negociacao", stage_changed_at: "2026-11-25T12:00:00Z" }),
        negocio("sem-tarefa", { stage_id: "negociacao", stage_changed_at: "2026-11-25T12:00:00Z" }),
        negocio("parado", { stage_id: "novo", stage_changed_at: "2026-11-20T12:00:00Z" }),
      ],
      etapas: ETAPAS,
      tarefas: [
        { lead_id: "com-tarefa", status: "pending" },
        { lead_id: "parado", status: "in_progress" },
        { lead_id: "sem-tarefa", status: "done" },
      ],
      ...PERIODO,
    });
    expect(p.semProximoPasso.map((n) => n.id)).toEqual(["sem-tarefa"]);
    expect(p.parados.map((n) => [n.id, n.dias, n.prazoDias])).toEqual([["parado", 6, 1]]);
  });
});
