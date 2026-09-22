import { beforeEach, describe, expect, it, vi } from "vitest";

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));

describe("recoverOrganization — o CRM Legale tem uma única organização", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ id: "usuario-1" } as never);
    vi.mocked(resolveActiveOrg).mockResolvedValue(null);
  });

  it("uma conta sem vínculo não pode criar outra organização", async () => {
    const { recoverOrganization } = await import("./recoverOrganization");

    await expect(recoverOrganization("Empresa paralela")).resolves.toEqual({
      ok: false,
      error: "somente_convite",
    });
  });

  it("uma conta que já pertence à Legale segue para o CRM", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: "legale" } as never);
    const { recoverOrganization } = await import("./recoverOrganization");

    await expect(recoverOrganization("Qualquer nome")).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(redirect).toHaveBeenCalledWith("/app");
  });
});

describe("as telas sem vínculo conduzem ao pedido de convite", () => {
  it.each([
    ["app/app/layout.tsx", 'if (!activeOrg && !user.support) redirect("/get-started")'],
    ["app/app/inbox/page.tsx", 'if (!activeOrg) redirect("/get-started")'],
  ])("%s redireciona contas sem organização", async (arquivo, esperado) => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(process.cwd(), arquivo), "utf8");
    expect(fonte).toContain(esperado);
  });

  it("a página de primeiro acesso não oferece criação de plataforma", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(process.cwd(), "app/get-started/page.tsx"), "utf8");

    expect(fonte).not.toContain("RecoverOrganizationForm");
    expect(fonte).toContain("Solicite ao");
    expect(fonte).toContain("administrador da equipe");
  });
});
