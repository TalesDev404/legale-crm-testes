import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env";

export const OUTLOOK_CALLBACK_PATH = "/api/v1/integrations/outlook/callback";
export const OUTLOOK_BIND_COOKIE = "crm_outlook_oauth_bind";
export const OUTLOOK_BIND_TTL_S = 600;

const ENDPOINT = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
const SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"];

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

const profileSchema = z.object({
  id: z.string().min(1),
  mail: z.string().nullable().optional(),
  userPrincipalName: z.string().min(1),
  displayName: z.string().nullable().optional(),
});

export function outlookConfig() {
  const clientId = env.OUTLOOK_CLIENT_ID.trim();
  const clientSecret = env.OUTLOOK_CLIENT_SECRET.trim();
  const appUrl = env.NEXT_PUBLIC_APP_URL.trim();
  if (!clientId || !clientSecret || !appUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: new URL(OUTLOOK_CALLBACK_PATH, appUrl).toString(),
  };
}

export function novoVerificador(): string {
  return randomBytes(32).toString("base64url");
}

export function urlDeConsentimento(
  config: NonNullable<ReturnType<typeof outlookConfig>>,
  state: string,
  verifier: string,
  compartilhado: boolean,
): string {
  const url = new URL(`${ENDPOINT}/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", [...SCOPES, ...(compartilhado ? ["Mail.Send.Shared"] : [])].join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set(
    "code_challenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** O cookie Lax vincula o navegador que iniciou o consentimento ao retorno. */
export function emitirVinculo(
  nonce: string,
  verifier: string,
  sendAsEmail: string | null,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify({ nonce, verifier, sendAsEmail })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verificarVinculo(
  cookie: string | undefined,
  nonce: string,
  secret: string,
): { verifier: string; sendAsEmail: string | null } | null {
  if (!cookie || !secret) return null;
  const [payload, received] = cookie.split(".");
  if (!payload || !received) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(received, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = z
      .object({ nonce: z.string(), verifier: z.string().min(32), sendAsEmail: z.string().email().nullable() })
      .safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success && parsed.data.nonce === nonce
      ? { verifier: parsed.data.verifier, sendAsEmail: parsed.data.sendAsEmail }
      : null;
  } catch {
    return null;
  }
}

async function tokenRequest(params: URLSearchParams) {
  const response = await fetch(`${ENDPOINT}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`outlook_token_${response.status}`);
  return tokensSchema.parse(await response.json());
}

export async function trocarCodigo(code: string, verifier: string) {
  const config = outlookConfig();
  if (!config) throw new Error("outlook_not_configured");
  return tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  );
}

export async function renovarToken(refreshToken: string) {
  const config = outlookConfig();
  if (!config) throw new Error("outlook_not_configured");
  return tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function perfilDaConta(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`outlook_profile_${response.status}`);
  return profileSchema.parse(await response.json());
}
