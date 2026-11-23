"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCentsBRL, parseReaisToCents } from "@/lib/money";
import {
  CICLOS_DA_EMPRESA,
  MODULOS_DO_LEGALE,
  ROTULO_DO_CICLO,
  ROTULO_DO_TIPO,
  TIPOS_DE_EMPRESA,
  formatarCnpj,
  type Empresa,
} from "@/lib/schemas/empresas";

export type PessoaDaEquipe = { id: string; nome: string };

const SELECT =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring";

function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{rotulo}</span>
      {children}
      {dica ? <span className="text-xs text-muted-foreground">{dica}</span> : null}
    </label>
  );
}

function Caixa({
  rotulo,
  marcado,
  onChange,
}: {
  rotulo: string;
  marcado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-sm border-border"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
      />
      {rotulo}
    </label>
  );
}

export function FormularioDaEmpresa({
  empresa,
  equipe,
  aoSalvar,
}: {
  empresa?: Empresa;
  equipe: PessoaDaEquipe[];
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = React.useState(false);
  const [f, setF] = React.useState({
    name: empresa?.name ?? "",
    legal_name: empresa?.legal_name ?? "",
    cnpj: empresa?.cnpj ? formatarCnpj(empresa.cnpj) : "",
    legale_code: empresa?.legale_code ?? "",
    client_kind: empresa?.client_kind ?? "",
    lifecycle: empresa?.lifecycle ?? "prospect",
    source: empresa?.source ?? "",
    commercial_owner_user_id: empresa?.commercial_owner_user_id ?? "",
    cs_owner_user_id: empresa?.cs_owner_user_id ?? "",
    phone: empresa?.phone ?? "",
    email: empresa?.email ?? "",
    website: empresa?.website ?? "",
    city: empresa?.city ?? "",
    state: empresa?.state ?? "",
    customer_since: empresa?.customer_since ?? "",
    renewal_date: empresa?.renewal_date ?? "",
    follow_up_every_days: empresa?.follow_up_every_days ? String(empresa.follow_up_every_days) : "",
    next_follow_up_on: empresa?.next_follow_up_on ?? "",
    contract_signed: empresa?.contract_signed ?? false,
    pays_legale: empresa?.pays_legale ?? false,
    pays_bi: empresa?.pays_bi ?? false,
    pays_monitoring: empresa?.pays_monitoring ?? false,
    contracted_modules: empresa?.contracted_modules ?? [],
    mensalidade:
      empresa?.monthly_revenue_cents != null
        ? formatCentsBRL(empresa.monthly_revenue_cents).replace(/^R\$\s?/, "")
        : "",
    notes: empresa?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((atual) => ({ ...atual, [k]: v }));
  const ehCliente = f.lifecycle !== "prospect";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const corpo = {
        name: f.name,
        legal_name: f.legal_name,
        cnpj: f.cnpj,
        legale_code: f.legale_code,
        client_kind: f.client_kind || null,
        lifecycle: f.lifecycle,
        source: f.source,
        commercial_owner_user_id: f.commercial_owner_user_id || null,
        cs_owner_user_id: f.cs_owner_user_id || null,
        phone: f.phone,
        email: f.email,
        website: f.website,
        city: f.city,
        state: f.state,
        customer_since: f.customer_since || null,
        renewal_date: f.renewal_date || null,
        follow_up_every_days: f.follow_up_every_days ? Number(f.follow_up_every_days) : null,
        next_follow_up_on: f.next_follow_up_on || null,
        contract_signed: f.contract_signed,
        pays_legale: f.pays_legale,
        pays_bi: f.pays_bi,
        pays_monitoring: f.pays_monitoring,
        contracted_modules: f.contracted_modules,
        monthly_revenue_cents: f.mensalidade.trim() ? parseReaisToCents(f.mensalidade) : null,
        notes: f.notes,
      };
      const resposta = await fetch(empresa ? `/api/v1/empresas/${empresa.id}` : "/api/v1/empresas", {
        method: empresa ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = (await resposta.json().catch(() => null)) as {
        data?: { id: string };
        error?: { message?: string; details?: Record<string, string[]> };
      } | null;
      if (!resposta.ok) {
        const detalhe = json?.error?.details ? Object.values(json.error.details).flat()[0] : null;
        throw new Error(detalhe ?? json?.error?.message ?? "Não foi possível salvar a empresa.");
      }
      toast.success(empresa ? "Empresa atualizada." : "Empresa criada.");
      if (aoSalvar) aoSalvar();
      if (!empresa && json?.data?.id) router.push(`/app/empresas/${json.data.id}`);
      else router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a empresa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-6" data-testid="form-empresa">
      <section className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome da empresa *">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
        </Campo>
        <Campo rotulo="Código no Legale" dica="Ex.: W463. Só para quem já é cliente.">
          <Input value={f.legale_code} onChange={(e) => set("legale_code", e.target.value)} placeholder="W123" />
        </Campo>
        <Campo rotulo="Razão social">
          <Input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
        </Campo>
        <Campo rotulo="CNPJ">
          <Input value={f.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
        </Campo>
        <Campo rotulo="Tipo">
          <select className={SELECT} value={f.client_kind} onChange={(e) => set("client_kind", e.target.value)}>
            <option value="">Não informado</option>
            {TIPOS_DE_EMPRESA.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DO_TIPO[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Situação">
          <select
            className={SELECT}
            value={f.lifecycle}
            onChange={(e) => set("lifecycle", e.target.value as typeof f.lifecycle)}
          >
            {CICLOS_DA_EMPRESA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_DO_CICLO[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Origem" dica="Site, Indicação, Evento...">
          <Input value={f.source} onChange={(e) => set("source", e.target.value)} />
        </Campo>
        <div />
        <Campo rotulo="Responsável comercial">
          <select
            className={SELECT}
            value={f.commercial_owner_user_id}
            onChange={(e) => set("commercial_owner_user_id", e.target.value)}
          >
            <option value="">Ninguém</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Responsável CS">
          <select className={SELECT} value={f.cs_owner_user_id} onChange={(e) => set("cs_owner_user_id", e.target.value)}>
            <option value="">Ninguém</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Telefone">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail">
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Campo>
        <Campo rotulo="Site">
          <Input value={f.website} onChange={(e) => set("website", e.target.value)} />
        </Campo>
        <Campo rotulo="Cidade">
          <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
        </Campo>
        <Campo rotulo="UF">
          <Input value={f.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} />
        </Campo>
      </section>

      {ehCliente ? (
        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="font-semibold">Sucesso do Cliente</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Cliente desde (onboarding)">
              <Input type="date" value={f.customer_since} onChange={(e) => set("customer_since", e.target.value)} />
            </Campo>
            <Campo rotulo="Renovação prevista">
              <Input type="date" value={f.renewal_date} onChange={(e) => set("renewal_date", e.target.value)} />
            </Campo>
            <Campo rotulo="Mensalidade (R$)">
              <Input
                inputMode="decimal"
                value={f.mensalidade}
                onChange={(e) => set("mensalidade", e.target.value)}
                placeholder="0,00"
              />
            </Campo>
            <Campo rotulo="Acompanhar a cada (dias)" dica="Sem valor, a saúde usa 30 dias.">
              <Input
                type="number"
                min={1}
                max={365}
                value={f.follow_up_every_days}
                onChange={(e) => set("follow_up_every_days", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Próximo contato">
              <Input
                type="date"
                value={f.next_follow_up_on}
                onChange={(e) => set("next_follow_up_on", e.target.value)}
              />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Caixa rotulo="Contrato assinado" marcado={f.contract_signed} onChange={(v) => set("contract_signed", v)} />
            <Caixa rotulo="Pagamento Legale" marcado={f.pays_legale} onChange={(v) => set("pays_legale", v)} />
            <Caixa rotulo="Pagamento BI" marcado={f.pays_bi} onChange={(v) => set("pays_bi", v)} />
            <Caixa
              rotulo="Pagamento Monitoramento"
              marcado={f.pays_monitoring}
              onChange={(v) => set("pays_monitoring", v)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Módulos contratados</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {MODULOS_DO_LEGALE.map((m) => (
                <Caixa
                  key={m.codigo}
                  rotulo={m.nome}
                  marcado={f.contracted_modules.includes(m.codigo)}
                  onChange={(v) =>
                    set(
                      "contracted_modules",
                      v ? [...f.contracted_modules, m.codigo] : f.contracted_modules.filter((c) => c !== m.codigo),
                    )
                  }
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <Campo rotulo="Observações">
        <Textarea rows={4} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Campo>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : empresa ? "Salvar alterações" : "Criar empresa"}
        </Button>
      </div>
    </form>
  );
}
