"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { formatCents } from "@/lib/money";
import type { PropostaComercial } from "@/lib/schemas/propostas";

const STATUS: Record<PropostaComercial["status"], string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  expirada: "Expirada",
};

export function PropostasDoNegocio({ leadId, active }: { leadId: string; active: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["commercial_proposals", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/propostas?lead_id=${leadId}`);
      if (!response.ok) throw new Error("Não foi possível carregar as propostas.");
      const body = (await response.json()) as { data: PropostaComercial[] };
      return body.data;
    },
    enabled: active,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return (
    <section className="border-b border-border py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-text-muted uppercase">Propostas</h3>
        <Link
          href={`/app/propostas/nova?lead=${leadId}`}
          className="text-xs text-accent hover:underline"
        >
          Nova proposta
        </Link>
      </div>
      {isLoading ? <p className="mt-2 text-xs text-text-muted">Carregando propostas…</p> : null}
      {isError ? (
        <p className="mt-2 text-xs text-destructive">Não foi possível carregar as propostas.</p>
      ) : null}
      {data?.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">Nenhuma proposta vinculada a este card.</p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {data.map((proposal) => (
            <li key={proposal.id} className="px-3 py-2">
              <Link href={`/app/propostas/${proposal.id}`} className="block hover:underline">
                <span className="block text-sm font-medium text-text">{proposal.client_name}</span>
                <span className="text-xs text-text-muted">
                  {STATUS[proposal.status]} ·{" "}
                  {formatCents(proposal.monthly_total_cents, proposal.currency)}/mês
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
