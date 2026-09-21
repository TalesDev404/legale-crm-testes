import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { COLUNAS_DA_PROPOSTA, type PropostaComercial } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propostas" };

const ROTULOS = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  expirada: "Expirada",
} as const;

export default async function PropostasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data } = await supabase
    .from("commercial_proposals")
    .select(COLUNAS_DA_PROPOSTA)
    .eq("organization_id", activeOrg.orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  const propostas = (data ?? []) as unknown as PropostaComercial[];

  return (
    <main className="mx-auto w-full max-w-6xl p-6" data-testid="tela-propostas">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Propostas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte o escopo, confira o investimento e gere o material para o cliente.
          </p>
        </div>
        <div className="flex gap-2">
          {activeOrg.role === "admin" ? (
            <Button asChild variant="outline">
              <Link href="/app/settings/propostas">Configurar catálogo</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/app/propostas/nova">Nova proposta</Link>
          </Button>
        </div>
      </header>

      {propostas.length === 0 ? (
        <section className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">Nenhuma proposta criada</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A primeira proposta pode nascer de um contato existente ou de um possível cliente novo.
          </p>
          <Button asChild className="mt-5">
            <Link href="/app/propostas/nova">Criar primeira proposta</Link>
          </Button>
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 text-right font-medium">Mensal</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {propostas.map((proposta) => (
                <tr key={proposta.id}>
                  <td className="px-4 py-4">
                    <p className="font-medium">{proposta.client_name}</p>
                    <p className="text-xs text-muted-foreground">Versão {proposta.version}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {ROTULOS[proposta.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {new Date(`${proposta.issue_date}T12:00:00`).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-4 text-right font-medium tabular-nums">
                    {formatCents(proposta.monthly_total_cents, proposta.currency)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/propostas/${proposta.id}`}>Abrir</Link>
                    </Button>
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
