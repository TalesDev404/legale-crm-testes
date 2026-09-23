import { describe, expect, it } from "vitest";

import { valorDoCard } from "@/lib/leads/valor-do-card";
import { buildCardInput } from "@/lib/kanban/card-state";

describe("valor exibido no card", () => {
  it("usa o valor manual quando não há proposta vinculada", () => {
    expect(
      valorDoCard({ value_cents: 9000, currency: "BRL", proposal_monthly_cents: null }),
    ).toEqual({ cents: 9000, oneTimeCents: null, currency: "BRL", fromProposals: false });
  });

  it("mostra a mensalidade das propostas sem apagar o valor manual", () => {
    const lead = {
      value_cents: 9000,
      currency: "BRL",
      proposal_monthly_cents: 18500,
      proposal_activation_cents: 42000,
    };
    expect(valorDoCard(lead)).toEqual({
      cents: 18500,
      oneTimeCents: 42000,
      currency: "BRL",
      fromProposals: true,
    });
    expect(lead.value_cents).toBe(9000);
  });

  it("zero contratado é um valor válido e não recorre ao manual", () => {
    expect(
      valorDoCard({
        value_cents: 9000,
        currency: "BRL",
        proposal_monthly_cents: 0,
        proposal_activation_cents: 15000,
      }),
    ).toEqual({ cents: 0, oneTimeCents: 15000, currency: "BRL", fromProposals: true });
  });

  it("leva a mensalidade com centavos para o card do funil", () => {
    const lead = {
      id: "negocio-1",
      title: "Cliente",
      value_cents: 9000,
      proposal_monthly_cents: 18855,
      proposal_activation_cents: 67000,
      currency: "BRL",
      tags: [],
      created_at: "2026-09-22T12:00:00Z",
      last_activity_at: null,
      owner_kind: null,
      owner_user_id: null,
      owner_agent_id: null,
      owner_agent: null,
      next_action: null,
      score: null,
    } satisfies Parameters<typeof buildCardInput>[0];
    const card = buildCardInput(lead, {
      stageName: "Proposta",
      ownerNames: new Map(),
      now: new Date("2026-09-22T12:00:00Z"),
    });
    expect(card.valueCents).toBe(18855);
    expect(card.oneTimeCents).toBe(67000);
    expect(card.valueFromProposals).toBe(true);
  });

  it("mostra valor único zero quando há propostas sem cobrança inicial", () => {
    expect(
      valorDoCard({
        value_cents: 9000,
        currency: "BRL",
        proposal_monthly_cents: 18500,
        proposal_activation_cents: 0,
      }).oneTimeCents,
    ).toBe(0);
  });
});
