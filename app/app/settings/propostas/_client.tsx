"use client";
import * as React from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";
import { formatCentsBRL } from "@/lib/money";
const reais = (v: string) =>
  Math.max(0, Math.round(Number(v.replace(".", "").replace(",", ".")) * 100) || 0);
const fmt = (n: number) => (n / 100).toFixed(2).replace(".", ",");
export function CatalogoClient({
  initial,
  canEdit,
}: {
  initial: ItemDoCatalogo[];
  canEdit: boolean;
}) {
  const [items, setItems] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const patch = (i: number, p: Partial<ItemDoCatalogo>) =>
    setItems((v) => v.map((x, n) => (n === i ? { ...x, ...p } : x)));
  async function save() {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/propostas/catalogo", { itens: items });
      toast.success("Catálogo comercial salvo.");
    } catch {
      toast.error("Não foi possível salvar o catálogo.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Propostas</p>
          <h1 className="text-2xl font-semibold">Catálogo comercial</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preços usados como referência nas novas propostas. Propostas já emitidas não são
            alteradas.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar preços"}
          </Button>
        ) : null}
      </header>
      <div className="overflow-x-auto rounded-xl border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 text-left">Item</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-right">Escritório</th>
              <th className="p-3 text-right">Departamento jurídico</th>
              <th className="p-3 text-right">Setup</th>
              <th className="p-3 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, i) => (
              <tr key={item.codigo}>
                <td className="p-3">
                  <Input
                    value={item.nome}
                    disabled={!canEdit}
                    onChange={(e) => patch(i, { nome: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{item.codigo}</p>
                </td>
                <td className="p-3">{item.categoria}</td>
                {(
                  ["preco_escritorio_cents", "preco_departamento_cents", "setup_cents"] as const
                ).map((k) => (
                  <td className="p-3" key={k}>
                    <Input
                      className="text-right"
                      value={fmt(item[k])}
                      disabled={!canEdit}
                      aria-label={`${item.nome} ${k}`}
                      onChange={(e) => patch(i, { [k]: reais(e.target.value) })}
                    />
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {formatCentsBRL(item[k])}
                    </p>
                  </td>
                ))}
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.ativo}
                    disabled={!canEdit}
                    onChange={(e) => patch(i, { ativo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
