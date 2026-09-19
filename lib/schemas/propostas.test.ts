import { describe, expect, it } from "vitest";

import { propostaCreateSchema, valorMonitoramento, valorUsuarioLimitado } from "./propostas";

describe("tabelas comerciais da proposta", () => {
  it("aplica a faixa correta exatamente nas viradas de usuários", () => {
    expect(valorUsuarioLimitado(10)).toBe(4200);
    expect(valorUsuarioLimitado(11)).toBe(2800);
    expect(valorUsuarioLimitado(30)).toBe(2800);
    expect(valorUsuarioLimitado(31)).toBe(1800);
    expect(valorUsuarioLimitado(100)).toBe(1500);
    expect(valorUsuarioLimitado(101)).toBe(1000);
  });

  it("aplica o valor do monitoramento por volume", () => {
    expect(valorMonitoramento(99)).toBe(0);
    expect(valorMonitoramento(100)).toBe(85);
    expect(valorMonitoramento(1_000)).toBe(75);
    expect(valorMonitoramento(10_000)).toBe(65);
    expect(valorMonitoramento(20_001)).toBe(55);
  });

  it("recusa item cujo total não corresponde à quantidade", () => {
    const result = propostaCreateSchema.safeParse({
      client_name: "Cliente teste",
      client_kind: "departamento_juridico",
      issue_date: "2026-09-18",
      valid_until: "2026-10-03",
      items: [{ codigo: "x", nome: "Módulo", quantidade: 2, valor_unitario_cents: 100, total_cents: 100, cobranca: "mensal", categoria: "modulo" }],
    });
    expect(result.success).toBe(false);
  });
});
