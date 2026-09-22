import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));

const signUpDoProvedor = vi.fn();

let n = 0;
const entrada = () => ({
  org_name: "Empresa que não foi convidada",
  email: `cadastro-${++n}-${Date.now()}@exemplo.test`,
  password: "SenhaForte!2026",
  password_confirm: "SenhaForte!2026",
});

describe("signUp — o CRM Legale aceita somente convidados", () => {
  beforeEach(() => {
    vi.resetModules();
    signUpDoProvedor.mockReset();
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? `203.0.113.${n % 250}` : null),
    } as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpDoProvedor },
    } as never);
  });

  it("sem convite recusa antes de criar uma conta no provedor", async () => {
    const { signUp } = await import("./signUp");

    await expect(signUp(entrada())).resolves.toEqual({
      ok: false,
      error: "somente_convite",
    });
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("com convite válido cria o acesso solicitado pelo administrador", async () => {
    const { signInviteToken, INVITE_TTL_SECONDS } = await import("@/lib/auth/invite-token");
    const dados = entrada();
    const token = signInviteToken({
      invite_id: "00000000-0000-4000-8000-000000000003",
      email: dados.email,
      organization_id: "00000000-0000-4000-8000-000000000001",
      role: "agent",
      exp: Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS,
    });
    signUpDoProvedor.mockResolvedValue({
      data: { user: { id: "u-3" }, session: null },
      error: null,
    });

    const { signUp } = await import("./signUp");
    const res = await signUp(
      {
        full_name: "Pessoa convidada",
        email: dados.email,
        password: dados.password,
        password_confirm: dados.password_confirm,
      },
      token,
    );

    expect(res).toEqual({ ok: true, sessao_ativa: false });
    expect(signUpDoProvedor).toHaveBeenCalledTimes(1);
  });
});
