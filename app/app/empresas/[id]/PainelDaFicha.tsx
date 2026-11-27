"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  FINALIDADES_DO_CONTATO,
  MODULOS_DO_LEGALE,
  ROTULO_DA_FINALIDADE,
  type FinalidadeDoContato,
} from "@/lib/schemas/empresas";

async function enviar(url: string, method: string, corpo: unknown): Promise<unknown> {
  const resposta = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await resposta.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string };
  } | null;
  if (!resposta.ok) throw new Error(json?.error?.message ?? "Não foi possível salvar.");
  return json?.data;
}

type EstadoDoModulo = "contratado" | "negociacao" | "oportunidade";

const ESTILO: Record<EstadoDoModulo, string> = {
  contratado: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  negociacao: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  oportunidade: "border-dashed border-border bg-surface text-text-muted",
};
const ROTULO: Record<EstadoDoModulo, string> = {
  contratado: "Contratado",
  negociacao: "Em negociação",
  oportunidade: "Oportunidade",
};

/**
 * MAPA DE MÓDULOS: o que a empresa já usa, o que está em negociação e onde
 * há espaço para upsell. "Contratado" se marca aqui mesmo (a planilha não
 * trazia essa informação); "Em negociação" vem dos negócios abertos que têm o
 * módulo em "Módulos de interesse"; o resto é oportunidade, com o botão que
 * abre o negócio de upsell no funil.
 */
export function MapaDeModulos({
  empresaId,
  contratados,
  emNegociacao,
  podeEditar,
}: {
  empresaId: string;
  contratados: string[];
  emNegociacao: Record<string, string>;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  async function alternar(codigo: string) {
    const proximos = contratados.includes(codigo)
      ? contratados.filter((c) => c !== codigo)
      : [...contratados, codigo];
    setOcupado(codigo);
    try {
      await enviar(`/api/v1/empresas/${empresaId}`, "PATCH", { contracted_modules: proximos });
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  }

  async function criarUpsell(codigo: string) {
    setOcupado(codigo);
    try {
      const criado = (await enviar(`/api/v1/empresas/${empresaId}/upsell`, "POST", { modulo: codigo })) as {
        id: string;
      };
      toast.success("Negócio de upsell criado no funil comercial.", {
        action: { label: "Abrir", onClick: () => router.push(`/app/leads/${criado.id}`) },
      });
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o negócio.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="rounded-xl border bg-surface p-4" data-testid="mapa-de-modulos">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Módulos</h2>
        <p className="text-xs text-muted-foreground">
          {contratados.length} de {MODULOS_DO_LEGALE.length} contratados
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {MODULOS_DO_LEGALE.map((m) => {
          const estado: EstadoDoModulo = contratados.includes(m.codigo)
            ? "contratado"
            : emNegociacao[m.codigo]
              ? "negociacao"
              : "oportunidade";
          return (
            <li key={m.codigo} className={`rounded-lg border p-3 text-sm ${ESTILO[estado]}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-text">{m.nome}</span>
                <span className="shrink-0 text-xs">{ROTULO[estado]}</span>
              </div>
              {estado === "negociacao" ? (
                <p className="mt-1 truncate text-xs">{emNegociacao[m.codigo]}</p>
              ) : null}
              {podeEditar ? (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => alternar(m.codigo)}
                    className="underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {estado === "contratado" ? "Desmarcar" : "Marcar como contratado"}
                  </button>
                  {estado === "oportunidade" ? (
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => criarUpsell(m.codigo)}
                      className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Criar negócio de upsell
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** As etiquetas de finalidade de um contato, clicáveis para ligar e desligar. */
export function FinalidadesDoContato({
  empresaId,
  contatoId,
  finalidades,
  podeEditar,
}: {
  empresaId: string;
  contatoId: string;
  finalidades: FinalidadeDoContato[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [atuais, setAtuais] = React.useState(finalidades);
  const [editando, setEditando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  async function alternar(f: FinalidadeDoContato) {
    const proximas = atuais.includes(f) ? atuais.filter((x) => x !== f) : [...atuais, f];
    setSalvando(true);
    try {
      await enviar(`/api/v1/empresas/${empresaId}/contatos/${contatoId}`, "PATCH", { account_roles: proximas });
      setAtuais(proximas);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const visiveis = editando ? FINALIDADES_DO_CONTATO : FINALIDADES_DO_CONTATO.filter((f) => atuais.includes(f));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visiveis.map((f) => {
        const ativo = atuais.includes(f);
        return editando ? (
          <button
            key={f}
            type="button"
            disabled={salvando}
            onClick={() => alternar(f)}
            aria-pressed={ativo}
            className={`rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-50 ${
              ativo ? "border-primary bg-primary text-primary-foreground" : "border-border text-text-muted"
            }`}
          >
            {ROTULO_DA_FINALIDADE[f]}
          </button>
        ) : (
          <span key={f} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {ROTULO_DA_FINALIDADE[f]}
          </span>
        );
      })}
      {podeEditar ? (
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="text-[11px] text-text-muted underline-offset-2 hover:underline"
        >
          {editando ? "Pronto" : atuais.length ? "Editar" : "Definir finalidade"}
        </button>
      ) : null}
    </div>
  );
}
