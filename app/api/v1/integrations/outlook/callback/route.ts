import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import {
  OUTLOOK_BIND_COOKIE,
  OUTLOOK_CALLBACK_PATH,
  outlookConfig,
  perfilDaConta,
  trocarCodigo,
  verificarVinculo,
} from "@/lib/email/outlook/oauth";
import { env } from "@/lib/env";
import { supportCallbackWriteAllowed } from "@/lib/impersonate/support";
import { verifyState } from "@/lib/nuvemshop/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

/** Uma página nossa inicia a navegação final, para o cookie Strict voltar a viajar. */
function voltar(result: string): NextResponse {
  const destination = new URL(`/app/webhooks?tab=emails&${result}`, env.NEXT_PUBLIC_APP_URL).toString();
  const response = new NextResponse(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body>` +
      `<p>Voltando para os e-mails…</p><script>location.replace(${JSON.stringify(destination)})</script>` +
      `<noscript><a href="${destination.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Continuar</a></noscript>` +
      `</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
  response.cookies.set(OUTLOOK_BIND_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: OUTLOOK_CALLBACK_PATH,
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (new URL(req.url).searchParams.has("error")) return voltar("error=consent_cancelled");
  if (!outlookConfig() || env.INTERNAL_SECRET.length < 16) return voltar("error=not_configured");
  const url = new URL(req.url);
  const state = verifyState(url.searchParams.get("state"));
  if (!state?.userId || !state.authSessionId) return voltar("error=invalid_state");
  const bind = verificarVinculo(
    req.cookies.get(OUTLOOK_BIND_COOKIE)?.value,
    state.nonce,
    env.INTERNAL_SECRET,
  );
  if (!bind) return voltar("error=invalid_state");
  const code = url.searchParams.get("code");
  if (!code) return voltar("error=missing_code");
  if (!(await supportCallbackWriteAllowed(state.orgId, state.userId, state.authSessionId))) {
    return voltar("error=invalid_state");
  }

  const admin = createAdminClient();
  const { error: nonceError } = await admin.from("commercial_email_oauth_nonces").insert({
    nonce: state.nonce,
    organization_id: state.orgId,
    user_id: state.userId,
    expires_at: new Date(state.expMs).toISOString(),
  });
  if (nonceError) return voltar("error=invalid_state");

  try {
    const tokens = await trocarCodigo(code, bind.verifier);
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
    const required = bind.sendAsEmail ? "Mail.Send.Shared" : "Mail.Send";
    if (!scopes.some((scope) => scope.toLowerCase() === required.toLowerCase())) {
      return voltar("error=permission_missing");
    }
    if (!tokens.refresh_token) return voltar("error=refresh_token_missing");
    const profile = await perfilDaConta(tokens.access_token);
    const encrypted = await encryptWebhookSecret(admin, tokens.refresh_token);
    if (!encrypted) return voltar("error=encryption_unavailable");

    const { error } = await admin.from("commercial_email_connections").upsert(
      {
        organization_id: state.orgId,
        connected_by_user_id: state.userId,
        account_id: profile.id,
        identity_key: `${profile.id}:${(bind.sendAsEmail ?? "").toLowerCase()}`,
        account_email: profile.mail || profile.userPrincipalName,
        account_name: profile.displayName,
        send_as_email: bind.sendAsEmail,
        refresh_token_encrypted: encrypted,
        scopes,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,connected_by_user_id,identity_key" },
    );
    if (error) return voltar("error=save_failed");

    void audit({
      action: "commercial_email.outlook_connected",
      organizationId: state.orgId,
      actorUserId: state.userId,
      resourceType: "commercial_email_connection",
      requestId: randomUUID(),
    });
    return voltar("connected=1");
  } catch {
    return voltar("error=connection_failed");
  }
}
