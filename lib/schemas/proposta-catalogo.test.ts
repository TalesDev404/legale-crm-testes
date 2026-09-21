import { describe, expect, it } from "vitest";

import {
  CATALOGO_COMERCIAL_INICIAL,
  catalogoComercialSchema,
  precoDoCatalogo,
} from "./proposta-catalogo";

describe("catálogo comercial configurável", () => {
  it("mantém códigos únicos no catálogo inicial", () => {
    const codigos = CATALOGO_COMERCIAL_INICIAL.map((item) => item.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(catalogoComercialSchema.safeParse({ itens: CATALOGO_COMERCIAL_INICIAL }).success).toBe(
      true,
    );
  });

  it("aplica a faixa por quantidade e o preço do tipo de cliente", () => {
    const item = {
      ...CATALOGO_COMERCIAL_INICIAL[0]!,
      preco_escritorio_cents: 5000,
      preco_departamento_cents: 6000,
      faixas_preco: [
        {
          quantidade_minima: 1,
          preco_escritorio_cents: 4000,
          preco_departamento_cents: 4500,
        },
        {
          quantidade_minima: 11,
          preco_escritorio_cents: 3000,
          preco_departamento_cents: 3500,
        },
      ],
    };

    expect(precoDoCatalogo(item, 10, "escritorio")).toBe(4000);
    expect(precoDoCatalogo(item, 11, "departamento_juridico")).toBe(3500);
  });

  it("recusa códigos duplicados e faixas fora de ordem", () => {
    const item = CATALOGO_COMERCIAL_INICIAL[0]!;
    const result = catalogoComercialSchema.safeParse({
      itens: [
        { ...item, faixas_preco: [] },
        {
          ...item,
          faixas_preco: [
            {
              quantidade_minima: 10,
              preco_escritorio_cents: 100,
              preco_departamento_cents: 100,
            },
            {
              quantidade_minima: 5,
              preco_escritorio_cents: 90,
              preco_departamento_cents: 90,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
