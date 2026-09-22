import type { Metadata } from "next";

import { MarcaLegale } from "@/components/branding/MarcaLegale";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    default: "CRM Comercial Legale",
    template: "%s · CRM Comercial Legale",
  },
  description: "Ambiente interno da equipe Comercial Legale.",
};

/** Casca única das telas de acesso do CRM interno da Legale. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = (user?.user_metadata?.locale as string | undefined) ?? null;

  return (
    <IdiomaProvider locale={locale}>
      <main className="legale-public-theme grid min-h-screen bg-[#f7f5fb] lg:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
        <section className="relative hidden overflow-hidden bg-[#24113f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-[#8e24fe]/30 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-[#34eaca]/18 blur-3xl" />
          <MarcaLegale className="relative self-start rounded-xl bg-white px-5 py-3 shadow-lg" />

          <div className="relative max-w-lg pb-8">
            <p className="text-xs font-semibold tracking-[0.24em] text-[#cbb7ff] uppercase">
              Ambiente interno
            </p>
            <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight">
              CRM Comercial Legale
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Relacionamento, oportunidades e propostas comerciais em uma visão simples para o time
              Legale.
            </p>
            <div className="mt-8 flex flex-wrap gap-2 text-xs font-medium text-white/80">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                Propostas comerciais
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                Relacionamento
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                Visão do funil
              </span>
            </div>
          </div>

          <p className="relative text-xs text-white/50">Uso exclusivo da equipe Legale</p>
        </section>

        <section className="flex min-h-screen items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              <MarcaLegale />
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_24px_70px_rgba(44,25,73,0.10)] sm:p-8 dark:bg-surface">
              {children}
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Ambiente interno do Comercial Legale
            </p>
          </div>
        </section>
      </main>
    </IdiomaProvider>
  );
}
