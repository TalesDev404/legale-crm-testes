import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { PropostaDaTarefa } from "@/lib/tarefas/tipos";

import { TarefasClient } from "./_components/TarefasClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarefas" };

/**
 * TAREFAS — "ligar de volta na terça", num lugar que não é a memória de ninguém.
 *
 * Extraído do PR #418, de @clinicacentrodosorrisosc-code, que construiu o
 * módulo inteiro rodando o produto numa operação real. O que muda aqui é o
 * vocabulário: a tela dele somava tarefas com "agendamentos" derivados de
 * `custom_fields.agendamento_*` do lead, e falava consulta/procedimento/
 * compareceu. Compromisso com cliente já é a Agenda (migration 0177), que tem
 * tabela, horário, local e confirmação — e este produto atende clínica,
 * imobiliária, loja e infoproduto com as mesmas telas.
 *
 * ─── Quem pode o quê ───────────────────────────────────────────────────────
 *
 * `viewer` VÊ as tarefas: saber o que o time combinou é informação de operação.
 * Criar e editar é `agent` — e a rota cobra de novo (`requireRole("agent")`).
 * A tela esconder o botão é cortesia, não autorização.
 */
export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ proposal?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEditar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  const supabase = await createClient();
  const [{ data: proposals }, { proposal: proposalParam }] = await Promise.all([
    supabase
      .from("commercial_proposals")
      .select("id, client_name, lead_id")
      .eq("organization_id", activeOrg.orgId)
      .order("updated_at", { ascending: false })
      .limit(300),
    searchParams,
  ]);
  const propostas = (proposals ?? []) as PropostaDaTarefa[];
  if (proposalParam && !propostas.some((item) => item.id === proposalParam)) {
    const { data: selectedProposal } = await supabase
      .from("commercial_proposals")
      .select("id, client_name, lead_id")
      .eq("organization_id", activeOrg.orgId)
      .eq("id", proposalParam)
      .maybeSingle();
    if (selectedProposal) propostas.unshift(selectedProposal as PropostaDaTarefa);
  }

  return (
    <TarefasClient
      podeEditar={podeEditar}
      propostas={propostas}
      propostaInicialId={
        propostas.some((item) => item.id === proposalParam) ? proposalParam : undefined
      }
    />
  );
}
