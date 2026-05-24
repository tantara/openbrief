import type { ProviderKind } from "@/domain/media-library";

export type ProviderOperation =
  | "summary"
  | "chat"
  | "transcript_review"
  | "transcript_translate";

export type ProviderRequestPlan = {
  provider: ProviderKind;
  operation: ProviderOperation;
  endpoint: string;
  method: "POST";
  credentialPolicy: "tauri-secret-store";
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type ProviderAccountStatus = {
  provider: ProviderKind;
  label: string;
  authMode: "api-key";
  configured: boolean;
  credentialPolicy: "os-keychain-preferred";
};

export type SubscriptionOAuthGate = {
  provider: "chatgpt-codex" | "claude-pro-max";
  status: "blocked";
  blockers: string[];
};

export const providerOptions: ProviderKind[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

export const providerLabels: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  openrouter: "OpenRouter",
};

const providerEndpoints: Record<ProviderKind, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export const providerModelOptions: Record<ProviderKind, string[]> = {
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6"],
  gemini: [
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
  ],
  openrouter: ["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro"],
};

export const defaultProviderModels: Record<ProviderKind, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-3.1-flash-lite",
  openrouter: "deepseek/deepseek-v4-flash",
};

const forbiddenSecretKeyFragments = [
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "oauth",
  "refresh_token",
  "secret",
  "token",
  "x_api_key",
  "x-api-key",
];

export function createProviderAccounts(
  configuredProviders: ProviderKind[] = [],
): ProviderAccountStatus[] {
  return providerOptions.map((provider) => ({
    provider,
    label: providerLabels[provider],
    authMode: "api-key",
    configured: configuredProviders.includes(provider),
    credentialPolicy: "os-keychain-preferred",
  }));
}

export function createProviderRequestPlan({
  provider,
  operation,
  systemPrompt,
  userPrompt,
  model,
}: {
  provider: ProviderKind;
  operation: ProviderOperation;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): ProviderRequestPlan {
  const selectedModel = model ?? defaultProviderModels[provider];

  return {
    provider,
    operation,
    endpoint: createProviderEndpoint(provider, selectedModel),
    method: "POST",
    credentialPolicy: "tauri-secret-store",
    headers: createRedactedHeaderPlan(provider),
    body: createProviderBody(provider, selectedModel, systemPrompt, userPrompt),
  };
}

export function createSubscriptionOAuthGate(
  provider: SubscriptionOAuthGate["provider"],
): SubscriptionOAuthGate {
  return {
    provider,
    status: "blocked",
    blockers: [
      "OAuth tokens must be stored by the trusted Tauri boundary.",
      "No OAuth token may enter renderer state or helper payloads.",
      "Logout and refresh behavior need proof tests before subscription auth is claimed.",
    ],
  };
}

export function redactProviderDiagnostic(
  value: unknown,
  additionalSecrets: string[] = [],
): unknown {
  if (typeof value === "string") {
    return redactSecretText(value, additionalSecrets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactProviderDiagnostic(item, additionalSecrets));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (isForbiddenSecretKey(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, redactProviderDiagnostic(nestedValue, additionalSecrets)];
    }),
  );
}

export function providerDiagnosticContainsSecret(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => providerDiagnosticContainsSecret(item));
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (isForbiddenSecretKey(key)) {
      return typeof nestedValue === "string" && nestedValue !== "[REDACTED]";
    }

    return providerDiagnosticContainsSecret(nestedValue);
  });
}

function createRedactedHeaderPlan(provider: ProviderKind): Record<string, string> {
  switch (provider) {
    case "openai":
    case "openrouter":
      return { Authorization: "[TAURI_SECRET:api-key]" };
    case "anthropic":
      return {
        "x-api-key": "[TAURI_SECRET:api-key]",
        "anthropic-version": "2023-06-01",
      };
    case "gemini":
      return { "x-goog-api-key": "[TAURI_SECRET:api-key]" };
  }
}

function createProviderEndpoint(provider: ProviderKind, model: string) {
  if (provider !== "gemini") {
    return providerEndpoints[provider];
  }

  return providerEndpoints.gemini.replace("{model}", encodeURIComponent(model));
}

function createProviderBody(
  provider: ProviderKind,
  model: string,
  systemPrompt: string,
  userPrompt: string,
) {
  switch (provider) {
    case "openai":
    case "openrouter":
      return {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
    case "anthropic":
      return {
        model,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      };
    case "gemini":
      return {
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
      };
  }
}

function isForbiddenSecretKey(key: string) {
  const normalizedKey = key.toLowerCase().replace(/[-\s]/g, "_");

  return forbiddenSecretKeyFragments.some((fragment) =>
    normalizedKey.includes(fragment.replace(/-/g, "_")),
  );
}

function redactSecretText(value: string, additionalSecrets: string[]) {
  return additionalSecrets
    .filter((secret) => secret.length > 0)
    .reduce(
      (redacted, secret) => redacted.split(secret).join("[REDACTED]"),
      value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
        .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]"),
    );
}
