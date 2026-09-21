import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { catalogoComercialEfetivo, type ItemDoCatalogo } from "@/lib/schemas/proposta-catalogo";
import { CatalogoPropostasClient } from "./_catalogo-v3";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catálogo comercial" };
export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const db = await createClient();
  const { data } = await db
    .from("proposal_catalog_items")
    .select(
      "id,codigo,nome,descricao,categoria,cobranca,preco_escritorio_cents,preco_departamento_cents,setup_cents,unidade,faixas_preco,ativo,ordem",
    )
    .eq("organization_id", org.orgId)
    .order("ordem");
  return (
    <CatalogoPropostasClient
      initial={catalogoComercialEfetivo(data as ItemDoCatalogo[] | null)}
      canEdit={org.role === "admin"}
    />
  );
}
