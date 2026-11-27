import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { equipeDaOrganizacao } from "@/lib/empresas/equipe";
import { formatCents, formatCentsBRL } from "@/lib/money";
import {
  COLUNAS_DA_ATIVIDADE,
  COLUNAS_DA_EMPRESA,
  ROTULO_DA_SAUDE,
  ROTULO_DO_CANAL,
  ROTULO_DO_CICLO,
  ROTULO_DO_TIME,
  ROTULO_DO_TIPO,
  formatarCnpj,
  saudeDaEmpresa,
  type AtividadeDaEmpresa,
  type Empresa,
  type FinalidadeDoContato,
} from "@/lib/schemas/empresas";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { CORES_DA_SAUDE } from "../_components/cores";
import { AjusteDeSaude, EditarEmpresa, RegistrarContato } from "./AcoesDaFicha";
import { FinalidadesDoContato, MapaDeModulos } from "./PainelDaFicha";

const DIA_MS = 86_400_000;

/** A hora da consulta, fora do corpo do render (regra de pureza do React). */
async function horarioDaConsulta(): Promise<number> {
  return Date.now();
}

/** "2 anos e 3 meses", "5 meses", "12 dias". */
function tempoDesde(iso: string, agora: number): string {
  const de = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const hoje = new Date(agora);
  let meses = (hoje.getFullYear() - de.getFullYear()) * 12 + (hoje.getMonth() - de.getMonth());
  if (hoje.getDate() < de.getDate()) meses -= 1;
  if (meses < 1) {
    const dias = Math.max(0, Math.floor((agora - de.getTime()) / DIA_MS));
    return `${dias} dia${dias === 1 ? "" : "s"}`;
  }
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [
    anos ? `${anos} ano${anos === 1 ? "" : "s"}` : "",
    resto ? `${resto} ${resto === 1 ? "mês" : "meses"}` : "",
  ].filter(Boolean);
  return partes.join(" e ");
}

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe ? <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresa" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Negocio = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  value_cents: number | null;
  proposal_monthly_cents: number | null;
  stage_id: string;
  updated_at: string;
  crm_stages: { name: string } | { name: string }[] | null;
  custom_fields: Record<string, unknown> | null;
};
type Proposta = {
  id: string;
  version: number;
  status: string;
  issue_date: string;
  monthly_total_cents: number;
  currency: string;
};
type Contato = {
  id: string;
  display_name: string | null;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  account_roles: FinalidadeDoContato[] | null;
};
type AtividadeDoNegocio = { id: string; lead_id: string; type: string; performed_at: string };

type ItemDaLinha =
  | { tipo: "empresa"; quando: string; a: AtividadeDaEmpresa }
  | { tipo: "negocio"; quando: string; a: AtividadeDoNegocio };

function data(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR");
}

function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor || "—"}</dd>
    </div>
  );
}

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const org = activeOrg.orgId;
  const { data: linha } = await supabase
    .from("customer_accounts")
    .select(COLUNAS_DA_EMPRESA)
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (!linha) notFound();
  const empresa = linha as unknown as Empresa;

  const [{ data: negociosData }, { data: propostasData }, { data: contatosData }, { data: atividadesData }, equipe] =
    await Promise.all([
      supabase
        .from("crm_leads")
        .select("id,title,status,value_cents,proposal_monthly_cents,stage_id,updated_at,custom_fields,crm_stages(name)")
        .eq("organization_id", org)
        .eq("account_id", id)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("commercial_proposals")
        .select("id,version,status,issue_date,monthly_total_cents,currency")
        .eq("organization_id", org)
        .eq("account_id", id)
        .order("issue_date", { ascending: false })
        .limit(50),
      supabase
        .from("contacts")
        .select("id,display_name,name,email,phone_number,account_roles")
        .eq("organization_id", org)
        .eq("account_id", id)
        .is("is_merged_into", null)
        .limit(50),
      supabase
        .from("customer_account_activities")
        .select(COLUNAS_DA_ATIVIDADE)
        .eq("organization_id", org)
        .eq("account_id", id)
        .order("performed_at", { ascending: false })
        .limit(200),
      equipeDaOrganizacao(org),
    ]);

  const negocios = (negociosData ?? []) as unknown as Negocio[];
  const propostas = (propostasData ?? []) as unknown as Proposta[];
  const contatos = (contatosData ?? []) as unknown as Contato[];
  const atividades = (atividadesData ?? []) as unknown as AtividadeDaEmpresa[];

  let atividadesDosNegocios: AtividadeDoNegocio[] = [];
  if (negocios.length > 0) {
    const { data } = await supabase
      .from("crm_lead_activities")
      .select("id,lead_id,type,performed_at")
      .eq("organization_id", org)
      .in(
        "lead_id",
        negocios.map((n) => n.id),
      )
      .order("performed_at", { ascending: false })
      .limit(100);
    atividadesDosNegocios = (data ?? []) as AtividadeDoNegocio[];
  }

  const nomeDe = new Map(equipe.map((p) => [p.id, p.nome]));
  const tituloDoNegocio = new Map(negocios.map((n) => [n.id, n.title]));
  const saude = saudeDaEmpresa(empresa, atividades[0]?.performed_at ?? null);
  const linhaDoTempo: ItemDaLinha[] = [
    ...atividades.map((a) => ({ tipo: "empresa" as const, quando: a.performed_at, a })),
    ...atividadesDosNegocios.map((a) => ({ tipo: "negocio" as const, quando: a.performed_at, a })),
  ].sort((x, y) => y.quando.localeCompare(x.quando));
  const timePadrao = empresa.lifecycle === "prospect" ? "comercial" : "cs";
  const podeEditar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const agora = await horarioDaConsulta();

  // ---- Cartões do topo: a empresa em cinco números ----
  const ultimaAprovada = propostas.find((p) => p.status === "aprovada");
  const mensalidade = empresa.monthly_revenue_cents ?? ultimaAprovada?.monthly_total_cents ?? null;
  const propostasEmAberto = propostas.filter((p) => p.status === "rascunho" || p.status === "enviada");
  const ultimoContato = atividades[0] ?? null;
  const diasSemContato = ultimoContato
    ? Math.floor((agora - Date.parse(ultimoContato.performed_at)) / DIA_MS)
    : null;

  // ---- Mapa de módulos: o que está em negociação vem dos negócios abertos ----
  const emNegociacao: Record<string, string> = {};
  for (const n of negocios) {
    if (n.status !== "open") continue;
    const interesse = n.custom_fields?.modulos_interesse;
    if (!Array.isArray(interesse)) continue;
    for (const codigo of interesse) {
      if (typeof codigo === "string" && !emNegociacao[codigo]) emNegociacao[codigo] = n.title;
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl" data-testid="tela-empresa">
      <Link href="/app/empresas" className="text-sm text-muted-foreground hover:underline">
        ← Empresas
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {empresa.name}
            {empresa.legale_code ? (
              <span className="ml-2 text-base font-normal text-muted-foreground">{empresa.legale_code}</span>
            ) : null}
          </h1>
          <p className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{ROTULO_DO_CICLO[empresa.lifecycle]}</span>
            {empresa.client_kind ? <span>{ROTULO_DO_TIPO[empresa.client_kind]}</span> : null}
            {empresa.city ? (
              <span>
                {empresa.city}
                {empresa.state ? `/${empresa.state}` : ""}
              </span>
            ) : null}
          </p>
        </div>
        <EditarEmpresa empresa={empresa} equipe={equipe.map((p) => ({ id: p.id, nome: p.nome }))} />
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="resumo-da-empresa">
        <Cartao
          rotulo="Saúde"
          valor={saude.nota ?? "—"}
          detalhe={saude.nivel ? ROTULO_DA_SAUDE[saude.nivel] : "Prospect ainda não tem saúde"}
        />
        <Cartao
          rotulo="Mensalidade"
          valor={mensalidade != null ? formatCentsBRL(mensalidade) : "—"}
          detalhe={
            empresa.monthly_revenue_cents != null
              ? "Informada na ficha"
              : ultimaAprovada
                ? `Pela proposta aprovada de ${data(ultimaAprovada.issue_date)}`
                : "Sem mensalidade nem proposta aprovada"
          }
        />
        <Cartao
          rotulo={empresa.lifecycle === "prospect" ? "Prospect há" : "Cliente há"}
          valor={
            empresa.lifecycle === "prospect"
              ? tempoDesde(empresa.created_at, agora)
              : empresa.customer_since
                ? tempoDesde(empresa.customer_since, agora)
                : "—"
          }
          detalhe={
            empresa.lifecycle === "prospect"
              ? `No CRM desde ${data(empresa.created_at)}`
              : empresa.customer_since
                ? `Desde ${data(empresa.customer_since)}`
                : "Data de início não informada"
          }
        />
        <Cartao
          rotulo="Propostas em aberto"
          valor={propostasEmAberto.length}
          detalhe={
            propostasEmAberto.length
              ? `${formatCentsBRL(propostasEmAberto.reduce((t, p) => t + Number(p.monthly_total_cents || 0), 0))}/mês em rascunho ou enviadas`
              : `${propostas.length} proposta(s) no total`
          }
        />
        <Cartao
          rotulo="Último contato"
          valor={diasSemContato == null ? "Nunca" : diasSemContato === 0 ? "Hoje" : `há ${diasSemContato} dias`}
          detalhe={
            ultimoContato
              ? `${ROTULO_DO_CANAL[ultimoContato.channel]} · ${ROTULO_DO_TIME[ultimoContato.team]}`
              : "Nenhum contato registrado"
          }
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          {saude.nivel ? (
            <section className="rounded-xl border bg-surface p-4" data-testid="saude-da-empresa">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Saúde</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs ${CORES_DA_SAUDE[saude.nivel]}`}>
                  {ROTULO_DA_SAUDE[saude.nivel]}
                </span>
              </div>
              {saude.nota != null ? <p className="mt-2 text-3xl font-semibold tabular-nums">{saude.nota}</p> : null}
              {saude.ajustadoAMao ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajustado à mão: {empresa.health_override_reason}
                </p>
              ) : null}
              {saude.motivos.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {saude.motivos.map((m) => (
                    <li key={m.texto} className="flex justify-between gap-2">
                      <span>{m.texto}</span>
                      <span className="tabular-nums text-muted-foreground">−{m.pontos}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nada pesando contra.</p>
              )}
              <AjusteDeSaude empresa={empresa} />
            </section>
          ) : null}

          <section className="rounded-xl border bg-surface p-4">
            <h2 className="mb-3 font-semibold">Dados</h2>
            <dl className="grid grid-cols-2 gap-3">
              <Dado rotulo="Responsável comercial" valor={nomeDe.get(empresa.commercial_owner_user_id ?? "")} />
              <Dado rotulo="Responsável CS" valor={nomeDe.get(empresa.cs_owner_user_id ?? "")} />
              <Dado rotulo="Origem" valor={empresa.source} />
              <Dado rotulo="CNPJ" valor={formatarCnpj(empresa.cnpj)} />
              <Dado rotulo="Telefone" valor={empresa.phone} />
              <Dado rotulo="E-mail" valor={empresa.email} />
              {empresa.lifecycle !== "prospect" ? (
                <>
                  <Dado rotulo="Cliente desde" valor={data(empresa.customer_since)} />
                  <Dado rotulo="Renovação" valor={data(empresa.renewal_date)} />
                  <Dado
                    rotulo="Mensalidade"
                    valor={empresa.monthly_revenue_cents != null ? formatCentsBRL(empresa.monthly_revenue_cents) : null}
                  />
                  <Dado
                    rotulo="Acompanhamento"
                    valor={empresa.follow_up_every_days ? `a cada ${empresa.follow_up_every_days} dias` : null}
                  />
                  <Dado rotulo="Próximo contato" valor={data(empresa.next_follow_up_on)} />
                  <Dado rotulo="Contrato" valor={empresa.contract_signed ? "Assinado" : "Não assinado"} />
                  <Dado
                    rotulo="Pagamentos"
                    valor={
                      [
                        empresa.pays_legale && "Legale",
                        empresa.pays_bi && "BI",
                        empresa.pays_monitoring && "Monitoramento",
                      ]
                        .filter(Boolean)
                        .join(", ") || "Nenhum confirmado"
                    }
                  />
                </>
              ) : (
                <Dado rotulo="Próximo contato" valor={data(empresa.next_follow_up_on)} />
              )}
            </dl>
            {empresa.notes ? <p className="mt-4 whitespace-pre-line text-sm">{empresa.notes}</p> : null}
          </section>

          <section className="rounded-xl border bg-surface p-4">
            <h2 className="mb-3 font-semibold">Pessoas</h2>
            {contatos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato ligado a esta empresa.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {contatos.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/contacts/${c.id}`} className="font-medium hover:underline">
                      {c.display_name || c.name || c.email || "Sem nome"}
                    </Link>
                    <p className="text-xs text-muted-foreground">{[c.email, c.phone_number].filter(Boolean).join(" · ")}</p>
                    <FinalidadesDoContato
                      empresaId={empresa.id}
                      contatoId={c.id}
                      finalidades={c.account_roles ?? []}
                      podeEditar={podeEditar}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {empresa.lifecycle !== "prospect" ? (
            <MapaDeModulos
              empresaId={empresa.id}
              contratados={empresa.contracted_modules}
              emNegociacao={emNegociacao}
              podeEditar={podeEditar}
            />
          ) : null}
          <RegistrarContato
            empresaId={empresa.id}
            timePadrao={timePadrao}
            negocios={negocios.filter((n) => n.status === "open").map((n) => ({ id: n.id, title: n.title }))}
          />

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border bg-surface p-4">
              <h2 className="mb-3 font-semibold">Negócios</h2>
              {negocios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum negócio no funil ligado a esta empresa.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {negocios.map((n) => {
                    const etapa = Array.isArray(n.crm_stages) ? n.crm_stages[0] : n.crm_stages;
                    const valor = n.proposal_monthly_cents ?? n.value_cents;
                    return (
                      <li key={n.id} className="flex justify-between gap-2">
                        <div>
                          <Link href={`/app/leads/${n.id}`} className="font-medium hover:underline">
                            {n.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {n.status === "won" ? "Ganho" : n.status === "lost" ? "Perdido" : (etapa?.name ?? "Aberto")}
                          </p>
                        </div>
                        <span className="tabular-nums text-muted-foreground">
                          {valor != null ? formatCentsBRL(valor) : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <h2 className="mb-3 font-semibold">Propostas</h2>
              {propostas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma proposta ligada a esta empresa.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {propostas.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <div>
                        <Link href={`/app/propostas/${p.id}`} className="font-medium hover:underline">
                          Versão {p.version} · {data(p.issue_date)}
                        </Link>
                        <p className="text-xs capitalize text-muted-foreground">{p.status}</p>
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCents(p.monthly_total_cents, p.currency)}/mês
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-surface p-4" data-testid="linha-do-tempo">
            <h2 className="mb-3 font-semibold">Linha do tempo</h2>
            {linhaDoTempo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>
            ) : (
              <ol className="space-y-4">
                {linhaDoTempo.map((item) =>
                  item.tipo === "empresa" ? (
                    <li key={`e-${item.a.id}`} className="border-l-2 border-border pl-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.a.performed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{" "}
                        · {ROTULO_DO_TIME[item.a.team]} · {ROTULO_DO_CANAL[item.a.channel]}
                        {item.a.performed_by_user_id ? ` · ${nomeDe.get(item.a.performed_by_user_id) ?? ""}` : ""}
                        {item.a.lead_id ? ` · ${tituloDoNegocio.get(item.a.lead_id) ?? ""}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm">{item.a.summary}</p>
                    </li>
                  ) : (
                    <li key={`n-${item.a.id}`} className="border-l-2 border-dashed border-border pl-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.a.performed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{" "}
                        · Funil · {tituloDoNegocio.get(item.a.lead_id) ?? "Negócio"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.a.type.replace(/_/g, " ")}</p>
                    </li>
                  ),
                )}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
