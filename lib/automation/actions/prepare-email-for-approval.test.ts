import { describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/lib/automation/types";
import { executePrepareEmailForApproval } from "@/lib/automation/actions/prepare-email-for-approval";

const actionKey = "11111111-1111-4111-8111-111111111111";
const config = {
  action_key: actionKey,
  subject_template: "Proposta para {{nome}}",
  body_template: "Olá, {{contact.name}}. Segue nossa proposta.",
  ai_instruction: "",
};

function context(contact?: Record<string, unknown>) {
  const insert = vi.fn();
  const single = vi.fn().mockResolvedValue({ data: { id: "draft-1" }, error: null });
  insert.mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const admin = { from: vi.fn().mockReturnValue({ insert }) };
  const ctx = {
    admin: admin as unknown as ActionCtx["admin"],
    organizationId: "org-1",
    ruleId: "rule-1",
    ruleName: "Teste",
    requestId: "evt-1",
    event: { id: "evt-1" },
    context: contact ? { contact } : {},
  } as ActionCtx;
  return { ctx, admin, insert, single };
}

describe("prepare_email_for_approval", () => {
  it("não prepara e-mail sem contato", async () => {
    const { ctx, insert } = context();
    const result = await executePrepareEmailForApproval(ctx, config);
    expect(result.status).toBe("skipped");
    expect(insert).not.toHaveBeenCalled();
  });

  it("respeita bloqueio e recusa de marketing", async () => {
    const { ctx, insert } = context({ id: "c-1", email: "cliente@exemplo.com", consent: { marketing: { declined_at: "2026-09-20" } } });
    const result = await executePrepareEmailForApproval(ctx, config);
    expect(result.status).toBe("skipped");
    expect(insert).not.toHaveBeenCalled();
  });

  it("grava um rascunho pendente com assunto e texto configurados", async () => {
    const { ctx, insert } = context({ id: "c-1", email: "cliente@exemplo.com", name: "Ana" });
    const result = await executePrepareEmailForApproval(ctx, config);
    expect(result).toMatchObject({ status: "success", detail: { awaiting_approval: true } });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      action_key: actionKey,
      to_email: "cliente@exemplo.com",
      subject: "Proposta para Ana",
      body_text: "Olá, Ana. Segue nossa proposta.",
      status: "pending",
    }));
    expect(ctx.admin.from).toHaveBeenCalledWith("commercial_email_drafts");
  });

  it("trata uma repetição do mesmo evento como rascunho já preparado", async () => {
    const { ctx, single } = context({ id: "c-1", email: "cliente@exemplo.com", name: "Ana" });
    single.mockResolvedValue({ data: null, error: { code: "23505" } });
    const result = await executePrepareEmailForApproval(ctx, config);
    expect(result).toMatchObject({ status: "success", detail: { already_prepared: true } });
  });
});
