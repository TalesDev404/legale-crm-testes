import type { Lead } from "@/lib/types/leads";

type ValorDoLead = Pick<
  Lead,
  "value_cents" | "currency" | "proposal_monthly_cents" | "proposal_activation_cents"
>;

/** A mensalidade vinculada prevalece no funil; o valor manual fica preservado. */
export function valorDoCard(lead: ValorDoLead) {
  if (lead.proposal_monthly_cents != null) {
    return {
      cents: lead.proposal_monthly_cents,
      oneTimeCents: lead.proposal_activation_cents ?? 0,
      currency: "BRL",
      fromProposals: true,
    } as const;
  }
  return {
    cents: lead.value_cents,
    oneTimeCents: null,
    currency: lead.currency,
    fromProposals: false,
  } as const;
}
