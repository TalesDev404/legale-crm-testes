"use client";

import * as React from "react";
import { toast } from "sonner";

import { AREAS_DA_EQUIPE, ROTULO_DA_AREA, type AreaDaEquipe } from "@/lib/schemas/empresas";

type Membro = { id: string; nome: string; email: string | null; papel: string; areas: AreaDaEquipe[] };

/**
 * Áreas da equipe (Comercial, Sucesso do Cliente, Diretoria). A área decide de
 * quem é a carteira e o que a tela mostra primeiro; o que a pessoa PODE fazer
 * continua sendo o papel (Membros). Só admin altera.
 */
export function AreasDaEquipeClient({ podeEditar }: { podeEditar: boolean }) {
  const [membros, setMembros] = React.useState<Membro[] | null>(null);
  const [salvando, setSalvando] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/v1/team/areas")
      .then((r) => r.json())
      .then((json: { data?: Membro[] }) => {
        if (vivo) setMembros(json.data ?? []);
      })
      .catch(() => {
        if (vivo) setMembros([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function alternar(membro: Membro, area: AreaDaEquipe) {
    const areas = membro.areas.includes(area) ? membro.areas.filter((a) => a !== area) : [...membro.areas, area];
    setSalvando(membro.id);
    try {
      const resposta = await fetch("/api/v1/team/areas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: membro.id, areas }),
      });
      if (!resposta.ok) {
        const json = (await resposta.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(json?.error?.message ?? "Não foi possível salvar.");
      }
      setMembros((lista) => (lista ?? []).map((m) => (m.id === membro.id ? { ...m, areas } : m)));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(null);
    }
  }

  if (membros === null) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (membros.length === 0) return <p className="text-sm text-muted-foreground">Nenhum membro ativo.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border bg-surface" data-testid="areas-da-equipe">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Pessoa</th>
            {AREAS_DA_EQUIPE.map((a) => (
              <th key={a} className="px-4 py-3 text-center font-medium">
                {ROTULO_DA_AREA[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {membros.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{m.nome}</p>
                {m.email && m.email !== m.nome ? <p className="text-xs text-muted-foreground">{m.email}</p> : null}
              </td>
              {AREAS_DA_EQUIPE.map((a) => (
                <td key={a} className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${m.nome} em ${ROTULO_DA_AREA[a]}`}
                    className="h-4 w-4"
                    checked={m.areas.includes(a)}
                    disabled={!podeEditar || salvando === m.id}
                    onChange={() => alternar(m, a)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!podeEditar ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Só administradores alteram as áreas.</p>
      ) : null}
    </div>
  );
}
