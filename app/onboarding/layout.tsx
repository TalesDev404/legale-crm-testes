import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth/server";

/**
 * Legale: ambiente único, já configurado pelo
 * `scripts/legale-configurar-organizacao.ts`. O assistente de primeira
 * instalação do produto base (WhatsApp, agente de IA, quadro de nicho) não se
 * aplica — qualquer caminho que ainda aponte para `/onboarding` cai direto na
 * plataforma. As telas do assistente continuam no repositório, sem porta.
 */
export default async function OnboardingLayout(_props: { children: React.ReactNode }) {
  await requireAuth();
  redirect("/app");
}
