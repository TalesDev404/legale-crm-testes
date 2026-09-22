import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";
import { Button } from "@/components/ui/button";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { createClient } from "@/lib/supabase/server";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";

export const metadata = { title: "Criar conta" };

/**
 * Aceita `?invite=<token>`: é o caminho de quem foi convidado e ainda não tem
 * conta. Sem isso, essa pessoa criava uma conta comum, e o provisionamento —
 * sem encontrar vínculo nenhum — abria uma organização e a tornava admin dela.
 *
 * O token só é lido aqui para MONTAR a tela (esconder o nome da empresa, travar
 * o e-mail). Quem decide o que ele vale é o servidor, duas vezes: ao criar a
 * conta e ao confirmar o e-mail.
 *
 * ── A recusa por política (migration 0233) ──────────────────────────────────
 *
 * Quando a instalação está em `so_convite`, esta tela RECUSA em vez de mostrar
 * o formulário — mas só nesse modo, e só sem convite válido. Ela é a SUPERFÍCIE
 * da recusa, nunca a autoridade: `signUp()` e `/auth/confirm` recusam por conta
 * própria, porque esta tela é adulterável e a server action é chamável direto.
 *
 * Por que uma tela e não um 403 do proxy: um 403 cru não tem marca, não tem
 * idioma e não tem saída — é o `return` mudo que o invariante 6(c) do Sistema
 * Vivo proíbe, e é péssima primeira impressão de um produto que se vende pela
 * instalação. Medido: a regra de nginx que fazia isso numa instalação real
 * barrou junto o `/signup?invite=…`, porque proxy não sabe o que é um convite.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const payload = invite ? verifyInviteToken(invite) : null;
  const convite = invite && payload ? { token: invite, email: payload.email } : undefined;
  const conviteExpirado = Boolean(invite) && !payload;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = await idiomaDoVisitante(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  // O CRM Comercial Legale é uma única plataforma interna. Conta nova só nasce
  // para aceitar um convite emitido pela administração da equipe.
  if (!convite) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Acesso exclusivo por convite</h1>
          <p className="text-sm text-muted-foreground">
            {conviteExpirado
              ? "Este convite expirou ou não é mais válido. Peça um novo ao administrador do CRM."
              : "O CRM Comercial Legale não possui cadastro aberto. Os acessos são criados pela administração da equipe."}
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">{t("Entrar")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          Comercial Legale
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Ativar meu acesso</h1>
        <p className="text-sm text-muted-foreground">
          Crie sua senha para entrar no CRM da Legale.
        </p>
      </div>

      <SignupForm convite={convite} />

      <p className="text-center text-sm text-muted-foreground">
        {t("Já tem conta?")}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {t("Entrar")}
        </Link>
      </p>
    </div>
  );
}
