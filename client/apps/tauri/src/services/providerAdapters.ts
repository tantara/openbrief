import type { AiTokenUsage, ProviderKind } from "@/domain/media-library";
import type { ProviderRequestPlan } from "@/domain/provider";

export type ProviderHttpRequest = {
  endpoint: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type ProviderHttpResponse = {
  status: number;
  body: unknown;
};

export type ProviderHttpClient = (
  request: ProviderHttpRequest,
) => Promise<ProviderHttpResponse>;

export function createProviderHttpRequest({
  requestPlan,
  credential,
}: {
  requestPlan: ProviderRequestPlan;
  credential: string;
}): ProviderHttpRequest {
  return {
    endpoint: requestPlan.endpoint,
    method: requestPlan.method,
    headers: {
      "Content-Type": "application/json",
      ...createProviderAuthHeaders(requestPlan.provider, credential),
    },
    body: requestPlan.body,
  };
}

export function extractProviderText(provider: ProviderKind, body: unknown): string {
  switch (provider) {
    case "openai":
    case "openrouter":
      return extractOpenAiCompatibleText(body);
    case "anthropic":
      return extractAnthropicText(body);
    case "gemini":
      return extractGeminiText(body);
  }
}

export function extractProviderUsage(
  provider: ProviderKind,
  body: unknown,
): AiTokenUsage | undefined {
  switch (provider) {
    case "openai":
    case "openrouter":
      return extractOpenAiCompatibleUsage(body);
    case "anthropic":
      return extractAnthropicUsage(body);
    case "gemini":
      return extractGeminiUsage(body);
  }
}

export async function fetchProviderHttpClient(
  request: ProviderHttpRequest,
): Promise<ProviderHttpResponse> {
  const response = await fetch(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  return {
    status: response.status,
    body: await readResponseBody(response),
  };
}

function createProviderAuthHeaders(
  provider: ProviderKind,
  credential: string,
): Record<string, string> {
  switch (provider) {
    case "openai":
      return { Authorization: `Bearer ${credential}` };
    case "openrouter":
      return {
        Authorization: `Bearer ${credential}`,
        "HTTP-Referer": "https://openbrief.app",
        "X-Title": "OpenBrief",
      };
    case "anthropic":
      return {
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      };
    case "gemini":
      return { "x-goog-api-key": credential };
  }
}

function extractOpenAiCompatibleText(body: unknown) {
  const content = asRecord(body)?.choices;

  if (!Array.isArray(content)) {
    throw new Error("provider_response_missing_choices");
  }

  const message = asRecord(asRecord(content[0])?.message);
  const text = message?.content;

  if (typeof text !== "string") {
    throw new Error("provider_response_missing_text");
  }

  return text;
}

function extractOpenAiCompatibleUsage(body: unknown): AiTokenUsage | undefined {
  const usage = asRecord(asRecord(body)?.usage);
  if (!usage) return undefined;

  const inputTokens = asNumber(usage.prompt_tokens);
  const outputTokens = asNumber(usage.completion_tokens);
  const cachedInputTokens = asNumber(
    asRecord(usage.prompt_tokens_details)?.cached_tokens,
  );

  return compactUsage({
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: asNumber(usage.total_tokens) ?? sumTokens(inputTokens, outputTokens),
  });
}

function extractAnthropicText(body: unknown) {
  const content = asRecord(body)?.content;

  if (!Array.isArray(content)) {
    throw new Error("provider_response_missing_content");
  }

  const text = content
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");

  if (!text) {
    throw new Error("provider_response_missing_text");
  }

  return text;
}

function extractAnthropicUsage(body: unknown): AiTokenUsage | undefined {
  const usage = asRecord(asRecord(body)?.usage);
  if (!usage) return undefined;

  const inputTokens = asNumber(usage.input_tokens);
  const outputTokens = asNumber(usage.output_tokens);
  const cachedInputTokens =
    asNumber(usage.cache_read_input_tokens) ??
    asNumber(usage.cached_input_tokens);

  return compactUsage({
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: sumTokens(inputTokens, outputTokens),
  });
}

function extractGeminiText(body: unknown) {
  const candidates = asRecord(body)?.candidates;

  if (!Array.isArray(candidates)) {
    throw new Error("provider_response_missing_candidates");
  }

  const parts = asRecord(asRecord(candidates[0])?.content)?.parts;

  if (!Array.isArray(parts)) {
    throw new Error("provider_response_missing_parts");
  }

  const text = parts
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");

  if (!text) {
    throw new Error("provider_response_missing_text");
  }

  return text;
}

function extractGeminiUsage(body: unknown): AiTokenUsage | undefined {
  const usage = asRecord(asRecord(body)?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = asNumber(usage.promptTokenCount);
  const outputTokens = asNumber(usage.candidatesTokenCount);

  return compactUsage({
    inputTokens,
    cachedInputTokens: asNumber(usage.cachedContentTokenCount),
    outputTokens,
    totalTokens: asNumber(usage.totalTokenCount) ?? sumTokens(inputTokens, outputTokens),
  });
}

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumTokens(...values: Array<number | undefined>) {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? total : undefined;
}

function compactUsage(usage: AiTokenUsage): AiTokenUsage | undefined {
  const entries = Object.entries(usage).filter(
    ([, value]) => typeof value === "number",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
