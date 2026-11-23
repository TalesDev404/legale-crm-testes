import { describe, expect, it } from "vitest";

import { FUNIS_DO_LEGALE } from "@/lib/empresas/funis-do-legale";
import { customFieldSchema } from "@/lib/schemas/settings";

describe("funis do Legale", () => {
  for (const funil of FUNIS_DO_LEGALE) {
    describe(funil.nome, () => {
      it("respeita os formatos de slug do banco", () => {
        expect(funil.slug).toMatch(/^[a-z0-9_-]{2,40}$/);
        for (const e of funil.etapas) expect(e.slug).toMatch(/^[a-z0-9_-]{2,40}$/);
        expect(new Set(funil.etapas.map((e) => e.slug)).size).toBe(funil.etapas.length);
      });

      it("tem exatamente um ganho e uma perda, com passo único por etapa", () => {
        expect(funil.etapas.filter((e) => e.passo === "won")).toHaveLength(1);
        expect(funil.etapas.filter((e) => e.passo === "lost")).toHaveLength(1);
        const passos = funil.etapas.map((e) => e.passo).filter(Boolean);
        expect(new Set(passos).size).toBe(passos.length);
      });

      it("campos passam no schema que a tela de configuração usa", () => {
        for (const campo of funil.campos) expect(customFieldSchema.safeParse(campo).success).toBe(true);
      });

      it("cores no formato do CHECK", () => {
        for (const e of funil.etapas) expect(e.cor).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  }

  it("só um funil é o padrão", () => {
    expect(FUNIS_DO_LEGALE.filter((f) => f.padrao)).toHaveLength(1);
  });
});
