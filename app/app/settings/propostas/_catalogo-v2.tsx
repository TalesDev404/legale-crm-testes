"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL } from "@/lib/money";
import type { FaixaDePreco, ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";

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
    ativo: true,
    ordem,
  };
}

function pertence(item: ItemDoCatalogo, secao: Secao) {
  if (secao === "usuarios") return item.categoria === "usuario";
  if (secao === "migracoes") return item.categoria === "migracao";
  return item.categoria === "modulo" || item.categoria === "servico";
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
  const [saving, setSaving] = React.useState(false);

  const patch = (index: number, changes: Partial<ItemDoCatalogo>) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)),
    );

  const patchFaixa = (itemIndex: number, faixaIndex: number, changes: Partial<FaixaDePreco>) =>
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

  function addItem() {
    const nextOrder = Math.max(0, ...items.map((item) => item.ordem)) + 10;
    setItems((current) => [...current, novoItem(secao, nextOrder)]);
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

  async function save() {
    setSaving(true);
    try {
      const response = await apiClient.put<{ data: ItemDoCatalogo[] }>(
        "/api/v1/propostas/catalogo",
        { itens: items },
      );
      setItems(response.data);
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
      description:
        "Itens que podem compor o escopo. Serviços por volume podem usar faixas de preço.",
    },
    usuarios: {
      title: "Tipos de usuário",
      description:
        "Acessos por quantidade, com valores próprios para escritório e departamento jurídico.",
    },
    migracoes: {
      title: "Migrações",
      description: "Sistemas de origem e o valor único para migrar os dados do cliente.",
    },
  };

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Configurações</p>
          <h1 className="text-2xl font-semibold">Propostas comerciais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina o que o comercial pode oferecer e os valores sugeridos. Propostas já emitidas não
            são alteradas.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        ) : null}
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Áreas da configuração de propostas">
        {(["catalogo", "usuarios", "migracoes"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            variant={secao === key ? "default" : "outline"}
            onClick={() => setSecao(key)}
          >
            {key === "catalogo"
              ? "Módulos e serviços"
              : key === "usuarios"
                ? "Usuários"
                : "Migrações"}
          </Button>
        ))}
      </nav>

      <section className="rounded-xl border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 className="font-semibold">{titles[secao].title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{titles[secao].description}</p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={addItem}>
              Criar novo item
            </Button>
          ) : null}
        </div>
        <div className="divide-y">
          {visibleItems.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum item cadastrado nesta seção.
            </p>
          ) : (
            visibleItems.map(({ item, index }) => (
              <article key={item.id ?? `${item.codigo}-${index}`} className="p-5">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1.5fr_150px_150px_120px]">
                  <div>
                    <label className="text-xs font-medium">
                      Nome do item
                      <Input
                        className="mt-1"
                        value={item.nome}
                        disabled={!canEdit}
                        onChange={(event) => patch(index, { nome: event.target.value })}
                      />
                    </label>
                    <label className="mt-3 block text-xs font-medium">
                      Código interno
                      <Input
                        className="mt-1"
                        value={item.codigo}
                        disabled={!canEdit || Boolean(item.id)}
                        onChange={(event) =>
                          patch(index, {
                            codigo: event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "_")
                              .replace(/^_|_$/g, ""),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="text-xs font-medium">
                    Descrição na proposta
                    <Textarea
                      className="mt-1 min-h-24"
                      value={item.descricao}
                      disabled={!canEdit}
                      onChange={(event) => patch(index, { descricao: event.target.value })}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Escritório (R$)
                    <Input
                      className="mt-1 text-right"
                      value={fmt(item.preco_escritorio_cents)}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patch(index, { preco_escritorio_cents: reais(event.target.value) })
                      }
                    />
                    <span className="mt-1 block text-right text-muted-foreground">
                      {formatCentsBRL(item.preco_escritorio_cents)}
                    </span>
                  </label>
                  <label className="text-xs font-medium">
                    Departamento (R$)
                    <Input
                      className="mt-1 text-right"
                      value={fmt(item.preco_departamento_cents)}
                      disabled={!canEdit}
                      onChange={(event) =>
                        patch(index, { preco_departamento_cents: reais(event.target.value) })
                      }
                    />
                    <span className="mt-1 block text-right text-muted-foreground">
                      {formatCentsBRL(item.preco_departamento_cents)}
                    </span>
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.ativo}
                        disabled={!canEdit}
                        onChange={(event) => patch(index, { ativo: event.target.checked })}
                      />
                      Visível na proposta
                    </label>
                    {secao === "catalogo" ? (
                      <label className="block text-xs font-medium">
                        Tipo
                        <select
                          className="mt-1 h-10 w-full rounded-sm border bg-bg px-2"
                          value={item.categoria}
                          disabled={!canEdit}
                          onChange={(event) =>
                            patch(index, { categoria: event.target.value as "modulo" | "servico" })
                          }
                        >
                          <option value="modulo">Módulo</option>
                          <option value="servico">Serviço</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="block text-xs font-medium">
                      Unidade
                      <Input
                        className="mt-1"
                        value={item.unidade}
                        disabled={!canEdit}
                        onChange={(event) => patch(index, { unidade: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
                {secao !== "migracoes" ? (
                  <div className="mt-4 rounded-lg border bg-bg/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Tabela por quantidade</h3>
                        <p className="text-xs text-muted-foreground">
                          Opcional. A maior quantidade mínima aplicável define o valor unitário.
                        </p>
                      </div>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addFaixa(index)}
                        >
                          Adicionar faixa
                        </Button>
                      ) : null}
                    </div>
                    {item.faixas_preco.length ? (
                      <div className="mt-3 space-y-2">
                        {item.faixas_preco.map((faixa, faixaIndex) => (
                          <div
                            className="grid items-end gap-2 sm:grid-cols-[150px_1fr_1fr_auto]"
                            key={`${faixa.quantidade_minima}-${faixaIndex}`}
                          >
                            <label className="text-xs">
                              A partir de
                              <Input
                                className="mt-1"
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
                            <label className="text-xs">
                              Escritório (R$)
                              <Input
                                className="mt-1"
                                value={fmt(faixa.preco_escritorio_cents)}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  patchFaixa(index, faixaIndex, {
                                    preco_escritorio_cents: reais(event.target.value),
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              Departamento (R$)
                              <Input
                                className="mt-1"
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
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFaixa(index, faixaIndex)}
                              >
                                Remover
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Preço fixo por {item.unidade}; nenhuma faixa configurada.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
