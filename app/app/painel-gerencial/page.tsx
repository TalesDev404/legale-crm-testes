import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/audit";
import { formatCents } from "@/lib/money";
import { carregarPaginas } from "@/lib/gerencial/carregar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel gerencial | Legale" };

type Pipeline = { id: string; name: string };
type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  is_archived: boolean;
};
type Lead = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  status: string;
  created_at: string;
  owner_user_id: string | null;
};
type Proposal = {
  id: string;
  lead_id: string | null;
  client_name: string;
  client_kind: string;
  status: string;
  issue_date: string;
  monthly_total_cents: number;
  activation_total_cents: number;
  version: number;
  created_by: string | null;
};
type Activity = {
  id: string;
  lead_id: string;
  type: string;
  performed_at: string;
  performed_by_user_id: string | null;
};
type Task = {
  id: string;
  lead_id: string | null;
  proposal_id: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  assigned_to: string | null;
};
type Member = { user_id: string; revoked_at: string | null };
type Params = {
  de?: string;
  ate?: string;
  funil?: string;
  situacao?: string;
  tipo?: string;
  responsavel?: string;
};

const LABEL_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  expirada: "Expirada",
};
function brl(cents: number): string {
  return formatCents(cents, "BRL");
}

function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function dataValida(valor: string | undefined): valor is string {
  return (
    !!valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T12:00:00Z`))
  );
}

function dataBr(data: string): string {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

async function horarioDaConsulta(): Promise<number> {
  return Date.now();
}

function card(titulo: string, valor: string, detalhe: string, destaque = false) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${destaque ? "border-violet-300 bg-violet-50/70" : "border-slate-200 bg-white"}`}
    >
      <p className="text-xs font-semibold tracking-[.13em] text-slate-500 uppercase">{titulo}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

export default async function PainelGerencial({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app");

  const params = await searchParams;
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const trintaDiasAtras = new Date(`${hoje}T12:00:00Z`);
  trintaDiasAtras.setUTCDate(trintaDiasAtras.getUTCDate() - 29);
  const inicioPadrao = trintaDiasAtras.toISOString().slice(0, 10);
  const de = dataValida(params.de) ? params.de : inicioPadrao;
  const ate = dataValida(params.ate) ? params.ate : hoje;
  const periodoValido =
    de <= ate && Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`) <= 366 * 86400000;
  const inicio = periodoValido ? de : inicioPadrao;
  const fim = periodoValido ? ate : hoje;
  const inicioUtc = `${inicio}T00:00:00-03:00`;
  const fimExclusivo = new Date(Date.parse(`${fim}T00:00:00-03:00`) + 86400000).toISOString();
  const supabase = await createClient();

  const [
    pipelinesData,
    stagesData,
    leadsData,
    proposalsData,
    activitiesData,
    tasksData,
    membersData,
  ] = await Promise.all([
    carregarPaginas<Pipeline>(async (a, b) => {
      const { data, error } = await supabase
        .from("crm_pipelines")
        .select("id,name")
        .eq("organization_id", org.orgId)
        .order("name")
        .range(a, b);
      return { data, error };
    }),
    carregarPaginas<Stage>(async (a, b) => {
      const { data, error } = await supabase
        .from("crm_stages")
        .select("id,pipeline_id,name,position,is_archived")
        .eq("organization_id", org.orgId)
        .order("position")
        .range(a, b);
      return { data, error };
    }),
    carregarPaginas<Lead>(async (a, b) => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("id,pipeline_id,stage_id,status,created_at,owner_user_id")
        .eq("organization_id", org.orgId)
        .order("id")
        .range(a, b);
      return { data, error };
    }),
    carregarPaginas<Proposal>(async (a, b) => {
      const { data, error } = await supabase
        .from("commercial_proposals")
        .select(
          "id,lead_id,client_name,client_kind,status,issue_date,monthly_total_cents,activation_total_cents,version,created_by",
        )
        .eq("organization_id", org.orgId)
        .gte("issue_date", inicio)
        .lte("issue_date", fim)
        .order("issue_date", { ascending: false })
        .order("id")
        .range(a, b);
      return { data: data as Proposal[] | null, error };
    }),
    carregarPaginas<Activity>(async (a, b) => {
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select("id,lead_id,type,performed_at,performed_by_user_id")
        .eq("organization_id", org.orgId)
        .gte("performed_at", inicioUtc)
        .lt("performed_at", fimExclusivo)
        .order("performed_at", { ascending: false })
        .order("id")
        .range(a, b);
      return { data, error };
    }),
    carregarPaginas<Task>(async (a, b) => {
      const { data, error } = await supabase
        .from("crm_tasks")
        .select("id,lead_id,proposal_id,status,due_date,created_at,assigned_to")
        .eq("organization_id", org.orgId)
        .order("id")
        .range(a, b);
      return { data: data as Task[] | null, error };
    }),
    carregarPaginas<Member>(async (a, b) => {
      const { data, error } = await supabase
        .from("user_organizations")
        .select("user_id,revoked_at")
        .eq("organization_id", org.orgId)
        .order("user_id")
        .range(a, b);
      return { data, error };
    }),
  ]);

  const pipelines = pipelinesData.rows;
  const stages = stagesData.rows;
  const leadById = new Map(leadsData.rows.map((item) => [item.id, item]));
  const stageById = new Map(stages.map((item) => [item.id, item]));
  const pipelineFilter = pipelines.some((item) => item.id === params.funil) ? params.funil : "";
  const members = membersData.rows.filter((item) => !item.revoked_at);
  const ownerFilter = members.some((item) => item.user_id === params.responsavel)
    ? params.responsavel
    : "";
  const admin = isServiceRoleConfigured() ? createAdminClient() : null;
  const memberNames = await Promise.all(
    members.map(async (member) => {
      if (!admin) return { id: member.user_id, name: member.user_id.slice(0, 8) };
      const { data } = await admin.auth.admin.getUserById(member.user_id);
      return {
        id: member.user_id,
        name:
          (data.user?.user_metadata?.full_name as string | undefined) ||
          data.user?.email ||
          member.user_id.slice(0, 8),
      };
    }),
  );
  const statusFilter = params.situacao && params.situacao in LABEL_STATUS ? params.situacao : "";
  const kindFilter = ["escritorio", "departamento_juridico"].includes(params.tipo ?? "")
    ? params.tipo
    : "";
  const filteredLeads = leadsData.rows.filter(
    (item) =>
      (!pipelineFilter || item.pipeline_id === pipelineFilter) &&
      (!ownerFilter || item.owner_user_id === ownerFilter),
  );
  const propostas = proposalsData.rows.filter((item) => {
    const lead = item.lead_id ? leadById.get(item.lead_id) : null;
    return (
      (!pipelineFilter || lead?.pipeline_id === pipelineFilter) &&
      (!ownerFilter || (lead ? lead.owner_user_id : item.created_by) === ownerFilter) &&
      (!statusFilter || item.status === statusFilter) &&
      (!kindFilter || item.client_kind === kindFilter)
    );
  });
  const filteredLeadIds = new Set(filteredLeads.map((item) => item.id));
  const atividades = activitiesData.rows.filter(
    (item) =>
      (!pipelineFilter || filteredLeadIds.has(item.lead_id)) &&
      (!ownerFilter || item.performed_by_user_id === ownerFilter),
  );
  const tarefas = tasksData.rows.filter(
    (item) =>
      (!pipelineFilter || (!!item.lead_id && filteredLeadIds.has(item.lead_id))) &&
      (!ownerFilter || item.assigned_to === ownerFilter),
  );
  const totalMensal = propostas.reduce(
    (total, item) => total + Number(item.monthly_total_cents || 0),
    0,
  );
  const totalUnico = propostas.reduce(
    (total, item) => total + Number(item.activation_total_cents || 0),
    0,
  );
  const aprovadas = propostas.filter((item) => item.status === "aprovada");
  const mensalAprovado = aprovadas.reduce(
    (total, item) => total + Number(item.monthly_total_cents || 0),
    0,
  );
  const novosNegocios = filteredLeads.filter(
    (item) => item.created_at >= inicioUtc && item.created_at < fimExclusivo,
  ).length;
  const tarefasAbertas = tarefas.filter(
    (item) => item.status === "pending" || item.status === "in_progress",
  );
  const agora = await horarioDaConsulta();
  const tarefasAtrasadas = tarefasAbertas.filter(
    (item) => item.due_date && new Date(item.due_date).getTime() < agora,
  );
  const tarefasConcluidas = tarefas.filter(
    (item) =>
      item.status === "done" && item.created_at >= inicioUtc && item.created_at < fimExclusivo,
  );
  const porStatus = Object.keys(LABEL_STATUS).map((status) => ({
    status,
    count: propostas.filter((item) => item.status === status).length,
  }));
  const stagesFiltradas = stages.filter(
    (item) => !item.is_archived && (!pipelineFilter || item.pipeline_id === pipelineFilter),
  );
  const porEtapa = stagesFiltradas
    .map((stage) => {
      const oportunidades = filteredLeads.filter(
        (item) => item.stage_id === stage.id && item.status === "open",
      );
      const propostasNaEtapa = propostas.filter(
        (item) => item.lead_id && leadById.get(item.lead_id)?.stage_id === stage.id,
      );
      return {
        stage,
        oportunidades: oportunidades.length,
        propostas: propostasNaEtapa.length,
        mensal: propostasNaEtapa.reduce(
          (sum, item) => sum + Number(item.monthly_total_cents || 0),
          0,
        ),
        unico: propostasNaEtapa.reduce(
          (sum, item) => sum + Number(item.activation_total_cents || 0),
          0,
        ),
      };
    })
    .filter((item) => item.oportunidades || item.propostas);
  const semCard = propostas.filter((item) => !item.lead_id || !leadById.has(item.lead_id));
  const atividadesHumanas = atividades.filter((item) => !!item.performed_by_user_id).length;
  const topAtividades = [...new Map(atividades.map((item) => [item.type, 0]))]
    .map(([tipo]) => ({ tipo, count: atividades.filter((item) => item.type === tipo).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const truncated = [
    pipelinesData,
    stagesData,
    leadsData,
    proposalsData,
    activitiesData,
    tasksData,
    membersData,
  ].some((item) => item.truncated);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 pb-12" data-testid="painel-gerencial">
      <header className="rounded-3xl bg-gradient-to-r from-[#241438] via-[#462070] to-[#6b2f9e] p-7 text-white shadow-lg sm:p-9">
        <p className="text-xs font-bold tracking-[.22em] text-violet-200 uppercase">
          Comercial Legale · Diretoria
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Painel gerencial</h1>
            <p className="mt-2 max-w-2xl text-sm text-violet-100">
              Visão da carteira de propostas, avanço no funil e execução do time comercial.
            </p>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-medium">
            Atualizado ao abrir a página
          </span>
        </div>
      </header>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 lg:items-end xl:grid-cols-[1fr_1fr_1.4fr_1.2fr_1fr_1.2fr_auto]"
      >
        <label className="text-xs font-semibold text-slate-600">
          De
          <input
            type="date"
            name="de"
            defaultValue={inicio}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={fim}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Funil
          <select
            name="funil"
            defaultValue={pipelineFilter}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">Todos os funis</option>
            {pipelines.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Responsável
          <select
            name="responsavel"
            defaultValue={ownerFilter}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">Toda a equipe</option>
            {memberNames.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Situação
          <select
            name="situacao"
            defaultValue={statusFilter}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">Todas</option>
            {Object.entries(LABEL_STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Tipo de cliente
          <select
            name="tipo"
            defaultValue={kindFilter}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">Todos</option>
            <option value="escritorio">Escritório</option>
            <option value="departamento_juridico">Departamento jurídico</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-violet-700 px-5 text-sm font-semibold text-white hover:bg-violet-800"
        >
          Aplicar filtros
        </button>
      </form>
      {!periodoValido && (params.de || params.ate) ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Período inválido ou superior a 12 meses. Exibindo os últimos 30 dias.
        </p>
      ) : null}
      {truncated ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Há mais de 10.000 registros em pelo menos uma fonte. Os números desta tela estão
          incompletos; reduza o período ou selecione um funil.
        </p>
      ) : null}

      <section
        aria-label="Indicadores financeiros"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {card(
          "Propostas no período",
          String(propostas.length),
          "Documentos emitidos, incluindo rascunhos e versões",
          true,
        )}
        {card("Mensalidade proposta", brl(totalMensal), "Soma mensal das propostas filtradas")}
        {card("Valor único proposto", brl(totalUnico), "Implantação e demais cobranças únicas")}
        {card(
          "Mensalidade aprovada",
          brl(mensalAprovado),
          `${aprovadas.length} proposta(s) aprovada(s)`,
        )}
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores de operação"
      >
        {card("Novos cards", String(novosNegocios), "Criados no período selecionado")}
        {card(
          "Atividades",
          String(atividades.length),
          `${atividadesHumanas} com usuário responsável`,
        )}
        {card("Tarefas em aberto", String(tarefasAbertas.length), "Fotografia atual da carteira")}
        {card(
          "Tarefas atrasadas",
          String(tarefasAtrasadas.length),
          `${tarefasConcluidas.length} tarefas criadas no período já concluídas`,
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">Valores por etapa</h2>
            <p className="text-sm text-slate-500">
              Etapa atual dos cards com propostas emitidas no período. Oportunidades em aberto são
              uma fotografia de hoje.
            </p>
          </div>
          {porEtapa.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              Nenhuma etapa com propostas ou oportunidades para os filtros selecionados.
            </p>
          ) : (
            <div className="space-y-4">
              {porEtapa.map(({ stage, oportunidades, propostas: count, mensal, unico }) => (
                <div
                  key={stage.id}
                  className="border-b border-slate-100 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{stage.name}</p>
                      <p className="text-xs text-slate-500">
                        {pipelines.find((item) => item.id === stage.pipeline_id)?.name} ·{" "}
                        {oportunidades} card(s) em aberto · {count} proposta(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-violet-800 tabular-nums">{brl(mensal)} / mês</p>
                      <p className="text-xs text-slate-500 tabular-nums">{brl(unico)} único</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div
                      className="h-full rounded-full bg-violet-600"
                      style={{ width: `${percentual(mensal, totalMensal)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {semCard.length > 0 ? (
            <p className="mt-4 rounded-lg bg-violet-50 p-3 text-xs text-violet-800">
              {semCard.length} proposta(s) ainda sem card do funil:{" "}
              {brl(semCard.reduce((sum, item) => sum + Number(item.monthly_total_cents || 0), 0))} /
              mês. Vincule-as para aparecerem na etapa.
            </p>
          ) : null}
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Situação das propostas</h2>
            <p className="mb-5 text-sm text-slate-500">Distribuição dos documentos filtrados.</p>
            <div className="space-y-3">
              {porStatus.map(({ status, count }) => (
                <div key={status}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{LABEL_STATUS[status]}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-600"
                      style={{ width: `${percentual(count, propostas.length)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Trabalho registrado</h2>
            <p className="mb-4 text-sm text-slate-500">
              Tipos de atividade mais frequentes no período.
            </p>
            {topAtividades.length ? (
              <div className="space-y-2">
                {topAtividades.map(({ tipo, count }) => (
                  <div
                    key={tipo}
                    className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0"
                  >
                    <span className="truncate text-slate-700">{tipo.replaceAll("_", " ")}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma atividade registrada.</p>
            )}
            <Link
              href="/app/activities"
              className="mt-4 inline-block text-sm font-semibold text-violet-700 hover:underline"
            >
              Ver relatório de atividades →
            </Link>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Propostas por cliente</h2>
            <p className="text-sm text-slate-500">
              Detalhe das propostas no período. Abra uma proposta para conferir composição e escopo.
            </p>
          </div>
          <Link
            href="/app/propostas"
            className="text-sm font-semibold text-violet-700 hover:underline"
          >
            Ver todas as propostas →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3">Cliente / versão</th>
                <th className="px-5 py-3">Emissão</th>
                <th className="px-5 py-3">Etapa atual</th>
                <th className="px-5 py-3">Situação</th>
                <th className="px-5 py-3 text-right">Mensal</th>
                <th className="px-5 py-3 text-right">Único</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {propostas.slice(0, 50).map((item) => {
                const lead = item.lead_id ? leadById.get(item.lead_id) : null;
                return (
                  <tr key={item.id} className="hover:bg-violet-50/40">
                    <td className="px-5 py-3">
                      <Link
                        href={`/app/propostas/${item.id}`}
                        className="font-semibold text-slate-900 hover:text-violet-700 hover:underline"
                      >
                        {item.client_name}
                      </Link>
                      <p className="text-xs text-slate-500">Versão {item.version}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{dataBr(item.issue_date)}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {lead ? (stageById.get(lead.stage_id)?.name ?? "Etapa removida") : "Sem card"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                        {LABEL_STATUS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {brl(Number(item.monthly_total_cents || 0))}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600 tabular-nums">
                      {brl(Number(item.activation_total_cents || 0))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!propostas.length ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Nenhuma proposta encontrada para os filtros.
            </p>
          ) : null}
        </div>
        {propostas.length > 50 ? (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Exibindo as 50 propostas mais recentes de {propostas.length}. Os indicadores acima
            incluem todas as propostas carregadas.
          </p>
        ) : null}
      </section>
      <p className="text-xs leading-relaxed text-slate-500">
        Régua: período de {dataBr(inicio)} a {dataBr(fim)}, fuso de Brasília. Propostas por data de
        emissão; atividades por realização; novos cards por criação. Etapas e tarefas em aberto
        refletem o estado atual. Valores são comerciais propostos, não faturamento recebido. A soma
        inclui todas as versões de proposta registradas. O filtro de situação e tipo de cliente se
        aplica às propostas e aos seus valores; o filtro de responsável usa o dono do card ou
        criador da proposta avulsa, autor da atividade e pessoa atribuída à tarefa.
      </p>
    </main>
  );
}
