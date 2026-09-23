import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  OUTLOOK_BIND_COOKIE,
  OUTLOOK_BIND_TTL_S,
  OUTLOOK_CALLBACK_PATH,
  emitirVinculo,
  novoVerificador,
  outlookConfig,
  urlDeConsentimento,
} from "@/lib/email/outlook/oauth";
import { env } from "@/lib/env";
import { requireSupportWrite, authenticatedSessionId } from "@/lib/impersonate/support";
import { issueState, verifyState } from "@/lib/nuvemshop/state";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const dynamic = "force-dynamic";

function voltar(error: string) {
  return NextResponse.redirect(new URL(`/app/webhooks?tab=emails&error=${error}`, env.NEXT_PUBLIC_APP_URL));
}

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_email_connections" });
  if (!authz.ok) return authz.response;
  const config = outlookConfig();
  if (!config || env.INTERNAL_SECRET.length < 16) return voltar("not_configured");

  const fromRaw = new URL(req.url).searchParams.get("from");
  const from = fromRaw ? z.string().email().safeParse(fromRaw.trim()) : null;
  if (fromRaw && !from?.success) return voltar("invalid_sender");
  const sendAsEmail = from?.success ? from.data : null;
  const state = issueState(authz.org.orgId, {
    userId: authz.user.id,
    authSessionId: await authenticatedSessionId(),
  });
  const verified = verifyState(state);
  if (!verified) return voltar("invalid_state");
  const verifier = novoVerificador();
  const url = urlDeConsentimento(config, state, verifier, Boolean(sendAsEmail));
  const response = NextResponse.redirect(url);
  response.cookies.set(
    OUTLOOK_BIND_COOKIE,
    emitirVinculo(verified.nonce, verifier, sendAsEmail, env.INTERNAL_SECRET),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: OUTLOOK_CALLBACK_PATH,
      maxAge: OUTLOOK_BIND_TTL_S,
    },
  );
  void audit({
    action: "commercial_email.outlook_connection_started",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    requestId,
  });
  return response;
}
