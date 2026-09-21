import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { COLUNAS_DA_PROPOSTA, type PropostaComercial } from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";

import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposta comercial" };

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const supabase = await createClient();
  const [{ data }, { data: organization }] = await Promise.all([
    supabase
      .from("commercial_proposals")
      .select(COLUNAS_DA_PROPOSTA)
      .eq("organization_id", activeOrg.orgId)
      .eq("id", id)
      .single(),
    supabase
      .from("organizations")
      .select("name, display_name, legal_name, settings")
      .eq("id", activeOrg.orgId)
      .single(),
  ]);
  if (!data) notFound();
  const proposal = data as unknown as PropostaComercial;
  const company =
    organization?.display_name ?? organization?.name ?? organization?.legal_name ?? "Nossa empresa";
  const monthlyItems = proposal.items.filter((item) => item.cobranca === "mensal");
  const oneTimeItems = proposal.items.filter((item) => item.cobranca === "unica");
  const scopeItems = proposal.items.filter(
    (item) =>
      (item.categoria === "modulo" ||
        item.categoria === "servico" ||
        item.categoria === "monitoramento") &&
      !item.codigo.endsWith("_setup"),
  );
  const quantityItems = proposal.items.filter(
    (item) => item.quantidade > 1 && item.categoria !== "ativacao",
  );
  const migrationItems = proposal.items.filter((item) => item.categoria === "migracao");

  return (
    <main className="proposal-shell bg-muted/30 px-4 py-6 sm:px-6">
      <div className="proposal-actions mx-auto mb-5 flex max-w-[900px] items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/app/propostas">Voltar</Link>
        </Button>
        <PrintButton />
      </div>
      <article className="proposal-document mx-auto max-w-[900px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
        <section className="proposal-page relative flex min-h-[1120px] flex-col overflow-hidden bg-[#f7f5fb] p-14 sm:p-20">
          <div className="absolute -top-40 -right-32 h-[520px] w-[520px] rounded-full bg-[#6d28d9]/15 blur-2xl" />
          <div className="absolute -bottom-44 -left-36 h-[480px] w-[480px] rounded-full bg-[#2e1065]/10" />
          <header className="relative flex items-center justify-between">
            <span className="text-xl font-bold tracking-tight text-[#3b0764]">{company}</span>
            <span className="rounded-full border border-[#6d28d9]/25 px-4 py-2 text-xs font-semibold tracking-[.18em] text-[#6d28d9] uppercase">
              Proposta comercial
            </span>
          </header>
          <div className="relative my-auto max-w-2xl">
            <p className="mb-5 text-sm font-semibold tracking-[.22em] text-[#7c3aed] uppercase">
              Tecnologia para a operação jurídica
            </p>
            <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-[#24103d] sm:text-7xl">
              {proposal.client_name}
            </h1>
            <p className="mt-7 max-w-xl text-xl leading-relaxed text-slate-600">
              Processos, publicações, contratos, atividades jurídicas e análise de dados em uma
              plataforma integrada.
            </p>
            {proposal.recipient_name ? (
              <p className="mt-12 text-sm text-slate-500">
                Preparada para <strong className="text-slate-800">{proposal.recipient_name}</strong>
              </p>
            ) : null}
          </div>
          <footer className="relative flex items-end justify-between border-t border-[#6d28d9]/15 pt-6 text-sm text-slate-500">
            <span>Versão {proposal.version}</span>
            <span>
              {new Date(`${proposal.issue_date}T12:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </footer>
        </section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20">
          <p className="text-sm font-semibold tracking-[.2em] text-[#7c3aed] uppercase">
            Sua contratação
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">
            Um escopo claro, item por item.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Cada item abaixo integra a contratação de{" "}
            {proposal.client_kind === "escritorio"
              ? "um escritório de advocacia"
              : `um departamento jurídico como o da ${proposal.client_name}`}
            .
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4">
            {scopeItems.map((item) => (
              <div
                key={item.codigo}
                className="rounded-2xl border border-[#7c3aed]/35 bg-[#f5f3ff] p-5"
              >
                <span className="mb-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#7c3aed] text-sm font-bold text-white">
                  ✓
                </span>
                <h3 className="font-semibold text-[#24103d]">{item.nome}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {item.descricao || "Incluído nesta proposta."}
                </p>
                {item.quantidade > 1 ? (
                  <p className="mt-3 text-xs font-semibold tracking-wide text-[#7c3aed] uppercase">
                    {item.quantidade.toLocaleString("pt-BR")} {item.unidade ?? "unidades"}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20">
          <p className="text-sm font-semibold tracking-[.2em] text-[#7c3aed] uppercase">
            Investimento
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">
            Composição detalhada
          </h2>
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-[#2e1065] text-white">
                <tr>
                  <th className="px-5 py-4 text-left">Item contratado</th>
                  <th className="px-5 py-4 text-right">Quantidade</th>
                  <th className="px-5 py-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {monthlyItems.map((item) => (
                  <tr key={item.codigo}>
                    <td className="px-5 py-4">
                      <strong>{item.nome}</strong>
                      <p className="mt-1 text-xs text-slate-500">{item.descricao}</p>
                    </td>
                    <td className="px-5 py-4 text-right">{item.quantidade}</td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {formatCents(item.total_cents, proposal.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between bg-[#7c3aed] px-5 py-5 text-lg font-semibold text-white">
              <span>Total mensal</span>
              <span>{formatCents(proposal.monthly_total_cents, proposal.currency)}</span>
            </div>
          </div>
          {oneTimeItems.length > 0 ? (
            <div className="mt-8">
              <h3 className="mb-3 font-semibold text-[#24103d]">Ativação e serviços pontuais</h3>
              <div className="divide-y rounded-2xl border">
                {oneTimeItems.map((item) => (
                  <div key={item.codigo} className="flex justify-between p-4 text-sm">
                    <span>{item.nome}</span>
                    <strong>{formatCents(item.total_cents, proposal.currency)}</strong>
                  </div>
                ))}
                <div className="flex justify-between bg-slate-50 p-4 font-semibold">
                  <span>Total de ativação</span>
                  <span>{formatCents(proposal.activation_total_cents, proposal.currency)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20">
          <p className="text-sm font-semibold tracking-[.2em] text-[#7c3aed] uppercase">
            Condições
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">
            Referências da contratação
          </h2>
          {quantityItems.length > 0 ? (
            <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-left">Item</th>
                    <th className="px-5 py-3 text-right">Quantidade</th>
                    <th className="px-5 py-3 text-right">Valor unitário</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quantityItems.map((item) => (
                    <tr key={item.codigo}>
                      <td className="px-5 py-4">
                        <strong>{item.nome}</strong>
                        {item.descricao ? (
                          <p className="mt-1 text-xs text-slate-500">{item.descricao}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {item.quantidade.toLocaleString("pt-BR")} {item.unidade ?? "unidades"}
                      </td>
                      <td className="px-5 py-4 text-right font-medium">
                        {formatCents(item.valor_unitario_cents, proposal.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {migrationItems.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-[#7c3aed]/25 bg-[#f5f3ff] p-5">
              <h3 className="font-semibold text-[#24103d]">Migração de dados</h3>
              {migrationItems.map((item) => (
                <div className="mt-3 flex justify-between gap-4 text-sm" key={item.codigo}>
                  <span>
                    <strong>{item.nome}</strong>
                    {item.descricao ? (
                      <span className="mt-1 block text-slate-500">{item.descricao}</span>
                    ) : null}
                  </span>
                  <strong className="shrink-0">
                    {formatCents(item.total_cents, proposal.currency)}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f5f3ff] p-5">
              <h3 className="font-semibold text-[#24103d]">Prazo e pagamento</h3>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">
                {proposal.payment_terms || "Condições definidas em contrato."}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <h3 className="font-semibold text-[#24103d]">Validade</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Proposta emitida em{" "}
                {new Date(`${proposal.issue_date}T12:00:00`).toLocaleDateString("pt-BR")}, válida
                até {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}.
              </p>
            </div>
          </div>
          {proposal.notes ? (
            <div className="mt-4 rounded-2xl border p-5">
              <h3 className="font-semibold text-[#24103d]">Observações</h3>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-600">
                {proposal.notes}
              </p>
            </div>
          ) : null}
          <footer className="mt-12 border-t pt-6 text-center text-sm text-slate-500">
            {company}
          </footer>
        </section>
      </article>
    </main>
  );
}
