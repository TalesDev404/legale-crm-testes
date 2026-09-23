import { describe, expect, it } from "vitest";

import { emitirVinculo, novoVerificador, urlDeConsentimento, verificarVinculo } from "@/lib/email/outlook/oauth";

const secret = "a-test-secret-with-enough-entropy";

describe("vínculo do consentimento Outlook", () => {
  it("aceita somente o nonce e a assinatura do início da conexão", () => {
    const verifier = novoVerificador();
    const cookie = emitirVinculo("nonce-1", verifier, "comercial@legale.com.br", secret);
    expect(verificarVinculo(cookie, "nonce-1", secret)).toEqual({ verifier, sendAsEmail: "comercial@legale.com.br" });
    expect(verificarVinculo(cookie, "nonce-2", secret)).toBeNull();
    expect(verificarVinculo(`${cookie}tampered`, "nonce-1", secret)).toBeNull();
  });

  it("pede permissão adicional somente para envio por caixa compartilhada", () => {
    const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://crm.exemplo.com/callback" };
    const personal = new URL(urlDeConsentimento(config, "state", novoVerificador(), false));
    const shared = new URL(urlDeConsentimento(config, "state", novoVerificador(), true));
    expect(personal.searchParams.get("scope")).toContain("Mail.Send");
    expect(personal.searchParams.get("scope")).not.toContain("Mail.Send.Shared");
    expect(shared.searchParams.get("scope")).toContain("Mail.Send.Shared");
    expect(shared.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
