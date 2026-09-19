import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { COLUNAS_DA_PROPOSTA, FAIXAS_MONITORAMENTO, FAIXAS_USUARIOS_LIMITADOS, type PropostaComercial } from "@/lib/schemas/propostas";
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
    supabase.from("commercial_proposals").select(COLUNAS_DA_PROPOSTA).eq("organization_id", activeOrg.orgId).eq("id", id).single(),
    supabase.from("organizations").select("name, display_name, legal_name, settings").eq("id", activeOrg.orgId).single(),
  ]);
  if (!data) notFound();
  const proposal = data as unknown as PropostaComercial;
  const company = organization?.display_name ?? organization?.name ?? organization?.legal_name ?? "Nossa empresa";
  const monthlyItems = proposal.items.filter((item) => item.cobranca === "mensal");
  const oneTimeItems = proposal.items.filter((item) => item.cobranca === "unica");
  const moduleCodes = new Set(proposal.items.filter((item) => item.categoria === "modulo").map((item) => item.codigo));
  const allModules = [
    ["gestao_processos", "Gestão de processos"], ["publicacoes", "Publicações"], ["contratos", "Contratos"],
    ["atividades_juridicas", "Atividades jurídicas"], ["assinatura_digital", "Assinatura digital"], ["legal_analytics", "Legal Analytics"],
  ] as const;

  return (
    <main className="proposal-shell bg-muted/30 px-4 py-6 sm:px-6">
      <div className="proposal-actions mx-auto mb-5 flex max-w-[900px] items-center justify-between gap-3"><Button asChild variant="outline"><Link href="/app/propostas">Voltar</Link></Button><PrintButton /></div>
      <article className="proposal-document mx-auto max-w-[900px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
        <section className="proposal-page relative flex min-h-[1120px] flex-col overflow-hidden bg-[#f7f5fb] p-14 sm:p-20">
          <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-[#6d28d9]/15 blur-2xl" /><div className="absolute -bottom-44 -left-36 h-[480px] w-[480px] rounded-full bg-[#2e1065]/10" />
          <header className="relative flex items-center justify-between"><span className="text-xl font-bold tracking-tight text-[#3b0764]">{company}</span><span className="rounded-full border border-[#6d28d9]/25 px-4 py-2 text-xs font-semibold uppercase tracking-[.18em] text-[#6d28d9]">Proposta comercial</span></header>
          <div className="relative my-auto max-w-2xl"><p className="mb-5 text-sm font-semibold uppercase tracking-[.22em] text-[#7c3aed]">Tecnologia para a operação jurídica</p><h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-[#24103d] sm:text-7xl">{proposal.client_name}</h1><p className="mt-7 max-w-xl text-xl leading-relaxed text-slate-600">Processos, publicações, contratos, atividades jurídicas e análise de dados em uma plataforma integrada.</p>{proposal.recipient_name ? <p className="mt-12 text-sm text-slate-500">Preparada para <strong className="text-slate-800">{proposal.recipient_name}</strong></p> : null}</div>
          <footer className="relative flex items-end justify-between border-t border-[#6d28d9]/15 pt-6 text-sm text-slate-500"><span>Versão {proposal.version}</span><span>{new Date(`${proposal.issue_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span></footer>
        </section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20"><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#7c3aed]">Sua contratação</p><h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">Um escopo claro, item por item.</h2><p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">Cada módulo resolve uma parte da rotina de {proposal.client_kind === "escritorio" ? "um escritório de advocacia" : `um departamento jurídico como o da ${proposal.client_name}`}.</p><div className="mt-12 grid grid-cols-2 gap-4">{allModules.map(([code, name]) => { const included = moduleCodes.has(code); return <div key={code} className={`rounded-2xl border p-5 ${included ? "border-[#7c3aed]/35 bg-[#f5f3ff]" : "border-slate-200 bg-slate-50 opacity-65"}`}><span className={`mb-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${included ? "bg-[#7c3aed] text-white" : "bg-slate-200 text-slate-500"}`}>{included ? "✓" : "–"}</span><h3 className="font-semibold text-[#24103d]">{name}</h3><p className="mt-1 text-sm text-slate-500">{included ? "Incluído nesta proposta" : "Disponível para contratação futura"}</p></div>; })}</div></section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20"><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#7c3aed]">Investimento</p><h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">Composição detalhada</h2><div className="mt-10 overflow-hidden rounded-2xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-[#2e1065] text-white"><tr><th className="px-5 py-4 text-left">Item contratado</th><th className="px-5 py-4 text-right">Quantidade</th><th className="px-5 py-4 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-200">{monthlyItems.map((item) => <tr key={item.codigo}><td className="px-5 py-4"><strong>{item.nome}</strong><p className="mt-1 text-xs text-slate-500">{item.descricao}</p></td><td className="px-5 py-4 text-right">{item.quantidade}</td><td className="px-5 py-4 text-right font-semibold">{formatCents(item.total_cents, proposal.currency)}</td></tr>)}</tbody></table><div className="flex items-center justify-between bg-[#7c3aed] px-5 py-5 text-lg font-semibold text-white"><span>Total mensal</span><span>{formatCents(proposal.monthly_total_cents, proposal.currency)}</span></div></div>{oneTimeItems.length > 0 ? <div className="mt-8"><h3 className="mb-3 font-semibold text-[#24103d]">Ativação e serviços pontuais</h3><div className="divide-y rounded-2xl border">{oneTimeItems.map((item) => <div key={item.codigo} className="flex justify-between p-4 text-sm"><span>{item.nome}</span><strong>{formatCents(item.total_cents, proposal.currency)}</strong></div>)}<div className="flex justify-between bg-slate-50 p-4 font-semibold"><span>Total de ativação</span><span>{formatCents(proposal.activation_total_cents, proposal.currency)}</span></div></div></div> : null}</section>

        <section className="proposal-page min-h-[1120px] p-14 sm:p-20"><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#7c3aed]">Condições</p><h2 className="mt-4 text-4xl font-semibold tracking-tight text-[#24103d]">Referências da contratação</h2><div className="mt-10 grid gap-6"><div className="rounded-2xl border p-5"><h3 className="font-semibold text-[#24103d]">Usuários limitados</h3><table className="mt-4 w-full text-sm"><tbody className="divide-y">{FAIXAS_USUARIOS_LIMITADOS.map((tier) => <tr key={String(tier.ate)}><td className="py-2">{Number.isFinite(tier.ate) ? `Até ${tier.ate}` : "Acima de 100"}</td><td className="py-2 text-right font-medium">{formatCents(tier.valor_cents, "BRL")} por usuário</td></tr>)}</tbody></table></div><div className="rounded-2xl border p-5"><h3 className="font-semibold text-[#24103d]">Monitoramento de processos</h3><table className="mt-4 w-full text-sm"><tbody className="divide-y">{FAIXAS_MONITORAMENTO.map((tier, index) => <tr key={tier.minimo}><td className="py-2">{index === 0 ? "Contratação mínima de 100" : tier.minimo === 20_001 ? "Acima de 20.000" : `A partir de ${tier.minimo.toLocaleString("pt-BR")}`}</td><td className="py-2 text-right font-medium">{formatCents(tier.valor_cents, "BRL")} por processo</td></tr>)}</tbody></table></div></div><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-[#f5f3ff] p-5"><h3 className="font-semibold text-[#24103d]">Prazo e pagamento</h3><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{proposal.payment_terms || "Condições definidas em contrato."}</p></div><div className="rounded-2xl bg-slate-50 p-5"><h3 className="font-semibold text-[#24103d]">Validade</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">Proposta emitida em {new Date(`${proposal.issue_date}T12:00:00`).toLocaleDateString("pt-BR")}, válida até {new Date(`${proposal.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}.</p></div></div>{proposal.notes ? <div className="mt-4 rounded-2xl border p-5"><h3 className="font-semibold text-[#24103d]">Observações</h3><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{proposal.notes}</p></div> : null}<footer className="mt-12 border-t pt-6 text-center text-sm text-slate-500">{company}</footer></section>
      </article>
    </main>
  );
}
