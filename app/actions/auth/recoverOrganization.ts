"use server";

import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type RecoverOrganizationResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "rate_limited"
        | "invite_pending"
        | "somente_convite"
        | "provision_failed"
        | "access_revoked";
    };

/**
 * Mantido apenas como guarda para clientes antigos que ainda tenham este action
 * no bundle. O CRM Comercial Legale não cria organizações por autoatendimento.
 */
export async function recoverOrganization(name: string): Promise<RecoverOrganizationResult> {
  void name;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (activeOrg) redirect("/app");
  return { ok: false, error: "somente_convite" };
}
