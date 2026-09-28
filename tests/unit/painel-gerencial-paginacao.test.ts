import { describe, expect, it } from "vitest";

import { carregarPaginas } from "@/lib/gerencial/carregar";

describe("dados do painel gerencial", () => {
  it("não perde registros depois da primeira página da API", async () => {
    const dados = [1, 2, 3, 4, 5];
    const intervalos: string[] = [];
    const resultado = await carregarPaginas(
      (de, ate) => {
        intervalos.push(`${de}-${ate}`);
        return Promise.resolve({ data: dados.slice(de, ate + 1), error: null });
      },
      10,
      2,
    );

    expect(intervalos).toEqual(["0-1", "2-3", "4-5"]);
    expect(resultado).toEqual({ rows: dados, truncated: false });
  });

  it("avisa quando o teto pode ter ocultado linhas", async () => {
    const resultado = await carregarPaginas(
      (de, ate) =>
        Promise.resolve({
          data: [1, 2, 3, 4, 5].slice(de, ate + 1),
          error: null,
        }),
      4,
      2,
    );
    expect(resultado).toEqual({ rows: [1, 2, 3, 4], truncated: true });
  });

  it("não apresenta total parcial quando uma página falha", async () => {
    await expect(
      carregarPaginas(
        (de) =>
          Promise.resolve(
            de
              ? {
                  data: null,
                  error: { message: "consulta indisponível" },
                }
              : { data: [1, 2], error: null },
          ),
        10,
        2,
      ),
    ).rejects.toThrow("consulta indisponível");
  });
});
