import type { NivelDeSaude } from "@/lib/schemas/empresas";

/**
 * Cor do selo de saúde, pelos tokens semânticos do produto (já ajustados para
 * o tema escuro em `app/globals.css`). O texto sempre acompanha a cor.
 */
export const CORES_DA_SAUDE: Record<NivelDeSaude, string> = {
  saudavel: "bg-success-bg text-success-fg",
  atencao: "bg-warning-bg text-warning-fg",
  em_risco: "bg-error-bg text-error-fg",
  churn: "bg-muted text-muted-foreground",
};
