import type { NavDestinationId } from "./catalogo";

/**
 * O CRM do Legale é um ambiente único, focado em comercial e Sucesso do
 * Cliente. As telas abaixo vêm do produto base (WhatsApp, agente de IA, loja,
 * anúncios, marca própria, cobrança) e ficam SEM PORTA: somem do menu, dos
 * hubs, da paleta ⌘K e da escolha da tela inicial.
 *
 * O código continua no repositório e as rotas continuam existindo; é aqui que
 * se devolve uma tela ao menu quando o Legale passar a usá-la. Isto é
 * apresentação, nunca autorização — a permissão de cada rota segue nas rotas.
 */
export const FORA_DO_LEGALE: readonly NavDestinationId[] = [
  // Atendimento por WhatsApp
  "/app/inbox",
  "/app/radar",
  "/app/templates",
  "/app/settings/atendimento",
  // Agente de IA
  "/app/ai/agents",
  "/app/ai/followups",
  "/app/ai/routers",
  "/app/ai/credentials",
  "/app/ai/providers",
  "/app/ai/knowledge/sources",
  "/app/ai/memory",
  "/app/ai/skills",
  "/app/ai/cases",
  "/app/ai/inbox",
  "/app/ai/proposals",
  "/app/ai/runs",
  "/app/ai/usage",
  "/app/ai/evolution",
  // Canais de mensagem, loja e anúncios
  "/app/connections",
  "/app/integrations/nuvemshop",
  "/app/products",
  "/app/ads/meta",
  "/app/settings/conversoes",
  "/app/settings/meta-ads",
  // Produto de prateleira: marca própria, cobrança e extensões
  "/app/settings/marca",
  "/app/settings/billing",
  "/app/extensions",
];

const FORA = new Set<string>(FORA_DO_LEGALE);

export function fazParteDoLegale(href: string): boolean {
  return !FORA.has(href);
}
