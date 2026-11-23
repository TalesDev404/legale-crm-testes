import { describe, expect, it } from "vitest";

import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { homeDaInterface } from "@/lib/navigation/interface";
import { FORA_DO_LEGALE } from "@/lib/navigation/legale";
import { hubSections, searchable, sidebarGroups } from "@/lib/navigation/registry";

/**
 * O recorte do Legale sobre o menu do produto base: o que o time vê ao entrar.
 * Os testes de mecânica do menu (sidebar, hubs, ⌘K) desligam este recorte e
 * cobrem o catálogo inteiro; este arquivo prova o menu REAL do Legale.
 */
describe("menu do CRM do Legale", () => {
  const hrefsDoSidebar = (role: "viewer" | "agent" | "manager" | "admin", platform = false) =>
    sidebarGroups(platform, role).flatMap((g) => g.items.map((d) => d.href as string));

  it("toda tela tirada do Legale existe no catálogo (nada de nome solto)", () => {
    const catalogo = new Set(NAV_CATALOG.map((d) => d.href as string));
    for (const href of FORA_DO_LEGALE) expect(catalogo.has(href)).toBe(true);
  });

  it("WhatsApp, agente de IA, loja e anúncios não aparecem em nenhuma porta", () => {
    for (const [role, platform] of [
      ["admin", true],
      ["admin", false],
      ["agent", false],
    ] as const) {
      const sidebar = hrefsDoSidebar(role, platform);
      const busca = searchable(platform, role).map((d) => d.href as string);
      const hubs = (["crm", "ia", "canais", "analise", "organizacao"] as const).flatMap((g) =>
        hubSections(g, platform, role).flatMap((s) => s.items.map((d) => d.href as string)),
      );
      for (const fora of FORA_DO_LEGALE) {
        expect(sidebar).not.toContain(fora);
        expect(busca).not.toContain(fora);
        expect(hubs).not.toContain(fora);
      }
    }
  });

  it("o dia a dia do Legale está no menu: início, empresas, funil, propostas e tarefas", () => {
    const sidebar = hrefsDoSidebar("agent");
    for (const href of ["/app/inicio", "/app/empresas", "/app/kanban", "/app/propostas", "/app/tasks"]) {
      expect(sidebar).toContain(href);
    }
  });

  it("o grupo Agente de IA some inteiro do menu", () => {
    const grupos = sidebarGroups(true, "admin").map((g) => g.group.id);
    expect(grupos).not.toContain("ia");
  });

  it("quem entra cai no Início, nunca no Inbox ou numa tela de configuração", () => {
    for (const role of ["viewer", "agent", "manager", "admin"] as const) {
      expect(homeDaInterface(null, false, role)).toBe("/app/inicio");
    }
    expect(homeDaInterface(null, true, "admin")).toBe("/app/inicio");
  });
});
