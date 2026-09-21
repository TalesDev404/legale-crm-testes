"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL, parseReaisToCents } from "@/lib/money";
import { precoDoCatalogo, type ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";
import { type ItemDaProposta, type PropostaComercial } from "@/lib/schemas/propostas";

type Contact = {
  id: string;
  display_name: string | null;
  name: string | null;
  email: string | null;
};

function isoHoje(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function somarDias(data: string, dias: number): string {
  const valor = new Date(`${data}T12:00:00`);
  valor.setDate(valor.getDate() + dias);
  return valor.toISOString().slice(0, 10);
}

export function NovaPropostaClient({
  contacts,
  companyName,
  catalog,
}: {
  contacts: Contact[];
  companyName: string;
  catalog: ItemDoCatalogo[];
}) {
  const router = useRouter();
  const hoje = React.useMemo(() => isoHoje(), []);
  const [clientName, setClientName] = React.useState("");
  const [clientKind, setClientKind] = React.useState<"escritorio" | "departamento_juridico">(
    "departamento_juridico",
  );
  const [contactId, setContactId] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(hoje);
  const [validUntil, setValidUntil] = React.useState(somarDias(hoje, 15));
  const [selected, setSelected] = React.useState<string[]>([]);
  const [modulePrices, setModulePrices] = React.useState<Record<string, string>>({});
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [activation, setActivation] = React.useState("0,00");
  const [notes, setNotes] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState(
    "Cobrança mensal após a ativação. Início do projeto após a assinatura do contrato.",
  );
  const [saving, setSaving] = React.useState(false);

  function chooseContact(id: string) {
    setContactId(id);
    const contact = contacts.find((item) => item.id === id);
    if (!contact) return;
    const name = contact.display_name || contact.name || "";
    setClientName(name);
    setRecipientName(name);
    setRecipientEmail(contact.email ?? "");
  }

  const items = React.useMemo<ItemDaProposta[]>(() => {
    const result: ItemDaProposta[] = catalog
      .filter((item) => item.categoria !== "usuario" && selected.includes(item.codigo))
      .map((item) => {
        const primeiraFaixa = item.faixas_preco[0];
        const quantity = primeiraFaixa
          ? Math.max(
              0,
              Number.parseInt(
                quantities[item.codigo] ?? String(primeiraFaixa.quantidade_minima),
                10,
              ) || 0,
            )
          : 1;
        const defaultPrice =
          clientKind === "escritorio" ? item.preco_escritorio_cents : item.preco_departamento_cents;
        const price = primeiraFaixa
          ? precoDoCatalogo(item, quantity, clientKind)
          : (parseReaisToCents(
              modulePrices[item.codigo] ?? String(defaultPrice / 100).replace(".", ","),
            ) ?? 0);
        return {
          codigo: item.codigo,
          nome: item.nome,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: quantity,
          valor_unitario_cents: price,
          total_cents: price * quantity,
          cobranca: item.cobranca,
          categoria: item.categoria,
        };
      })
      .filter((item) => item.quantidade > 0);
    catalog
      .filter((item) => item.categoria === "usuario")
      .forEach((item) => {
        const quantity = Math.max(0, Number.parseInt(quantities[item.codigo] ?? "0", 10) || 0);
        if (quantity === 0) return;
        const unit = precoDoCatalogo(item, quantity, clientKind);
        result.push({
          codigo: item.codigo,
          nome: item.nome,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: quantity,
          valor_unitario_cents: unit,
          total_cents: quantity * unit,
          cobranca: item.cobranca,
          categoria: "usuario",
        });
      });
    catalog
      .filter((item) => selected.includes(item.codigo) && item.setup_cents > 0)
      .forEach((item) => {
        result.push({
          codigo: `${item.codigo}_setup`,
          nome: `Ativação — ${item.nome}`,
          descricao: `Configuração inicial de ${item.nome}.`,
          unidade: "ativação",
          quantidade: 1,
          valor_unitario_cents: item.setup_cents,
          total_cents: item.setup_cents,
          cobranca: "unica",
          categoria: "ativacao",
        });
      });
    const activationCents = parseReaisToCents(activation) ?? 0;
    if (activationCents > 0)
      result.push({
        codigo: "ativacao",
        nome: "Ativação e implantação",
        descricao:
          "Preparação do ambiente, configuração inicial e acompanhamento da entrada em operação.",
        unidade: "ativação",
        quantidade: 1,
        valor_unitario_cents: activationCents,
        total_cents: activationCents,
        cobranca: "unica",
        categoria: "ativacao",
      });
    return result;
  }, [activation, catalog, clientKind, modulePrices, quantities, selected]);

  const monthly = items
    .filter((item) => item.cobranca === "mensal")
    .reduce((sum, item) => sum + item.total_cents, 0);
  const oneTime = items
    .filter((item) => item.cobranca === "unica")
    .reduce((sum, item) => sum + item.total_cents, 0);

  async function save() {
    if (clientName.trim().length < 2) return toast.error("Informe o nome do cliente.");
    const abaixoDoMinimo = catalog.find((item) => {
      const primeiraFaixa = item.faixas_preco[0];
      return (
        selected.includes(item.codigo) &&
        primeiraFaixa !== undefined &&
        (Number.parseInt(quantities[item.codigo] ?? String(primeiraFaixa.quantidade_minima), 10) ||
          0) < primeiraFaixa.quantidade_minima
      );
    });
    if (abaixoDoMinimo) {
      const quantidadeMinima = abaixoDoMinimo.faixas_preco[0]?.quantidade_minima ?? 1;
      return toast.error(
        `${abaixoDoMinimo.nome} exige no mínimo ${quantidadeMinima} ${abaixoDoMinimo.unidade}(s).`,
      );
    }
    if (items.length === 0) return toast.error("Inclua ao menos um módulo ou serviço.");
    if (
      selected.some(
        (code) =>
          modulePrices[code] !== undefined && parseReaisToCents(modulePrices[code]) === null,
      )
    )
      return toast.error("Informe o valor de cada módulo selecionado.");
    setSaving(true);
    try {
      const response = await apiClient.post<{ data: PropostaComercial }>("/api/v1/propostas", {
        contact_id: contactId || null,
        client_name: clientName,
        client_kind: clientKind,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        issue_date: issueDate,
        valid_until: validUntil,
        status: "rascunho",
        notes,
        payment_terms: paymentTerms,
        items,
      });
      toast.success("Proposta salva como rascunho");
      router.push(`/app/propostas/${response.data.id}`);
      router.refresh();
    } catch (error) {
      showApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-6" data-testid="nova-proposta">
      <header className="mb-6">
        <p className="text-sm font-medium text-accent">Propostas</p>
        <h1 className="text-2xl font-semibold">Nova proposta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preencha a contratação enquanto o resumo calcula os valores.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">1. Cliente</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                Usar um contato existente{" "}
                <select
                  value={contactId}
                  onChange={(event) => chooseContact(event.target.value)}
                  className="mt-1 h-10 w-full rounded-sm border bg-bg px-3"
                >
                  <option value="">Cliente ainda não cadastrado</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.display_name || contact.name || contact.email || "Contato sem nome"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Empresa ou escritório
                <Input
                  className="mt-1"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Tipo de cliente
                <select
                  value={clientKind}
                  onChange={(event) => setClientKind(event.target.value as typeof clientKind)}
                  className="mt-1 h-10 w-full rounded-sm border bg-bg px-3"
                >
                  <option value="departamento_juridico">Departamento jurídico</option>
                  <option value="escritorio">Escritório de advocacia</option>
                </select>
              </label>
              <label className="text-sm">
                Preparada para
                <Input
                  className="mt-1"
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </label>
              <label className="text-sm">
                E-mail
                <Input
                  className="mt-1"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Emissão
                <Input
                  className="mt-1"
                  type="date"
                  value={issueDate}
                  onChange={(event) => {
                    setIssueDate(event.target.value);
                    setValidUntil(somarDias(event.target.value, 15));
                  }}
                />
              </label>
              <label className="text-sm">
                Válida até
                <Input
                  className="mt-1"
                  type="date"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">2. Módulos e funcionalidades</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Marque o que o cliente está contratando.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {catalog
                .filter((item) => item.categoria === "modulo" || item.categoria === "servico")
                .map((item) => {
                  const checked = selected.includes(item.codigo);
                  const primeiraFaixa = item.faixas_preco[0];
                  const defaultPrice =
                    clientKind === "escritorio"
                      ? item.preco_escritorio_cents
                      : item.preco_departamento_cents;
                  return (
                    <div
                      key={item.codigo}
                      className={`rounded-lg border p-4 transition ${checked ? "border-accent bg-accent-soft" : "hover:border-border-strong"}`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelected((current) =>
                              checked
                                ? current.filter((code) => code !== item.codigo)
                                : [...current, item.codigo],
                            )
                          }
                          className="mt-1"
                        />
                        <span>
                          <strong className="block text-sm">{item.nome}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.descricao}
                          </span>
                        </span>
                      </label>
                      {checked && primeiraFaixa ? (
                        <label className="mt-3 block text-xs font-medium">
                          Quantidade de {item.unidade}(s)
                          <Input
                            className="mt-1"
                            type="number"
                            min={primeiraFaixa.quantidade_minima}
                            value={
                              quantities[item.codigo] ?? String(primeiraFaixa.quantidade_minima)
                            }
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [item.codigo]: event.target.value,
                              }))
                            }
                          />
                          <span className="mt-1 block text-muted-foreground">
                            Valor unitário:{" "}
                            {formatCentsBRL(
                              precoDoCatalogo(
                                item,
                                Number.parseInt(
                                  quantities[item.codigo] ??
                                    String(primeiraFaixa.quantidade_minima),
                                  10,
                                ),
                                clientKind,
                              ),
                            )}
                          </span>
                        </label>
                      ) : checked ? (
                        <label className="mt-3 block text-xs font-medium">
                          Valor {item.cobranca === "mensal" ? "mensal" : "único"} (R$)
                          <Input
                            className="mt-1"
                            placeholder="0,00"
                            value={
                              modulePrices[item.codigo] ??
                              String(defaultPrice / 100).replace(".", ",")
                            }
                            onChange={(event) =>
                              setModulePrices((current) => ({
                                ...current,
                                [item.codigo]: event.target.value,
                              }))
                            }
                          />
                          {item.setup_cents > 0 ? (
                            <span className="mt-1 block text-muted-foreground">
                              Ativação: {formatCentsBRL(item.setup_cents)}
                            </span>
                          ) : null}
                        </label>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">3. Usuários</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe as quantidades dos tipos de acesso contratados.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog
                .filter((item) => item.categoria === "usuario")
                .map((item) => {
                  const quantity = Number.parseInt(quantities[item.codigo] ?? "0", 10) || 0;
                  const unit = precoDoCatalogo(item, quantity, clientKind);
                  return (
                    <label className="text-sm" key={item.codigo}>
                      {item.nome}
                      <Input
                        className="mt-1"
                        type="number"
                        min={item.faixas_preco[0]?.quantidade_minima ?? 0}
                        value={quantities[item.codigo] ?? "0"}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.codigo]: event.target.value,
                          }))
                        }
                      />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatCentsBRL(unit)} por usuário/mês
                      </span>
                    </label>
                  );
                })}
              <label className="text-sm">
                Ativação (R$)
                <Input
                  className="mt-1"
                  value={activation}
                  onChange={(event) => setActivation(event.target.value)}
                />
              </label>
            </div>
          </section>

          {catalog.some((item) => item.categoria === "migracao") ? (
            <section className="rounded-xl border bg-surface p-5">
              <h2 className="font-semibold">4. Migração de dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecione o sistema em que o cliente está atualmente.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {catalog
                  .filter((item) => item.categoria === "migracao")
                  .map((item) => {
                    const checked = selected.includes(item.codigo);
                    const price = precoDoCatalogo(item, 1, clientKind);
                    return (
                      <label
                        key={item.codigo}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${checked ? "border-accent bg-accent-soft" : ""}`}
                      >
                        <input
                          className="mt-1"
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelected((current) =>
                              checked
                                ? current.filter((code) => code !== item.codigo)
                                : [...current, item.codigo],
                            )
                          }
                        />
                        <span>
                          <strong className="block text-sm">{item.nome}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.descricao}
                          </span>
                          <span className="mt-2 block text-sm font-semibold">
                            {formatCentsBRL(price)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border bg-surface p-5">
            <h2 className="font-semibold">
              {catalog.some((item) => item.categoria === "migracao") ? "5" : "4"}. Condições e
              observações
            </h2>
            <label className="mt-4 block text-sm">
              Prazo e forma de pagamento
              <Textarea
                className="mt-1"
                value={paymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm">
              Observações da proposta
              <Textarea
                className="mt-1"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Treinamento incluído, integrações fora do escopo, condições especiais..."
              />
            </label>
          </section>
        </div>

        <aside className="h-fit rounded-xl border bg-surface p-5 lg:sticky lg:top-6">
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">
            Resumo da contratação
          </p>
          <h2 className="mt-2 text-xl font-semibold">{clientName || "Novo cliente"}</h2>
          <p className="text-sm text-muted-foreground">Proposta de {companyName}</p>
          <div className="mt-5 divide-y rounded-lg border">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Os itens escolhidos aparecerão aqui.
              </p>
            ) : (
              items.map((item) => (
                <div key={item.codigo} className="flex justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantidade > 1
                        ? `${item.quantidade} × ${formatCentsBRL(item.valor_unitario_cents)}`
                        : item.cobranca === "mensal"
                          ? "Mensal"
                          : "Pagamento único"}
                    </p>
                  </div>
                  <strong className="shrink-0 tabular-nums">
                    {formatCentsBRL(item.total_cents)}
                  </strong>
                </div>
              ))
            )}
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Ativação</span>
              <strong>{formatCentsBRL(oneTime)}</strong>
            </div>
            <div className="flex justify-between border-t pt-3 text-lg">
              <span>Total mensal</span>
              <strong className="text-accent">{formatCentsBRL(monthly)}</strong>
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar e visualizar"}
          </Button>
        </aside>
      </div>
    </main>
  );
}
