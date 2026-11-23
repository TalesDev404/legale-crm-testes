"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CANAIS_DE_CONTATO,
  NIVEIS_DE_SAUDE,
  ROTULO_DA_SAUDE,
  ROTULO_DO_CANAL,
  ROTULO_DO_TIME,
  TIMES,
  type Empresa,
  type NivelDeSaude,
  type Time,
} from "@/lib/schemas/empresas";

import { FormularioDaEmpresa, type PessoaDaEquipe } from "../_components/FormularioDaEmpresa";

const SELECT = "h-10 rounded-lg border border-border bg-surface px-3 text-sm";

async function enviar(url: string, method: string, corpo: unknown): Promise<void> {
  const resposta = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    const json = (await resposta.json().catch(() => null)) as {
      error?: { message?: string; details?: Record<string, string[]> };
    } | null;
    const detalhe = json?.error?.details ? Object.values(json.error.details).flat()[0] : null;
    throw new Error(detalhe ?? json?.error?.message ?? "Não foi possível salvar.");
  }
}

export function RegistrarContato({
  empresaId,
  timePadrao,
  negocios,
}: {
  empresaId: string;
  timePadrao: Time;
  negocios: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [time, setTime] = React.useState<Time>(timePadrao);
  const [canal, setCanal] = React.useState<(typeof CANAIS_DE_CONTATO)[number]>("ligacao");
  const [resumo, setResumo] = React.useState("");
  const [negocio, setNegocio] = React.useState("");
  const [proximo, setProximo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await enviar(`/api/v1/empresas/${empresaId}/atividades`, "POST", {
        team: time,
        channel: canal,
        summary: resumo,
        lead_id: negocio || null,
        next_follow_up_on: proximo || null,
      });
      toast.success("Contato registrado.");
      setResumo("");
      setProximo("");
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border bg-surface p-4" data-testid="registrar-contato">
      <h3 className="font-semibold">Registrar contato</h3>
      <div className="flex flex-wrap gap-2">
        <select className={SELECT} value={time} onChange={(e) => setTime(e.target.value as Time)} aria-label="Time">
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_TIME[t]}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={canal}
          onChange={(e) => setCanal(e.target.value as typeof canal)}
          aria-label="Canal"
        >
          {CANAIS_DE_CONTATO.map((c) => (
            <option key={c} value={c}>
              {ROTULO_DO_CANAL[c]}
            </option>
          ))}
        </select>
        {negocios.length > 0 ? (
          <select className={SELECT} value={negocio} onChange={(e) => setNegocio(e.target.value)} aria-label="Negócio">
            <option value="">Sem negócio</option>
            {negocios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <Textarea
        rows={3}
        value={resumo}
        onChange={(e) => setResumo(e.target.value)}
        placeholder="O que foi conversado e o que ficou combinado"
        required
        minLength={2}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Próximo contato (opcional)</span>
          <Input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} className="w-48" />
        </label>
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

export function AjusteDeSaude({ empresa }: { empresa: Empresa }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [nivel, setNivel] = React.useState<NivelDeSaude | "">(empresa.health_override ?? "");
  const [motivo, setMotivo] = React.useState(empresa.health_override_reason ?? "");
  const [salvando, setSalvando] = React.useState(false);

  async function salvar(novo: NivelDeSaude | null) {
    setSalvando(true);
    try {
      await enviar(`/api/v1/empresas/${empresa.id}`, "PATCH", {
        health_override: novo,
        health_override_reason: novo ? motivo : null,
      });
      toast.success(novo ? "Saúde ajustada." : "Ajuste removido: a saúde volta a ser calculada.");
      setAberto(false);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ajustar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
        Ajustar saúde
      </Button>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3">
      <select className={SELECT} value={nivel} onChange={(e) => setNivel(e.target.value as NivelDeSaude)}>
        <option value="">Escolha o nível</option>
        {NIVEIS_DE_SAUDE.map((n) => (
          <option key={n} value={n}>
            {ROTULO_DA_SAUDE[n]}
          </option>
        ))}
      </select>
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por quê?" />
      <div className="flex gap-2">
        <Button size="sm" disabled={salvando || !nivel} onClick={() => nivel && salvar(nivel)}>
          Salvar ajuste
        </Button>
        {empresa.health_override ? (
          <Button size="sm" variant="outline" disabled={salvando} onClick={() => salvar(null)}>
            Voltar ao cálculo
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function EditarEmpresa({ empresa, equipe }: { empresa: Empresa; equipe: PessoaDaEquipe[] }) {
  const [aberto, setAberto] = React.useState(false);
  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        Editar dados
      </Button>
    );
  }
  return (
    <div className="mt-4 w-full rounded-xl border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Editar dados da empresa</h2>
        <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
      <FormularioDaEmpresa empresa={empresa} equipe={equipe} aoSalvar={() => setAberto(false)} />
    </div>
  );
}
