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

export type ProviderFinishReason = "stop" | "length" | "unknown";

export type ProviderHttpClientOptions = {
  provider: ProviderKind;
  onTextSnapshot?(text: string): void;
};

export type ProviderHttpClient = (
  request: ProviderHttpRequest,
  options?: ProviderHttpClientOptions,
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
  const syntheticText = asRecord(body)?.openbriefText;
  if (typeof syntheticText === "string") return syntheticText;

  switch (provider) {
    case "openai":
    case "openrouter":
    case "deepseek":
    case "openai-compatible":
      return extractOpenAiCompatibleText(body);
    case "anthropic":
      return extractAnthropicText(body);
    case "gemini":
      return extractGeminiText(body);
  }
}

export function extractProviderFinishReason(
  provider: ProviderKind,
  body: unknown,
): ProviderFinishReason {
  const syntheticFinishReason = asRecord(body)?.openbriefFinishReason;
  if (typeof syntheticFinishReason === "string") {
    return normalizeFinishReason(syntheticFinishReason);
  }

  switch (provider) {
    case "openai":
    case "openrouter":
    case "deepseek":
    case "openai-compatible":
      return normalizeFinishReason(
        asRecord(asArray(asRecord(body)?.choices)?.[0])?.finish_reason,
      );
    case "anthropic":
      return normalizeFinishReason(asRecord(body)?.stop_reason);
    case "gemini":
      return normalizeFinishReason(
        asRecord(asArray(asRecord(body)?.candidates)?.[0])?.finishReason,
      );
  }
}

export function extractProviderUsage(
  provider: ProviderKind,
  body: unknown,
): AiTokenUsage | undefined {
  switch (provider) {
    case "openai":
    case "openrouter":
    case "deepseek":
    case "openai-compatible":
      return extractOpenAiCompatibleUsage(body);
    case "anthropic":
      return extractAnthropicUsage(body);
    case "gemini":
      return extractGeminiUsage(body);
  }
}

export async function fetchProviderHttpClient(
  request: ProviderHttpRequest,
  options?: ProviderHttpClientOptions,
): Promise<ProviderHttpResponse> {
  const response = await fetch(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (isStreamingRequest(request) && response.ok && options?.onTextSnapshot) {
    return {
      status: response.status,
      body: await readStreamingResponseBody(response, options),
    };
  }

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
    case "deepseek":
    case "openai-compatible":
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
  const choices = asArray(asRecord(body)?.choices);
  if (!choices) throw new Error("provider_response_missing_choices");

  const text = asRecord(asRecord(choices[0])?.message)?.content;
  if (typeof text !== "string") throw new Error("provider_response_missing_text");

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
  const content = asArray(asRecord(body)?.content);
  if (!content) throw new Error("provider_response_missing_content");

  const text = content
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");

  if (!text) throw new Error("provider_response_missing_text");

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
  const text = extractGeminiCandidateText(body, true);
  if (!text) throw new Error("provider_response_missing_text");

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
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function readStreamingResponseBody(
  response: Response,
  options: ProviderHttpClientOptions,
) {
  if (!response.body) return readResponseBody(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason: ProviderFinishReason = "unknown";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = consumeSseBuffer(buffer, options.provider);
    buffer = parsed.remainder;

    if (parsed.textDelta) {
      text += parsed.textDelta;
      options.onTextSnapshot?.(text);
    }
    if (parsed.finishReason !== "unknown") finishReason = parsed.finishReason;
  }

  buffer += decoder.decode();
  const parsed = consumeSseBuffer(buffer, options.provider, true);
  if (parsed.textDelta) {
    text += parsed.textDelta;
    options.onTextSnapshot?.(text);
  }
  if (parsed.finishReason !== "unknown") finishReason = parsed.finishReason;

  return {
    openbriefText: text,
    openbriefFinishReason: finishReason,
  };
}

function consumeSseBuffer(buffer: string, provider: ProviderKind, flush = false) {
  const separatorPattern = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let textDelta = "";
  let finishReason: ProviderFinishReason = "unknown";

  while ((match = separatorPattern.exec(buffer))) {
    const parsed = parseSseFrame(buffer.slice(cursor, match.index), provider);
    cursor = separatorPattern.lastIndex;
    textDelta += parsed.textDelta;
    if (parsed.finishReason !== "unknown") finishReason = parsed.finishReason;
  }

  if (flush && cursor < buffer.length) {
    const parsed = parseSseFrame(buffer.slice(cursor), provider);
    cursor = buffer.length;
    textDelta += parsed.textDelta;
    if (parsed.finishReason !== "unknown") finishReason = parsed.finishReason;
  }

  return {
    textDelta,
    finishReason,
    remainder: buffer.slice(cursor),
  };
}

function parseSseFrame(frame: string, provider: ProviderKind) {
  let textDelta = "";
  let finishReason: ProviderFinishReason = "unknown";
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  for (const data of dataLines) {
    if (!data || data === "[DONE]") continue;

    try {
      const parsed = JSON.parse(data);
      textDelta += extractProviderStreamTextDelta(provider, parsed);
      const nextFinishReason = extractProviderFinishReason(provider, parsed);
      if (nextFinishReason !== "unknown") finishReason = nextFinishReason;
    } catch {
      // Keepalive and provider comment frames are ignored.
    }
  }

  return { textDelta, finishReason };
}

function extractProviderStreamTextDelta(provider: ProviderKind, body: unknown) {
  switch (provider) {
    case "openai":
    case "openrouter":
    case "deepseek":
    case "openai-compatible": {
      const choice = asRecord(asArray(asRecord(body)?.choices)?.[0]);
      const delta = asRecord(choice?.delta)?.content;
      return typeof delta === "string" ? delta : "";
    }
    case "anthropic": {
      const delta = asRecord(asRecord(body)?.delta)?.text;
      return typeof delta === "string" ? delta : "";
    }
    case "gemini":
      return extractGeminiCandidateText(body, false);
  }
}

function extractGeminiCandidateText(body: unknown, throwOnMissing: boolean) {
  const candidates = asArray(asRecord(body)?.candidates);
  if (!candidates) {
    if (throwOnMissing) throw new Error("provider_response_missing_candidates");
    return "";
  }

  const parts = asArray(asRecord(asRecord(candidates[0])?.content)?.parts);
  if (!parts) {
    if (throwOnMissing) throw new Error("provider_response_missing_parts");
    return "";
  }

  return parts
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");
}

function isStreamingRequest(request: ProviderHttpRequest) {
  return request.body.stream === true || request.endpoint.includes(":streamGenerateContent");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
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

function normalizeFinishReason(value: unknown): ProviderFinishReason {
  if (typeof value !== "string") return "unknown";

  const normalized = value.toLowerCase();
  if (
    normalized === "length" ||
    normalized === "max_tokens" ||
    normalized === "max_token" ||
    normalized === "max_output_tokens" ||
    normalized === "max_tokens_reached" ||
    normalized === "max_tokens_exceeded"
  ) {
    return "length";
  }
  if (normalized === "stop" || normalized === "end_turn") return "stop";

  return "unknown";
}
