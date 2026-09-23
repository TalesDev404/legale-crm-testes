"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
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
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const {
    data: candidates,
    isLoading: candidatesLoading,
    isError: candidatesError,
  } = useQuery({
    queryKey: ["commercial_proposals", "candidates", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const response = await fetch(`/api/v1/propostas?${params}`);
      if (!response.ok) throw new Error("Não foi possível buscar as propostas.");
      const body = (await response.json()) as { data: PropostaComercial[] };
      return body.data;
    },
    enabled: active && pickerOpen,
    staleTime: 10_000,
  });
  const available = candidates?.filter((proposal) => proposal.lead_id !== leadId) ?? [];
  const selected = available.find((proposal) => proposal.id === selectedId);

  function buscar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedId("");
    setSearch(searchInput.trim());
  }

  async function vincular() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/v1/propostas/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Não foi possível vincular a proposta.");
      }
      await queryClient.invalidateQueries({ queryKey: ["commercial_proposals"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      setPickerOpen(false);
      setSelectedId("");
      setSearchInput("");
      setSearch("");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Não foi possível vincular a proposta.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-border py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-text-muted uppercase">Propostas</h3>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => {
              setPickerOpen((open) => !open);
              setSaveError(null);
            }}
            className="text-xs text-accent hover:underline"
          >
            {pickerOpen ? "Fechar busca" : "Vincular existente"}
          </button>
          <Link
            href={`/app/propostas/nova?lead=${leadId}`}
            className="text-xs text-accent hover:underline"
          >
            Nova proposta
          </Link>
        </div>
      </div>
      {pickerOpen ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface p-3">
          <form onSubmit={buscar} className="flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por cliente"
              aria-label="Buscar proposta pelo nome do cliente"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-border px-3 text-xs hover:bg-muted"
            >
              Buscar
            </button>
          </form>
          {candidatesLoading ? (
            <p className="text-xs text-text-muted">Buscando propostas…</p>
          ) : null}
          {candidatesError ? (
            <p className="text-xs text-destructive">Não foi possível buscar as propostas.</p>
          ) : null}
          {!candidatesLoading && !candidatesError && available.length === 0 ? (
            <p className="text-xs text-text-muted">Nenhuma proposta disponível nesta busca.</p>
          ) : null}
          {available.length > 0 ? (
            <div className="max-h-48 space-y-1 overflow-y-auto" aria-label="Propostas existentes">
              {available.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  aria-pressed={selectedId === proposal.id}
                  onClick={() => {
                    setSelectedId(proposal.id);
                    setSaveError(null);
                  }}
                  className={`w-full rounded-md border px-2 py-2 text-left text-sm hover:border-accent ${
                    selectedId === proposal.id ? "border-accent bg-accent/5" : "border-transparent"
                  }`}
                >
                  <span className="block font-medium text-text">{proposal.client_name}</span>
                  <span className="text-xs text-text-muted">
                    {STATUS[proposal.status]}
                    {proposal.lead_id ? " · Vinculada a outro card" : " · Sem card"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {selected ? (
            <div className="space-y-2 border-t border-border pt-3">
              {selected.lead_id ? (
                <p className="text-xs text-text-muted">
                  Esta proposta já pertence a outro card. Ao confirmar, ela e suas tarefas
                  vinculadas serão movidas para este card.
                </p>
              ) : null}
              <Button
                type="button"
                disabled={saving}
                onClick={vincular}
                size="sm"
                className="text-xs"
              >
                {saving
                  ? "Salvando…"
                  : selected.lead_id
                    ? "Mover para este card"
                    : "Vincular ao card"}
              </Button>
            </div>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-xs text-destructive">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
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
