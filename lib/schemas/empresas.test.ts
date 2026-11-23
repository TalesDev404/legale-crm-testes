import { describe, expect, it } from "vitest";

import {
  atividadeCreateSchema,
  chaveDoNome,
  codigoWDoNome,
  empresaCreateSchema,
  empresaPatchSchema,
  normalizarCodigoW,
  saudeDaEmpresa,
  type Empresa,
} from "@/lib/schemas/empresas";

const HOJE = new Date("2026-11-16T12:00:00");

function cliente(parcial: Partial<Empresa> = {}) {
  return {
    lifecycle: "cliente" as const,
    follow_up_every_days: 30,
    next_follow_up_on: null,
    contract_signed: true,
    pays_legale: true,
    renewal_date: null,
    health_override: null,
    ...parcial,
  };
}

describe("chaveDoNome", () => {
  it("junta as grafias da planilha, da proposta e do contrato", () => {
    expect(chaveDoNome("Chiappa Advogados (W463)")).toBe("chiappa");
    expect(chaveDoNome("CHIAPPA ADVOGADOS")).toBe("chiappa");
    expect(chaveDoNome("Faiani, Borges e Lopes - Sociedade de Advogados")).toBe("faiani borges e lopes");
    expect(chaveDoNome("Rocha Advocacia Ltda.")).toBe("rocha");
  });

  it("não devolve vazio quando o nome é só sufixo", () => {
    expect(chaveDoNome("Advogados")).toBe("advogados");
  });
});

describe("código W", () => {
  it("sai do nome entre parênteses", () => {
    expect(codigoWDoNome("MRTC Advogados (W1165)")).toBe("W1165");
    expect(codigoWDoNome("Paulo Pastori (w 21)")).toBe("W21");
    expect(codigoWDoNome("Moore Brasil")).toBeNull();
  });

  it("normaliza o que a pessoa digita", () => {
    expect(normalizarCodigoW("w0463")).toBe("W463");
    expect(normalizarCodigoW("463")).toBe("W463");
    expect(normalizarCodigoW("W-12")).toBe("W12");
    expect(normalizarCodigoW("ABC")).toBeNull();
  });
});

describe("saudeDaEmpresa", () => {
  it("prospect não tem saúde", () => {
    expect(saudeDaEmpresa(cliente({ lifecycle: "prospect" }), null, HOJE).nivel).toBeNull();
  });

  it("cliente em dia, pagando e com contrato é saudável", () => {
    const s = saudeDaEmpresa(cliente(), "2026-11-10T10:00:00Z", HOJE);
    expect(s.nota).toBe(100);
    expect(s.nivel).toBe("saudavel");
    expect(s.motivos).toEqual([]);
  });

  it("sem contato há mais que o dobro da frequência e sem pagamento fica em risco", () => {
    const s = saudeDaEmpresa(cliente({ pays_legale: false }), "2026-09-01T10:00:00Z", HOJE);
    expect(s.nivel).toBe("em_risco");
    expect(s.nota).toBe(40);
    expect(s.motivos[0]?.texto).toMatch(/dias sem contato/);
  });

  it("renovação próxima e follow-up vencido viram atenção, com motivo", () => {
    const s = saudeDaEmpresa(
      cliente({ renewal_date: "2026-12-20", next_follow_up_on: "2026-11-10", contract_signed: false }),
      "2026-11-12T10:00:00Z",
      HOJE,
    );
    expect(s.nota).toBe(65);
    expect(s.nivel).toBe("atencao");
    expect(s.motivos.map((m) => m.texto)).toContain("Renovação em 34 dias");
  });

  it("o ajuste manual troca o nível, mas mantém a nota calculada", () => {
    const s = saudeDaEmpresa(cliente({ health_override: "em_risco" }), "2026-11-15T10:00:00Z", HOJE);
    expect(s.nivel).toBe("em_risco");
    expect(s.nota).toBe(100);
    expect(s.ajustadoAMao).toBe(true);
  });

  it("ex-cliente é churn", () => {
    expect(saudeDaEmpresa(cliente({ lifecycle: "ex_cliente" }), null, HOJE).nivel).toBe("churn");
  });
});

describe("schemas de entrada", () => {
  it("cria empresa normalizando código W e CNPJ", () => {
    const r = empresaCreateSchema.parse({
      name: "Chiappa Advogados",
      legale_code: "w463",
      cnpj: "12.345.678/0001-90",
      email: "",
      state: "sp",
    });
    expect(r.legale_code).toBe("W463");
    expect(r.cnpj).toBe("12345678000190");
    expect(r.email).toBeNull();
    expect(r.state).toBe("SP");
    expect(r.lifecycle).toBe("prospect");
  });

  it("recusa CNPJ incompleto e código W inválido", () => {
    expect(empresaCreateSchema.safeParse({ name: "X Y", cnpj: "123" }).success).toBe(false);
    expect(empresaCreateSchema.safeParse({ name: "X Y", legale_code: "ABC" }).success).toBe(false);
  });

  it("ajuste de saúde exige motivo", () => {
    expect(empresaPatchSchema.safeParse({ health_override: "em_risco" }).success).toBe(false);
    expect(
      empresaPatchSchema.safeParse({ health_override: "em_risco", health_override_reason: "Reclamou do suporte" })
        .success,
    ).toBe(true);
  });

  it("atividade sem data usa agora", () => {
    const r = atividadeCreateSchema.parse({ team: "cs", channel: "ligacao", summary: "Ligação de rotina" });
    expect(r.performed_at).toMatch(/^\d{4}-/);
  });
});
