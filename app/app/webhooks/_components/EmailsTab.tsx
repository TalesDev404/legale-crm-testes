"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Connection {
  id: string;
  account_email: string;
  account_name: string | null;
  send_as_email: string | null;
  status: "connected" | "reauthorize";
}

interface Draft {
  id: string;
  lead_id: string | null;
  proposal_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  source: "ai" | "template";
  status: "pending" | "sending" | "submitted" | "rejected" | "needs_review";
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

async function readData<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar os dados.");
  return ((await response.json()) as { data: T }).data;
}

async function post(path: string, body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(result?.error?.message ?? "Não foi possível concluir a ação.");
  }
}

function DraftReview({ draft, connections, onDone }: { draft: Draft; connections: Connection[]; onDone: () => void }) {
  const [subject, setSubject] = React.useState(draft.subject);
  const [body, setBody] = React.useState(draft.body_text);
  const [connectionId, setConnectionId] = React.useState(connections.find((c) => c.status === "connected")?.id ?? "");
  const [busy, setBusy] = React.useState(false);

  async function run(path: string, payload?: unknown) {
    setBusy(true);
    try {
      await post(path, payload);
      toast.success(path.endsWith("/send") ? "E-mail encaminhado pelo Outlook." : "Rascunho descartado.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        Para: <strong className="text-text">{draft.to_email}</strong> · {draft.source === "ai" ? "Sugestão da IA" : "Texto do modelo"}
      </p>
      {draft.lead_id || draft.proposal_id ? <div className="flex gap-4 text-xs">
        {draft.lead_id ? <a className="text-primary underline" href={`/app/leads/${draft.lead_id}`} target="_blank" rel="noopener noreferrer">Ver card do cliente</a> : null}
        {draft.proposal_id ? <a className="text-primary underline" href={`/app/propostas/${draft.proposal_id}`} target="_blank" rel="noopener noreferrer">Ver proposta usada como contexto</a> : null}
      </div> : null}
      {draft.last_error ? <p className="text-xs text-amber-700">{draft.last_error}</p> : null}
      <div className="space-y-1">
        <Label htmlFor={`subject-${draft.id}`}>Assunto</Label>
        <Input id={`subject-${draft.id}`} value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`body-${draft.id}`}>Texto</Label>
        <Textarea id={`body-${draft.id}`} value={body} rows={9} maxLength={6000} onChange={(event) => setBody(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`account-${draft.id}`}>Enviar pela conta</Label>
        <select
          id={`account-${draft.id}`}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
        >
          <option value="">Selecione uma conta conectada</option>
          {connections.filter((c) => c.status === "connected").map((c) => (
            <option key={c.id} value={c.id}>{c.send_as_email || c.account_email}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !connectionId || !subject.trim() || !body.trim()} onClick={() => run(`/api/v1/email-drafts/${draft.id}/send`, { subject, body_text: body, connection_id: connectionId })}>
          {busy ? "Processando…" : "Aprovar e enviar"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => run(`/api/v1/email-drafts/${draft.id}/reject`)}>Descartar</Button>
      </div>
      <p className="text-xs text-muted-foreground">O envio só acontece depois de clicar em “Aprovar e enviar”. O Outlook confirma a aceitação, não a entrega na caixa do destinatário.</p>
    </div>
  );
}

export function EmailsTab() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const connectionError = params.get("error");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sharedAddress, setSharedAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { data: connectionData, isError: connectionsError } = useQuery({
    queryKey: ["commercial_email_connections"],
    queryFn: () => readData<{ configured: boolean; connections: Connection[] }>("/api/v1/email-connections"),
  });
  const { data: drafts, isLoading, isError } = useQuery({
    queryKey: ["commercial_email_drafts"],
    queryFn: () => readData<Draft[]>("/api/v1/email-drafts"),
    refetchInterval: 15_000,
  });
  const connections = connectionData?.connections ?? [];
  const pending = (drafts ?? []).filter((draft) => draft.status === "pending");
  const requiresCheck = (drafts ?? []).filter((draft) => draft.status === "needs_review" || draft.status === "sending");
  const history = (drafts ?? []).filter((draft) => draft.status === "submitted" || draft.status === "rejected");
  const selected = pending.find((draft) => draft.id === selectedId);

  async function disconnect(id: string) {
    if (!window.confirm("Desconectar esta conta Outlook? Os rascunhos continuam salvos, mas não poderão ser enviados por ela.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/email-connections/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível desconectar.");
      await queryClient.invalidateQueries({ queryKey: ["commercial_email_connections"] });
      toast.success("Conta desconectada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen(draft: Draft) {
    if (!window.confirm("Você conferiu a pasta Enviados do Outlook e confirmou que este e-mail NÃO foi enviado? Reabrir pode causar envio em duplicidade se ele já saiu.")) return;
    setBusy(true);
    try {
      await post(`/api/v1/email-drafts/${draft.id}/reopen`, { confirmed_not_sent: true });
      await queryClient.invalidateQueries({ queryKey: ["commercial_email_drafts"] });
      toast.success("E-mail reaberto para revisão.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reabrir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Conexão Outlook</h2>
        <p className="mt-1 text-sm text-muted-foreground">Conecte uma conta Microsoft 365 para enviar os e-mails aprovados. A automação só prepara rascunhos.</p>
        {params.get("connected") === "1" ? <p className="mt-2 text-sm text-emerald-700">Conta conectada ao Outlook.</p> : null}
        {connectionError ? <p role="alert" className="mt-2 text-sm text-destructive">A conexão não foi concluída ({connectionError}). Confira as permissões da conta e tente novamente.</p> : null}
        {connectionsError ? <p role="alert" className="mt-2 text-sm text-destructive">Não foi possível carregar as conexões.</p> : null}
        {connectionData && !connectionData.configured ? (
          <p className="mt-3 text-sm text-amber-700">A aplicação Microsoft ainda não está configurada neste ambiente. Cadastre o ID e o segredo do aplicativo no Vercel para habilitar a conexão.</p>
        ) : null}
        {connections.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {connections.map((connection) => (
              <li key={connection.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{connection.send_as_email || connection.account_email} <span className="text-muted-foreground">({connection.status === "connected" ? "conectada" : "reconectar"})</span></span>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => disconnect(connection.id)}>Desconectar</Button>
              </li>
            ))}
          </ul>
        ) : null}
        {connectionData?.configured ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <a className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" href="/api/v1/integrations/outlook/connect">Conectar minha conta</a>
            <div className="space-y-1">
              <Label htmlFor="shared-email">Caixa compartilhada (opcional)</Label>
              <Input id="shared-email" type="email" value={sharedAddress} onChange={(event) => setSharedAddress(event.target.value)} placeholder="comercial@empresa.com.br" className="w-64" />
            </div>
            <a className={`inline-flex h-9 items-center rounded-md border border-border px-3 text-sm ${sharedAddress ? "" : "pointer-events-none opacity-50"}`} href={sharedAddress ? `/api/v1/integrations/outlook/connect?from=${encodeURIComponent(sharedAddress)}` : "#"}>Conectar caixa compartilhada</a>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">Para uma caixa compartilhada, a conta Microsoft que autoriza precisa ter permissão de envio concedida no Exchange.</p>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-base font-semibold">Aguardando aprovação ({pending.length})</h2><p className="text-sm text-muted-foreground">Revise o assunto e o texto antes de enviar.</p></div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando e-mails…</p> : null}
        {isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os rascunhos.</p> : null}
        {!isLoading && !isError && pending.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">Nenhum e-mail aguardando aprovação.</p> : null}
        {pending.map((draft) => (
          <article key={draft.id} className="rounded-lg border border-border bg-surface p-4">
            <button type="button" className="w-full text-left" onClick={() => setSelectedId(selectedId === draft.id ? null : draft.id)}>
              <span className="block font-medium">{draft.subject}</span>
              <span className="text-xs text-muted-foreground">Para {draft.to_email} · {draft.source === "ai" ? "sugestão da IA" : "modelo"}</span>
            </button>
            {selected?.id === draft.id ? <DraftReview draft={draft} connections={connections} onDone={() => { setSelectedId(null); void queryClient.invalidateQueries({ queryKey: ["commercial_email_drafts"] }); }} /> : null}
          </article>
        ))}
      </section>

      {requiresCheck.length > 0 ? (
        <section className="space-y-2"><h2 className="text-base font-semibold">Precisam de conferência ({requiresCheck.length})</h2>
          {requiresCheck.map((draft) => <div key={draft.id} className="rounded-lg border border-amber-300 p-4 text-sm"><p className="font-medium">{draft.subject}</p><p className="text-muted-foreground">{draft.last_error || "Envio em processamento. Confira a pasta Enviados antes de qualquer nova tentativa."}</p><Button type="button" variant="secondary" size="sm" className="mt-2" disabled={busy} onClick={() => reopen(draft)}>Conferi Enviados: reabrir</Button></div>)}
        </section>
      ) : null}
      {history.length > 0 ? <section className="space-y-2"><h2 className="text-base font-semibold">Histórico recente</h2>{history.slice(0, 15).map((draft) => <p key={draft.id} className="text-sm text-muted-foreground">{draft.status === "submitted" ? "Encaminhado" : "Descartado"} · {draft.subject} · {draft.to_email}</p>)}</section> : null}
    </div>
  );
}
