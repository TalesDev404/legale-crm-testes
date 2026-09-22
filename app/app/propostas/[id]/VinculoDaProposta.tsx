"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type LeadOption = { id: string; title: string };

export function VinculoDaProposta({
  proposalId,
  leadId,
  leads,
}: {
  proposalId: string;
  leadId: string | null;
  leads: LeadOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(leadId ?? "");
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/propostas/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: selected || null }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Não foi possível vincular a proposta.");
      }
      toast.success("Vínculo da proposta atualizado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o vínculo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="proposal-lead" className="text-sm text-muted-foreground">
        Card do funil
      </label>
      <select
        id="proposal-lead"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="h-9 max-w-[230px] rounded-lg border border-border bg-surface px-3 text-sm"
      >
        <option value="">Sem vínculo</option>
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {lead.title}
          </option>
        ))}
      </select>
      {selected !== (leadId ?? "") ? (
        <Button size="sm" onClick={salvar} disabled={saving}>
          {saving ? "Salvando…" : "Salvar vínculo"}
        </Button>
      ) : null}
      {leadId ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/app/leads/${leadId}`}>Ver card</Link>
        </Button>
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href={`/app/tasks?proposal=${proposalId}`}>Criar tarefa</Link>
      </Button>
    </div>
  );
}
