import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { formatCentsBRL } from "@/lib/money";
import {
  COLUNAS_DA_EMPRESA,
  ROTULO_DA_SAUDE,
  saudeDaEmpresa,
  type Empresa,
} from "@/lib/schemas/empresas";
import { createClient } from "@/lib/supabase/server";

import { CORES_DA_SAUDE } from "../empresas/_components/cores";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Início" };

/** Data de hoje no fuso do Brasil, em `AAAA-MM-DD` (a régua de `next_follow_up_on`). */
function hojeNoBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(
      new Date(),
    ),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

type Tarefa = { id: string; title: string; due_date: string | null; priority: string; status: string };
type Negocio = { id: string; title: string; value_cents: number | null; stage_id: string };
type Etapa = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };

/**
 * A porta de entrada do CRM do Legale: o que pede ação hoje, para quem entra.
 * Tudo aqui é leitura pela sessão do usuário (RLS), filtrada pela organização
 * ativa; cada bloco leva à tela onde a ação acontece.
 */
export default async function InicioPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/get-started");

  const supabase = await createClient();
  const orgId = activeOrg.orgId;
  const hoje = hojeNoBrasil();

  const { data: funil } = await supabase
    .from("crm_pipelines")
    .select("id,name")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();

  const [{ data: linhas }, { data: contatos }, { data: tarefas }, { data: etapas }, { data: negocios }] =
    await Promise.all([
      supabase.from("customer_accounts").select(COLUNAS_DA_EMPRESA).eq("organization_id", orgId).limit(2000),
      supabase
        .from("customer_account_activities")
        .select("account_id,performed_at")
        .eq("organization_id", orgId)
        .order("performed_at", { ascending: false })
        .limit(5000),
      supabase
        .from("crm_tasks")
        .select("id,title,due_date,priority,status")
        .eq("organization_id", orgId)
        .eq("assigned_to", user.id)
        .in("status", ["pending", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50),
      funil
        ? supabase
            .from("crm_stages")
            .select("id,name,position,is_won,is_lost")
            .eq("organization_id", orgId)
            .eq("pipeline_id", funil.id)
            .eq("is_archived", false)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] as Etapa[] }),
      funil
        ? supabase
            .from("crm_leads")
            .select("id,title,value_cents,stage_id")
            .eq("organization_id", orgId)
            .eq("pipeline_id", funil.id)
            .eq("status", "open")
            .limit(2000)
        : Promise.resolve({ data: [] as Negocio[] }),
    ]);

  const empresas = (linhas ?? []) as unknown as Empresa[];
  const ultimoContato = new Map<string, string>();
  for (const c of (contatos ?? []) as { account_id: string; performed_at: string }[]) {
    if (!ultimoContato.has(c.account_id)) ultimoContato.set(c.account_id, c.performed_at);
  }

  const ativas = empresas.filter((e) => e.lifecycle !== "ex_cliente");
  const contatosParaFazer = ativas
    .filter((e) => e.next_follow_up_on && e.next_follow_up_on <= hoje)
    .sort((a, b) => (a.next_follow_up_on ?? "").localeCompare(b.next_follow_up_on ?? ""));
  const meusContatos = contatosParaFazer.filter(
    (e) => e.cs_owner_user_id === user.id || e.commercial_owner_user_id === user.id,
  );

  const emRisco = empresas
    .filter((e) => e.lifecycle === "cliente" || e.lifecycle === "onboarding")
    .map((e) => {
      const saude = saudeDaEmpresa(e, ultimoContato.get(e.id) ?? null);
      return { empresa: e, nivel: saude.nivel, nota: saude.nota ?? 0 };
    })
    .filter(
      (x): x is { empresa: Empresa; nivel: "em_risco" | "churn"; nota: number } =>
        x.nivel === "em_risco" || x.nivel === "churn",
    )
    .sort((a, b) => a.nota - b.nota);

  const minhasTarefas = (tarefas ?? []) as Tarefa[];
  const tarefasDoDia = minhasTarefas.filter((t) => t.due_date && t.due_date.slice(0, 10) <= hoje);

  const etapasDoFunil = ((etapas ?? []) as Etapa[]).filter((e) => !e.is_won && !e.is_lost);
  const abertos = (negocios ?? []) as Negocio[];
  const porEtapa = new Map<string, { qtd: number; valor: number }>();
  for (const n of abertos) {
    const atual = porEtapa.get(n.stage_id) ?? { qtd: 0, valor: 0 };
    porEtapa.set(n.stage_id, { qtd: atual.qtd + 1, valor: atual.valor + (n.value_cents ?? 0) });
  }
  const valorAberto = abertos.reduce((t, n) => t + (n.value_cents ?? 0), 0);
  const maiorEtapa = Math.max(1, ...etapasDoFunil.map((e) => porEtapa.get(e.id)?.qtd ?? 0));

  const primeiroNome = (user.full_name ?? "").trim().split(/\s+/)[0] || null;
  const dataDeHoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const indicadores = [
    {
      rotulo: "Contatos para fazer",
      valor: String(contatosParaFazer.length),
      detalhe: meusContatos.length ? `${meusContatos.length} seus` : "Próximo contato vencido",
      href: "#contatos",
    },
    {
      rotulo: "Clientes em risco",
      valor: String(emRisco.length),
      detalhe: "Saúde em risco ou churn",
      href: "/app/empresas?saude=em_risco",
    },
    {
      rotulo: "Suas tarefas para hoje",
      valor: String(tarefasDoDia.length),
      detalhe: `${minhasTarefas.length} abertas no total`,
      href: "/app/tasks",
    },
    {
      rotulo: "Negócios abertos",
      valor: String(abertos.length),
      detalhe: formatCentsBRL(valorAberto),
      href: "/app/kanban",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl" data-testid="tela-inicio">
      <header className="mb-6 overflow-hidden rounded-2xl bg-legale-noite p-6 text-white sm:p-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-legale-lilas uppercase">{dataDeHoje}</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}!
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          O que pede atenção hoje no comercial e no Sucesso do Cliente do Legale.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/app/empresas/nova"
            className="rounded-lg bg-legale-roxo px-4 py-2 text-sm font-medium text-white hover:bg-legale-roxo-escuro"
          >
            Nova empresa
          </Link>
          <Link
            href="/app/kanban"
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            Abrir o funil
          </Link>
          <Link
            href="/app/propostas"
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            Propostas
          </Link>
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores do dia">
        {indicadores.map((k) => (
          <Link key={k.rotulo} href={k.href} className="rounded-xl border bg-surface p-4 transition hover:border-primary">
            <p className="text-xs text-muted-foreground">{k.rotulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.detalhe}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section id="contatos" className="rounded-xl border bg-surface p-5">
          <h2 className="font-semibold">Contatos para fazer</h2>
          <p className="mb-3 text-xs text-muted-foreground">Empresas com o próximo contato até hoje.</p>
          {contatosParaFazer.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contato vencido. 🎉</p>
          ) : (
            <ul className="divide-y">
              {contatosParaFazer.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <Link href={`/app/empresas/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="truncate text-sm font-medium">
                      {e.name}
                      {e.legale_code ? <span className="ml-1.5 text-xs text-muted-foreground">{e.legale_code}</span> : null}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        (e.next_follow_up_on ?? "") < hoje ? "text-error-fg" : "text-muted-foreground"
                      }`}
                    >
                      {e.next_follow_up_on === hoje ? "Hoje" : dataCurta(e.next_follow_up_on ?? hoje)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="font-semibold">Clientes em risco</h2>
          <p className="mb-3 text-xs text-muted-foreground">Menor nota de saúde primeiro.</p>
          {emRisco.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente em risco.</p>
          ) : (
            <ul className="divide-y">
              {emRisco.slice(0, 8).map(({ empresa, nivel, nota }) => (
                <li key={empresa.id}>
                  <Link href={`/app/empresas/${empresa.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="truncate text-sm font-medium">{empresa.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${CORES_DA_SAUDE[nivel]}`}>
                      {ROTULO_DA_SAUDE[nivel]} · {nota}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="font-semibold">Suas tarefas</h2>
          <p className="mb-3 text-xs text-muted-foreground">Abertas e atribuídas a você, pelo prazo.</p>
          {minhasTarefas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa aberta.</p>
          ) : (
            <ul className="divide-y">
              {minhasTarefas.slice(0, 8).map((t) => {
                const prazo = t.due_date?.slice(0, 10) ?? null;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="truncate text-sm">{t.title}</span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        prazo && prazo < hoje ? "text-error-fg" : "text-muted-foreground"
                      }`}
                    >
                      {prazo ? (prazo === hoje ? "Hoje" : dataCurta(prazo)) : "Sem prazo"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/app/tasks" className="mt-3 inline-block text-sm text-primary hover:underline">
            Ver todas as tarefas
          </Link>
        </section>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="font-semibold">{funil?.name ?? "Funil comercial"}</h2>
          <p className="mb-3 text-xs text-muted-foreground">Negócios abertos por etapa.</p>
          {etapasDoFunil.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Funil ainda não configurado.</p>
          ) : (
            <ul className="space-y-2">
              {etapasDoFunil.map((etapa) => {
                const dados = porEtapa.get(etapa.id) ?? { qtd: 0, valor: 0 };
                return (
                  <li key={etapa.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{etapa.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {dados.qtd} · {formatCentsBRL(dados.valor)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-legale-roxo"
                        style={{ width: `${Math.round((dados.qtd / maiorEtapa) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
