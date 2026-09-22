import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth/signOut";
import { MarcaLegale } from "@/components/branding/MarcaLegale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acesso pendente · CRM Comercial Legale" };

/**
 * Usuários sem vínculo não criam outra organização. O CRM é exclusivo da Legale
 * e o acesso nasce sempre de um convite da administração.
 */
export default async function GetStartedPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (activeOrg) redirect("/app/inbox");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5fb] p-6">
      <Card className="w-full max-w-md space-y-6 rounded-2xl p-8 text-center shadow-lg">
        <MarcaLegale className="justify-center" />
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
            CRM Comercial Legale
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Acesso ainda não vinculado</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Sua conta existe, mas ainda não está vinculada ao CRM da Legale. Solicite ao
            administrador da equipe que envie ou renove o seu convite.
          </p>
        </div>
        <div className="rounded-xl border border-accent/15 bg-accent-soft/55 px-4 py-3 text-sm text-muted-foreground">
          Se você já recebeu o convite, abra o link enviado para o seu e-mail.
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </Card>
    </main>
  );
}
