"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL } from "@/lib/money";
import type { FaixaDePreco, ItemDoCatalogo, OpcaoDePreco } from "@/lib/schemas/proposta-catalogo";
import { CaretDown, Check, PencilSimple, Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Secao = "catalogo" | "usuarios" | "migracoes";

const reais = (value: string) =>
  Math.max(0, Math.round(Number(value.replaceAll(".", "").replace(",", ".")) * 100) || 0);
const fmt = (value: number) => (value / 100).toFixed(2).replace(".", ",");

function novoItem(secao: Secao, ordem: number): ItemDoCatalogo {
  const categoria =
    secao === "usuarios" ? "usuario" : secao === "migracoes" ? "migracao" : "modulo";
  return {
    codigo: `novo_item_${Date.now()}`,
    nome: secao === "migracoes" ? "Novo sistema de origem" : "Novo item",
    descricao: "",
    categoria,
    cobranca: secao === "migracoes" ? "unica" : "mensal",
    preco_escritorio_cents: 0,
    preco_departamento_cents: 0,
    setup_cents: 0,
    unidade: secao === "usuarios" ? "usuário" : secao === "migracoes" ? "migração" : "unidade",
    faixas_preco: [],
    opcoes_preco: [],
    minimo_opcoes: 0,
    ativo: true,
    ordem,
  };
}

function pertence(item: ItemDoCatalogo, secao: Secao) {
  if (secao === "usuarios") return item.categoria === "usuario";
  if (secao === "migracoes") return item.categoria === "migracao";
  return item.categoria === "modulo" || item.categoria === "servico";
}

function rotuloCategoria(item: ItemDoCatalogo) {
  if (item.categoria === "usuario") return "Usuário";
  if (item.categoria === "migracao") return "Migração";
  return item.categoria === "servico" ? "Serviço" : "Módulo";
}

function resumoDoPreco(item: ItemDoCatalogo) {
  if (item.preco_escritorio_cents === item.preco_departamento_cents) {
    return formatCentsBRL(item.preco_escritorio_cents);
  }
  return `Esc. ${formatCentsBRL(item.preco_escritorio_cents)} · Depto. ${formatCentsBRL(item.preco_departamento_cents)}`;
}

export function CatalogoPropostasClient({
  initial,
  canEdit,
}: {
  initial: ItemDoCatalogo[];
  canEdit: boolean;
}) {
  const [items, setItems] = React.useState(initial);
  const [secao, setSecao] = React.useState<Secao>("catalogo");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const patch = (index: number, changes: Partial<ItemDoCatalogo>) => {
    setDirty(true);
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)),
    );
  };

  const patchFaixa = (itemIndex: number, faixaIndex: number, changes: Partial<FaixaDePreco>) => {
    setDirty(true);
    setItems((current) =>
      current.map((item, index) =>
        index !== itemIndex
          ? item
          : {
              ...item,
              faixas_preco: item.faixas_preco.map((faixa, indexFaixa) =>
                indexFaixa === faixaIndex ? { ...faixa, ...changes } : faixa,
              ),
            },
      ),
    );
  };

  const patchOpcao = (itemIndex: number, opcaoIndex: number, changes: Partial<OpcaoDePreco>) => {
    setDirty(true);
    setItems((current) =>
      current.map((item, index) =>
        index !== itemIndex
          ? item
          : {
              ...item,
              opcoes_preco: item.opcoes_preco.map((opcao, indexOpcao) =>
                indexOpcao === opcaoIndex ? { ...opcao, ...changes } : opcao,
              ),
            },
      ),
    );
  };

  function toggleEditor(codigo: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  function addItem() {
    const nextOrder = Math.max(0, ...items.map((item) => item.ordem)) + 10;
    const item = novoItem(secao, nextOrder);
    setItems((current) => [...current, item]);
    setExpanded((current) => new Set(current).add(item.codigo));
    setDirty(true);
  }

  function addFaixa(itemIndex: number) {
    const item = items[itemIndex];
    if (!item) return;
    const last = item.faixas_preco.at(-1);
    patch(itemIndex, {
      faixas_preco: [
        ...item.faixas_preco,
        {
          quantidade_minima: last ? last.quantidade_minima + 1 : 1,
          preco_escritorio_cents: item.preco_escritorio_cents,
          preco_departamento_cents: item.preco_departamento_cents,
        },
      ],
    });
  }

  function removeFaixa(itemIndex: number, faixaIndex: number) {
    const item = items[itemIndex];
    if (!item) return;
    patch(itemIndex, {
      faixas_preco: item.faixas_preco.filter((_, index) => index !== faixaIndex),
    });
  }

  function addOpcao(itemIndex: number) {
    const catalogItem = items[itemIndex];
    if (!catalogItem) return;
    const codigos = new Set(catalogItem.opcoes_preco.map((opcao) => opcao.codigo));
    let numero = catalogItem.opcoes_preco.length + 1;
    while (codigos.has(`contexto_${numero}`)) numero += 1;
    patch(itemIndex, {
      opcoes_preco: [
        ...catalogItem.opcoes_preco,
        {
          codigo: `contexto_${numero}`,
          nome: `Novo contexto ${numero}`,
          descricao: "",
          preco_escritorio_cents: 0,
          preco_departamento_cents: 0,
        },
      ],
    });
  }

  function removeOpcao(itemIndex: number, opcaoIndex: number) {
    const catalogItem = items[itemIndex];
    if (!catalogItem) return;
    const opcoes = catalogItem.opcoes_preco.filter((_, index) => index !== opcaoIndex);
    patch(itemIndex, {
      opcoes_preco: opcoes,
      minimo_opcoes: Math.min(catalogItem.minimo_opcoes, opcoes.length),
    });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await apiClient.put<{ data: ItemDoCatalogo[] }>(
        "/api/v1/propostas/catalogo",
        { itens: items },
      );
      setItems(response.data);
      setDirty(false);
      toast.success("Configuração de propostas salva.");
    } catch {
      toast.error("Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  const visibleItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => pertence(item, secao));
  const titles: Record<Secao, { title: string; description: string }> = {
    catalogo: {
      title: "Módulos e serviços",
      description: "Organize o escopo, os preços e as regras de cobrança da proposta.",
    },
    usuarios: {
      title: "Tipos de usuário",
      description: "Defina os acessos e os valores para cada perfil de cliente.",
    },
    migracoes: {
      title: "Migrações",
      description: "Cadastre os sistemas de origem e o valor para migrar os dados.",
    },
  };
  const sections: Array<{ key: Secao; label: string }> = [
    { key: "catalogo", label: "Módulos e serviços" },
    { key: "usuarios", label: "Usuários" },
    { key: "migracoes", label: "Migrações" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6">
      <header className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-medium text-accent">Configurações</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Propostas comerciais</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Defina o que o comercial pode oferecer e os valores sugeridos. Propostas já emitidas não
            são alteradas.
          </p>
        </div>
        {canEdit ? (
          <Button
            className="sm:justify-self-end"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            {saving ? (
              "Salvando…"
            ) : dirty ? (
              "Salvar alterações"
            ) : (
              <>
                <Check size={16} aria-hidden /> Tudo salvo
              </>
            )}
          </Button>
        ) : null}
      </header>

      <nav
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-surface-elevated/60 p-1 shadow-xs"
        aria-label="Áreas da configuração de propostas"
      >
        {sections.map(({ key, label }) => {
          const total = items.filter((item) => pertence(item, key)).length;
          return (
            <button
              key={key}
              type="button"
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-all",
                secao === key
                  ? "bg-surface text-text shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-surface/70 hover:text-text",
              )}
              aria-current={secao === key ? "page" : undefined}
              onClick={() => {
                setSecao(key);
                setExpanded(new Set());
              }}
            >
              {label}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                {total}
              </span>
            </button>
          );
        })}
      </nav>

      <section aria-labelledby="catalogo-titulo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-surface px-5 py-4 shadow-xs">
          <div>
            <h2 id="catalogo-titulo" className="font-semibold">
              {titles[secao].title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{titles[secao].description}</p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus size={16} aria-hidden /> Novo item
            </Button>
          ) : null}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-surface px-6 py-14 text-center">
            <p className="font-medium">Nenhum item cadastrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie o primeiro item para que ele possa ser usado em novas propostas.
            </p>
            {canEdit ? (
              <Button className="mt-5" type="button" onClick={addItem}>
                <Plus size={16} aria-hidden /> Criar primeiro item
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleItems.map(({ item, index }) => {
              const isOpen = expanded.has(item.codigo);
              return (
                <article
                  key={item.id ?? `${item.codigo}-${index}`}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-surface shadow-xs transition-[border-color,box-shadow]",
                    isOpen && "border-accent/35 shadow-md",
                  )}
                >
                  <div className="grid items-center gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{item.nome}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {rotuloCategoria(item)}
                        </span>
                        {item.faixas_preco.length > 0 ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                            {item.faixas_preco.length}{" "}
                            {item.faixas_preco.length === 1 ? "faixa" : "faixas"}
                          </span>
                        ) : null}
                        {item.opcoes_preco.length > 0 ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                            {item.opcoes_preco.length}{" "}
                            {item.opcoes_preco.length === 1 ? "opção" : "opções"}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {item.descricao || "Sem descrição para a proposta."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 md:justify-end">
                      <div className="text-left md:text-right">
                        <p className="text-[11px] font-medium tracking-wide text-text-subtle uppercase">
                          {item.cobranca === "mensal" ? "Valor mensal" : "Valor único"}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">
                          {resumoDoPreco(item)}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Switch
                          checked={item.ativo}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => patch(index, { ativo: checked })}
                          aria-label={`${item.nome}: visível na proposta`}
                        />
                        {item.ativo ? "Visível" : "Oculto"}
                      </label>
                    </div>

                    <Button
                      type="button"
                      variant={isOpen ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => toggleEditor(item.codigo)}
                      aria-expanded={isOpen}
                    >
                      <PencilSimple size={15} aria-hidden />
                      {isOpen ? "Fechar" : "Editar"}
                      <CaretDown
                        size={14}
                        aria-hidden
                        className={cn("transition-transform", isOpen && "rotate-180")}
                      />
                    </Button>
                  </div>

                  {isOpen ? (
                    <div className="border-t bg-bg/45 p-5">
                      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
                        <div className="space-y-4">
                          <label className="block text-sm font-medium">
                            Nome do item
                            <Input
                              className="mt-1.5"
                              value={item.nome}
                              disabled={!canEdit}
                              onChange={(event) => patch(index, { nome: event.target.value })}
                            />
                          </label>
                          <label className="block text-sm font-medium">
                            Descrição exibida na proposta
                            <Textarea
                              className="mt-1.5 min-h-24 resize-y"
                              value={item.descricao}
                              disabled={!canEdit}
                              onChange={(event) => patch(index, { descricao: event.target.value })}
                              placeholder="Explique em uma frase o que o cliente está contratando."
                            />
                          </label>
                          <p className="text-xs text-text-subtle">
                            Código interno: <code>{item.codigo}</code>
                          </p>
                        </div>

                        <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
                          {secao === "catalogo" ? (
                            <label className="block text-sm font-medium">
                              Tipo do item
                              <select
                                className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-hidden transition-colors hover:border-border-strong focus:border-accent-500 focus:ring-2 focus:ring-accent-soft"
                                value={item.categoria}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  patch(index, {
                                    categoria: event.target.value as "modulo" | "servico",
                                  })
                                }
                              >
                                <option value="modulo">Módulo</option>
                                <option value="servico">Serviço</option>
                              </select>
                            </label>
                          ) : null}
                          <label className="block text-sm font-medium">
                            Forma de cobrança
                            <select
                              className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-hidden transition-colors hover:border-border-strong focus:border-accent-500 focus:ring-2 focus:ring-accent-soft"
                              value={item.cobranca}
                              disabled={!canEdit || secao === "migracoes"}
                              onChange={(event) =>
                                patch(index, { cobranca: event.target.value as "mensal" | "unica" })
                              }
                            >
                              <option value="mensal">Mensal</option>
                              <option value="unica">Pagamento único</option>
                            </select>
                          </label>
                          <label className="block text-sm font-medium">
                            Unidade de cobrança
                            <Input
                              className="mt-1.5"
                              value={item.unidade}
                              disabled={!canEdit}
                              onChange={(event) => patch(index, { unidade: event.target.value })}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="mt-5 rounded-xl border bg-surface p-4">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold">Valores do item</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Use valores diferentes quando a política comercial variar por cliente.
                          </p>
                        </div>
                        <div
                          className={cn(
                            "grid gap-4",
                            secao === "catalogo" ? "sm:grid-cols-3" : "sm:grid-cols-2",
                          )}
                        >
                          <label className="block text-sm font-medium">
                            Escritório de advocacia
                            <Input
                              className="mt-1.5 tabular-nums"
                              inputMode="decimal"
                              value={fmt(item.preco_escritorio_cents)}
                              disabled={!canEdit}
                              onChange={(event) =>
                                patch(index, { preco_escritorio_cents: reais(event.target.value) })
                              }
                            />
                          </label>
                          <label className="block text-sm font-medium">
                            Departamento jurídico
                            <Input
                              className="mt-1.5 tabular-nums"
                              inputMode="decimal"
                              value={fmt(item.preco_departamento_cents)}
                              disabled={!canEdit}
                              onChange={(event) =>
                                patch(index, {
                                  preco_departamento_cents: reais(event.target.value),
                                })
                              }
                            />
                          </label>
                          {secao === "catalogo" ? (
                            <label className="block text-sm font-medium">
                              Ativação
                              <Input
                                className="mt-1.5 tabular-nums"
                                inputMode="decimal"
                                value={fmt(item.setup_cents)}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  patch(index, { setup_cents: reais(event.target.value) })
                                }
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>

                      {secao !== "migracoes" ? (
                        <div className="mt-5 rounded-xl border bg-surface p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold">Preço por quantidade</h4>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Opcional. A maior quantidade mínima aplicável define o valor
                                unitário.
                              </p>
                            </div>
                            {canEdit ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => addFaixa(index)}
                              >
                                <Plus size={14} aria-hidden /> Adicionar faixa
                              </Button>
                            ) : null}
                          </div>
                          {item.faixas_preco.length ? (
                            <div className="mt-4 space-y-3">
                              {item.faixas_preco.map((faixa, faixaIndex) => (
                                <div
                                  className="grid items-end gap-3 rounded-lg bg-muted/60 p-3 sm:grid-cols-[140px_1fr_1fr_auto]"
                                  key={`${faixa.quantidade_minima}-${faixaIndex}`}
                                >
                                  <label className="text-xs font-medium">
                                    A partir de
                                    <Input
                                      className="mt-1 bg-surface"
                                      type="number"
                                      min="1"
                                      value={faixa.quantidade_minima}
                                      disabled={!canEdit}
                                      onChange={(event) =>
                                        patchFaixa(index, faixaIndex, {
                                          quantidade_minima: Number(event.target.value) || 1,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="text-xs font-medium">
                                    Escritório (R$)
                                    <Input
                                      className="mt-1 bg-surface"
                                      inputMode="decimal"
                                      value={fmt(faixa.preco_escritorio_cents)}
                                      disabled={!canEdit}
                                      onChange={(event) =>
                                        patchFaixa(index, faixaIndex, {
                                          preco_escritorio_cents: reais(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="text-xs font-medium">
                                    Departamento (R$)
                                    <Input
                                      className="mt-1 bg-surface"
                                      inputMode="decimal"
                                      value={fmt(faixa.preco_departamento_cents)}
                                      disabled={!canEdit}
                                      onChange={(event) =>
                                        patchFaixa(index, faixaIndex, {
                                          preco_departamento_cents: reais(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  {canEdit ? (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Remover faixa ${faixaIndex + 1}`}
                                      onClick={() => removeFaixa(index, faixaIndex)}
                                    >
                                      <Trash size={15} aria-hidden />
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                              Preço fixo por {item.unidade}. Adicione faixas somente quando o valor
                              unitário mudar conforme a quantidade.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {secao === "catalogo" ? (
                        <div className="mt-5 rounded-xl border bg-surface p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold">
                                Tabela por opção ou contexto
                              </h4>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Use quando cada contexto contratado tiver nome e preço próprios,
                                como na API Legale.
                              </p>
                            </div>
                            {canEdit ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => addOpcao(index)}
                              >
                                <Plus size={14} aria-hidden /> Adicionar contexto
                              </Button>
                            ) : null}
                          </div>
                          {item.opcoes_preco.length ? (
                            <>
                              <label className="mt-4 block max-w-52 text-xs font-medium">
                                Mínimo de opções na proposta
                                <Input
                                  className="mt-1 bg-surface"
                                  type="number"
                                  min="0"
                                  max={item.opcoes_preco.length}
                                  value={item.minimo_opcoes}
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    patch(index, {
                                      minimo_opcoes: Math.max(
                                        0,
                                        Math.min(
                                          item.opcoes_preco.length,
                                          Number(event.target.value) || 0,
                                        ),
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <div className="mt-4 space-y-3">
                                {item.opcoes_preco.map((opcao, opcaoIndex) => (
                                  <div
                                    className="grid items-end gap-3 rounded-lg bg-muted/60 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                                    key={`${opcao.codigo}-${opcaoIndex}`}
                                  >
                                    <label className="text-xs font-medium">
                                      Nome do contexto
                                      <Input
                                        className="mt-1 bg-surface"
                                        value={opcao.nome}
                                        disabled={!canEdit}
                                        onChange={(event) =>
                                          patchOpcao(index, opcaoIndex, {
                                            nome: event.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="text-xs font-medium">
                                      Escritório (R$)
                                      <Input
                                        className="mt-1 bg-surface"
                                        inputMode="decimal"
                                        value={fmt(opcao.preco_escritorio_cents)}
                                        disabled={!canEdit}
                                        onChange={(event) =>
                                          patchOpcao(index, opcaoIndex, {
                                            preco_escritorio_cents: reais(event.target.value),
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="text-xs font-medium">
                                      Departamento (R$)
                                      <Input
                                        className="mt-1 bg-surface"
                                        inputMode="decimal"
                                        value={fmt(opcao.preco_departamento_cents)}
                                        disabled={!canEdit}
                                        onChange={(event) =>
                                          patchOpcao(index, opcaoIndex, {
                                            preco_departamento_cents: reais(event.target.value),
                                          })
                                        }
                                      />
                                    </label>
                                    {canEdit ? (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Remover contexto ${opcaoIndex + 1}`}
                                        onClick={() => removeOpcao(index, opcaoIndex)}
                                      >
                                        <Trash size={15} aria-hidden />
                                      </Button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                              <p className="mt-3 text-xs text-text-subtle">
                                Os códigos internos são criados automaticamente e ficam estáveis
                                para propostas já emitidas.
                              </p>
                            </>
                          ) : (
                            <div className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                              Sem opções. O item usa apenas o valor fixo ou as faixas por
                              quantidade.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
