import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { catalogoComercialEfetivo, type ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";

import { NovaPropostaClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova proposta" };

export default async function NovaPropostaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
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
      "id,codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,ativo,ordem",
    )
    .eq("organization_id", activeOrg.orgId)
    .eq("ativo", true)
    .order("ordem");

  return (
    <NovaPropostaClient
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
      catalog={catalogoComercialEfetivo(catalog as ItemDoCatalogo[] | null)}
    />
  );
}
