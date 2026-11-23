import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { equipeDaOrganizacao } from "@/lib/empresas/equipe";
import { formatCentsBRL } from "@/lib/money";
import {
  CICLOS_DA_EMPRESA,
  COLUNAS_DA_EMPRESA,
  ROTULO_DA_SAUDE,
  ROTULO_DO_CICLO,
  chaveDoNome,
  saudeDaEmpresa,
  type CicloDaEmpresa,
  type Empresa,
  type NivelDeSaude,
} from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

import { CORES_DA_SAUDE } from "./_components/cores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresas" };

type Filtro = CicloDaEmpresa | "todas";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ ciclo?: string; busca?: string; saude?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const params = await searchParams;
  const ciclo: Filtro = (CICLOS_DA_EMPRESA as readonly string[]).includes(params.ciclo ?? "")
    ? (params.ciclo as CicloDaEmpresa)
    : "todas";
  const busca = (params.busca ?? "").trim().slice(0, 80);
  const filtroSaude = (["saudavel", "atencao", "em_risco"] as const).find((n) => n === params.saude) ?? null;

  const supabase = await createClient();
  const [{ data: linhas }, { data: contatos }, equipe] = await Promise.all([
    supabase
      .from("customer_accounts")
      .select(COLUNAS_DA_EMPRESA)
      .eq("organization_id", activeOrg.orgId)
      .order("name", { ascending: true })
      .limit(1000),
    supabase
      .from("customer_account_activities")
      .select("account_id,performed_at")
      .eq("organization_id", activeOrg.orgId)
      .order("performed_at", { ascending: false })
      .limit(5000),
    equipeDaOrganizacao(activeOrg.orgId),
  ]);

  const todas = (linhas ?? []) as unknown as Empresa[];
  const ultimoContato = new Map<string, string>();
  for (const c of (contatos ?? []) as { account_id: string; performed_at: string }[]) {
    if (!ultimoContato.has(c.account_id)) ultimoContato.set(c.account_id, c.performed_at);
  }
  const nomeDe = new Map(equipe.map((p) => [p.id, p.nome]));
  const hoje = hojeIso();

  const comSaude = todas.map((e) => ({
    empresa: e,
    saude: saudeDaEmpresa(e, ultimoContato.get(e.id) ?? null),
    ultimo: ultimoContato.get(e.id) ?? null,
  }));

  const clientes = comSaude.filter((x) => x.empresa.lifecycle === "cliente" || x.empresa.lifecycle === "onboarding");
  const mrr = clientes.reduce((t, x) => t + (x.empresa.monthly_revenue_cents ?? 0), 0);
  const emRisco = clientes.filter((x) => x.saude.nivel === "em_risco" || x.saude.nivel === "churn").length;
  const vencidos = comSaude.filter(
    (x) => x.empresa.lifecycle !== "ex_cliente" && x.empresa.next_follow_up_on && x.empresa.next_follow_up_on < hoje,
  ).length;

  const termo = busca ? chaveDoNome(busca) : "";
  const visiveis = comSaude.filter((x) => {
    if (ciclo !== "todas" && x.empresa.lifecycle !== ciclo) return false;
    if (filtroSaude && x.saude.nivel !== filtroSaude) return false;
    if (!busca) return true;
    const alvo = `${x.empresa.name_key} ${x.empresa.legale_code ?? ""} ${x.empresa.name.toLowerCase()}`.toLowerCase();
    return alvo.includes(termo) || alvo.includes(busca.toLowerCase());
  });

  const link = (mudanca: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base = { ciclo: ciclo === "todas" ? null : ciclo, busca: busca || null, saude: filtroSaude, ...mudanca };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/app/empresas?${s}` : "/app/empresas";
  };

  return (
    <main className="mx-auto w-full max-w-6xl" data-testid="tela-empresas">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospects e clientes num lugar só: o comercial e o Sucesso do Cliente leem a mesma ficha.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/empresas/nova">Nova empresa</Link>
        </Button>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { rotulo: "Clientes ativos", valor: String(clientes.length) },
          { rotulo: "Mensalidade da base", valor: formatCentsBRL(mrr) },
          { rotulo: "Em risco ou churn", valor: String(emRisco), href: link({ saude: "em_risco", ciclo: null }) },
          { rotulo: "Próximo contato vencido", valor: String(vencidos) },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-xl border bg-surface p-4">
            <p className="text-xs text-muted-foreground">{k.rotulo}</p>
            {k.href ? (
              <Link href={k.href} className="mt-1 block text-2xl font-semibold tabular-nums hover:underline">
                {k.valor}
              </Link>
            ) : (
              <p className="mt-1 text-2xl font-semibold tabular-nums">{k.valor}</p>
            )}
          </div>
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Filtrar por situação">
          {(["todas", ...CICLOS_DA_EMPRESA] as Filtro[]).map((c) => (
            <Link
              key={c}
              href={link({ ciclo: c === "todas" ? null : c })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                ciclo === c ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "todas" ? "Todas" : ROTULO_DO_CICLO[c]}
            </Link>
          ))}
          {filtroSaude ? (
            <Link href={link({ saude: null })} className="rounded-full bg-muted px-3 py-1.5 text-sm">
              Saúde: {ROTULO_DA_SAUDE[filtroSaude]} ✕
            </Link>
          ) : null}
        </nav>
        <form className="flex gap-2" action="/app/empresas">
          {ciclo !== "todas" ? <input type="hidden" name="ciclo" value={ciclo} /> : null}
          <input
            name="busca"
            defaultValue={busca}
            placeholder="Buscar por nome ou código W"
            className="h-9 w-64 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            Buscar
          </Button>
        </form>
      </div>

      {visiveis.length === 0 ? (
        <section className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">{todas.length === 0 ? "Nenhuma empresa cadastrada" : "Nada com esses filtros"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {todas.length === 0
              ? "Cadastre o primeiro prospect ou cliente. A importação da planilha de CRM e CS vem na próxima etapa."
              : "Tente outra busca ou limpe os filtros."}
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Responsáveis</th>
                <th className="px-4 py-3 font-medium">Saúde</th>
                <th className="px-4 py-3 font-medium">Último contato</th>
                <th className="px-4 py-3 font-medium">Próximo</th>
                <th className="px-4 py-3 text-right font-medium">Mensal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiveis.map(({ empresa: e, saude, ultimo }) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/app/empresas/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    {e.legale_code ? <span className="ml-2 text-xs text-muted-foreground">{e.legale_code}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{ROTULO_DO_CICLO[e.lifecycle]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.commercial_owner_user_id ? <p>Com.: {nomeDe.get(e.commercial_owner_user_id) ?? "—"}</p> : null}
                    {e.cs_owner_user_id ? <p>CS: {nomeDe.get(e.cs_owner_user_id) ?? "—"}</p> : null}
                    {!e.commercial_owner_user_id && !e.cs_owner_user_id ? "—" : null}
                  </td>
                  <td className="px-4 py-3">
                    {saude.nivel ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${CORES_DA_SAUDE[saude.nivel as NivelDeSaude]}`}
                        title={saude.motivos.map((m) => m.texto).join(" · ")}
                      >
                        {ROTULO_DA_SAUDE[saude.nivel]} {saude.nota != null ? `· ${saude.nota}` : ""}
                        {saude.ajustadoAMao ? " ✎" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ultimo ? new Date(ultimo).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      e.next_follow_up_on && e.next_follow_up_on < hoje ? "font-medium text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {e.next_follow_up_on ? new Date(`${e.next_follow_up_on}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.monthly_revenue_cents != null ? formatCentsBRL(e.monthly_revenue_cents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
