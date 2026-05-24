import { describe, expect, it } from "vitest";
import type { ProviderKind } from "@/domain/media-library";
import {
  createProviderAccounts,
  createProviderRequestPlan,
  createSubscriptionOAuthGate,
  providerDiagnosticContainsSecret,
  redactProviderDiagnostic,
} from "@/domain/provider";

describe("provider domain", () => {
  it("creates API-key provider account statuses without storing secrets", () => {
    const accounts = createProviderAccounts(["openai", "gemini"]);

    expect(accounts).toHaveLength(4);
    expect(accounts.find((account) => account.provider === "openai")).toMatchObject({
      authMode: "api-key",
      configured: true,
      credentialPolicy: "os-keychain-preferred",
    });
    expect(accounts.find((account) => account.provider === "anthropic")).toMatchObject({
      configured: false,
    });
  });

  it.each<ProviderKind>(["openai", "anthropic", "gemini", "openrouter"])(
    "shapes %s request plans without secrets in the body",
    (provider) => {
      const plan = createProviderRequestPlan({
        provider,
        operation: "summary",
        systemPrompt: "Summarize in markdown.",
        userPrompt: "Transcript text",
      });

      expect(plan.provider).toBe(provider);
      expect(plan.credentialPolicy).toBe("tauri-secret-store");
      expect(JSON.stringify(plan.body)).not.toContain("TAURI_SECRET");
      expect(JSON.stringify(plan.body)).not.toContain("sk-");
      expect(providerDiagnosticContainsSecret(plan.body)).toBe(false);
      expect(JSON.stringify(plan.headers)).toContain("[TAURI_SECRET:api-key]");
      expect(JSON.stringify(plan.headers)).not.toContain("sk-");
    },
  );

  it("uses a selected Gemini model in the endpoint without exposing credentials", () => {
    const plan = createProviderRequestPlan({
      provider: "gemini",
      operation: "chat",
      systemPrompt: "Answer.",
      userPrompt: "Question",
      model: "gemini-3.1-flash-lite",
    });

    expect(plan.endpoint).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    );
    expect(JSON.stringify(plan)).not.toContain("AIza");
    expect(JSON.stringify(plan.headers)).toContain("[TAURI_SECRET:api-key]");
  });

  it("redacts nested provider diagnostics", () => {
    const redacted = redactProviderDiagnostic({
      message: "failed",
      authorization: "Bearer sk-test",
      nested: {
        access_token: "access",
        refresh_token: "refresh",
        "x-api-key": "secret",
        detail: "provider returned Bearer sk-test and live-secret",
      },
    }, ["live-secret"]);

    expect(redacted).toEqual({
      message: "failed",
      authorization: "[REDACTED]",
      nested: {
        access_token: "[REDACTED]",
        refresh_token: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        detail: "provider returned Bearer [REDACTED] and [REDACTED]",
      },
    });
  });

  it("keeps subscription OAuth behind the proof gate", () => {
    const gate = createSubscriptionOAuthGate("chatgpt-codex");

    expect(gate.status).toBe("blocked");
    expect(gate.blockers.join(" ")).toContain("renderer state");
  });
});
