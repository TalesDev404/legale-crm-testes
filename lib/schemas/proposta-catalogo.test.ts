import { describe, expect, it } from "vitest";

import {
  CATALOGO_COMERCIAL_INICIAL,
  catalogoComercialEfetivo,
  catalogoComercialSchema,
  codigoDaOpcao,
  erroNaComposicaoDaProposta,
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

  it("combina o catálogo padrão com itens já cadastrados", () => {
    const personalizado = {
      ...CATALOGO_COMERCIAL_INICIAL[0]!,
      nome: "Gestão personalizada",
      ativo: false,
    };
    const resultado = catalogoComercialEfetivo([personalizado]);

    expect(resultado.find((item) => item.codigo === personalizado.codigo)).toMatchObject({
      nome: "Gestão personalizada",
      ativo: false,
    });
    expect(resultado.some((item) => item.codigo === "publicacoes")).toBe(true);
    expect(resultado.some((item) => item.codigo === "monitoramento_processos")).toBe(true);
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

  it("cadastra todos os módulos oficiais sem liberar os que ainda não têm preço", () => {
    expect(CATALOGO_COMERCIAL_INICIAL).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: "api_legale", ativo: false, minimo_opcoes: 1 }),
        expect.objectContaining({ codigo: "legal_analytics", ativo: true }),
        expect.objectContaining({ codigo: "tv_legale", ativo: false }),
        expect.objectContaining({
          codigo: "tv_legale_armazenamento",
          preco_departamento_cents: 150,
          unidade: "GB",
        }),
        expect.objectContaining({ codigo: "gestao_correspondente", ativo: false }),
      ]),
    );
  });

  it("exige usuário de BI quando o Legale Analytics entra na proposta", () => {
    expect(
      erroNaComposicaoDaProposta(CATALOGO_COMERCIAL_INICIAL, [
        { codigo: "legal_analytics", quantidade: 1 },
      ]),
    ).toContain("Usuário BI");
    expect(
      erroNaComposicaoDaProposta(CATALOGO_COMERCIAL_INICIAL, [
        { codigo: "legal_analytics", quantidade: 1 },
        { codigo: "usuario_bi", quantidade: 1 },
      ]),
    ).toBeNull();
    expect(
      erroNaComposicaoDaProposta(CATALOGO_COMERCIAL_INICIAL, [
        { codigo: "usuario_bi", quantidade: 1 },
      ]),
    ).toContain("Legale Analytics");
  });

  it("exige a quantidade mínima de contextos configurada para a API", () => {
    const api = CATALOGO_COMERCIAL_INICIAL.find((item) => item.codigo === "api_legale")!;
    const catalogo = [
      {
        ...api,
        ativo: true,
        opcoes_preco: [
          {
            codigo: "processos",
            nome: "Processos",
            descricao: "",
            preco_escritorio_cents: 10000,
            preco_departamento_cents: 12000,
          },
        ],
      },
    ];

    expect(
      erroNaComposicaoDaProposta(catalogo, [{ codigo: "api_legale", quantidade: 1 }]),
    ).toContain("1 contexto");
    expect(
      erroNaComposicaoDaProposta(catalogo, [
        { codigo: "api_legale", quantidade: 1 },
        { codigo: codigoDaOpcao("api_legale", "processos"), quantidade: 1 },
      ]),
    ).toBeNull();
  });
});
