import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { catalogoComercialEfetivo, type ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";

import { NovaPropostaClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova proposta" };

export default async function NovaPropostaPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const [{ data: leads }, { lead: leadParam }] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("id, title, contact_id")
      .eq("organization_id", activeOrg.orgId)
      .order("updated_at", { ascending: false })
      .limit(300),
    searchParams,
  ]);
  const leadOptions = [...(leads ?? [])];
  if (leadParam && !leadOptions.some((lead) => lead.id === leadParam)) {
    const { data: selectedLead } = await supabase
      .from("crm_leads")
      .select("id, title, contact_id")
      .eq("organization_id", activeOrg.orgId)
      .eq("id", leadParam)
      .maybeSingle();
    if (selectedLead) leadOptions.unshift(selectedLead);
  }
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, display_name, name, email")
    .eq("organization_id", activeOrg.orgId)
    .is("is_merged_into", null)
    .order("updated_at", { ascending: false })
    .limit(300);

  const { data: organization } = await supabase
    .from("organizations")
    .select("name, display_name, legal_name")
    .eq("id", activeOrg.orgId)
    .single();

  const { data: catalog } = await supabase
    .from("proposal_catalog_items")
    .select(
      "id,codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,opcoes_preco,minimo_opcoes,ativo,ordem",
    )
    .eq("organization_id", activeOrg.orgId)
    .order("ordem");

  const catalogoAtivo = catalogoComercialEfetivo(catalog as ItemDoCatalogo[] | null).filter(
    (item) => item.ativo,
  );

  return (
    <NovaPropostaClient
      leads={leadOptions as Array<{ id: string; title: string; contact_id: string | null }>}
      initialLeadId={leadOptions.some((lead) => lead.id === leadParam) ? leadParam : undefined}
      contacts={
        (contacts ?? []) as Array<{
          id: string;
          display_name: string | null;
          name: string | null;
          email: string | null;
        }>
      }
      companyName={
        organization?.display_name ??
        organization?.name ??
        organization?.legal_name ??
        "Nossa empresa"
      }
      catalog={catalogoAtivo}
    />
  );
}
