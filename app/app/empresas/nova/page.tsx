import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { equipeDaOrganizacao } from "@/lib/empresas/equipe";

import { FormularioDaEmpresa } from "../_components/FormularioDaEmpresa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova empresa" };

export default async function NovaEmpresaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const equipe = await equipeDaOrganizacao(activeOrg.orgId);

  return (
    <main className="mx-auto w-full max-w-4xl" data-testid="tela-nova-empresa">
      <Link href="/app/empresas" className="text-sm text-muted-foreground hover:underline">
        ← Empresas
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">Nova empresa</h1>
      <FormularioDaEmpresa equipe={equipe.map((p) => ({ id: p.id, nome: p.nome }))} />
    </main>
  );
}
