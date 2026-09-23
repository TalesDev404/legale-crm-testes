import type { SupabaseClient } from "@supabase/supabase-js";

import { renovarToken } from "@/lib/email/outlook/oauth";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

export interface OutlookConnection {
  id: string;
  organization_id: string;
  account_email: string;
  send_as_email: string | null;
  refresh_token_encrypted: string;
  status: string;
}

export interface ApprovedEmail {
  to_email: string;
  subject: string;
  body_text: string;
}

export class OutlookPreflightError extends Error {}

/** Retorna o resultado do Graph; erro de rede é ambíguo e o chamador não reenvia sozinho. */
export async function enviarPeloOutlook(
  admin: SupabaseClient,
  connection: OutlookConnection,
  email: ApprovedEmail,
): Promise<{ accepted: boolean; uncertain?: boolean; reason?: string }> {
  const refreshToken = await decryptWebhookSecret(admin, connection.refresh_token_encrypted);
  if (!refreshToken) throw new OutlookPreflightError("token_unavailable");
  let tokens: Awaited<ReturnType<typeof renovarToken>>;
  try {
    tokens = await renovarToken(refreshToken);
  } catch {
    throw new OutlookPreflightError("token_refresh_failed");
  }
  if (tokens.refresh_token) {
    const encrypted = await encryptWebhookSecret(admin, tokens.refresh_token);
    if (!encrypted) throw new OutlookPreflightError("encryption_unavailable");
    const { error } = await admin
      .from("commercial_email_connections")
      .update({ refresh_token_encrypted: encrypted, status: "connected" })
      .eq("organization_id", connection.organization_id)
      .eq("id", connection.id);
    if (error) throw new OutlookPreflightError("token_save_failed");
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: email.subject,
        body: { contentType: "Text", content: email.body_text },
        toRecipients: [{ emailAddress: { address: email.to_email } }],
        ...(connection.send_as_email
          ? { from: { emailAddress: { address: connection.send_as_email } } }
          : {}),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 202) return { accepted: true };
  if (response.status === 401 || response.status === 403) {
    await admin
      .from("commercial_email_connections")
      .update({ status: "reauthorize" })
      .eq("organization_id", connection.organization_id)
      .eq("id", connection.id);
  }
  return { accepted: false, uncertain: response.status >= 500, reason: `graph_http_${response.status}` };
}
