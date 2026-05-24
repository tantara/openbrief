import type { AiTokenUsage, ProviderKind } from "@/domain/media-library";
import {
  createProviderRequestPlan,
  redactProviderDiagnostic,
  type ProviderOperation,
  type ProviderRequestPlan,
} from "@/domain/provider";
import {
  createProviderHttpRequest,
  extractProviderUsage,
  extractProviderText,
  fetchProviderHttpClient,
  type ProviderHttpClient,
  type ProviderHttpResponse,
} from "@/services/providerAdapters";
import {
  logRuntimeError,
  logRuntimeInfo,
  logRuntimeWarn,
} from "@/services/runtimeLogger";
import {
  canUseTauriRuntime,
  createTauriProviderHttpClient,
} from "@/services/tauriProviderClient";

export type ProviderCompletionRequest = {
  provider: ProviderKind;
  operation: ProviderOperation;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  streamingMode?: boolean;
  onTextSnapshot?(text: string): void;
};

export type ProviderCompletionResult =
  | {
      ok: true;
      text: string;
      usage?: AiTokenUsage;
      requestPlan: ProviderRequestPlan;
    }
  | {
      ok: false;
      message: string;
      diagnostic: unknown;
      requestPlan: ProviderRequestPlan;
    };

export type ProviderService = {
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult>;
};

export type ProviderCredentialResolver = (
  provider: ProviderKind,
) => Promise<string | null | undefined>;

export type TrustedProviderHttpClient = (
  requestPlan: ProviderRequestPlan,
) => Promise<ProviderHttpResponse>;

export type LiveProviderServiceOptions = {
  httpClient?: ProviderHttpClient;
  resolveCredential?: ProviderCredentialResolver;
  trustedHttpClient?: TrustedProviderHttpClient;
  fallbackService?: ProviderService;
};

export function createMockProviderService(): ProviderService {
  return {
    async complete(request) {
      const requestPlan = createProviderRequestPlan(request);
      const startedAt = performance.now();
      logRuntimeInfo("before calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode: "mock",
        streamingMode: request.streamingMode,
      });

      const text = createMockCompletionText(request);

      if (request.streamingMode) {
        await emitMockTextSnapshots(text, request.onTextSnapshot);
      }

      const result = {
        ok: true as const,
        text,
        usage: createMockTokenUsage(request, text),
        requestPlan,
      };
      logRuntimeInfo("after calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode: "mock",
        status: "success",
        streamingMode: request.streamingMode,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      return result;
    },
  };
}

async function emitMockTextSnapshots(
  text: string,
  onTextSnapshot?: (text: string) => void,
) {
  if (!onTextSnapshot) return;

  const chunkSize = Math.max(24, Math.ceil(text.length / 6));
  for (let index = chunkSize; index < text.length; index += chunkSize) {
    onTextSnapshot(text.slice(0, index));
    await Promise.resolve();
  }
  onTextSnapshot(text);
}

export function createProviderService(
  options?: LiveProviderServiceOptions,
): ProviderService {
  if (!options) {
    return createMockProviderService();
  }

  return createLiveProviderService(options);
}

export function createDefaultProviderService(): ProviderService {
  if (!canUseTauriRuntime()) {
    return createMockProviderService();
  }

  return createLiveProviderService({
    trustedHttpClient: createTauriProviderHttpClient(),
  });
}

export function createLiveProviderService({
  httpClient = fetchProviderHttpClient,
  resolveCredential,
  trustedHttpClient,
  fallbackService = createMockProviderService(),
}: LiveProviderServiceOptions): ProviderService {
  return {
    async complete(request) {
      const requestPlan = createProviderRequestPlan(request);
      const startedAt = performance.now();
      logRuntimeInfo("before calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode: "live",
        streamingMode: request.streamingMode,
      });

      if (trustedHttpClient) {
        try {
          const response = await trustedHttpClient(requestPlan);

          if (response.status < 200 || response.status >= 300) {
            logRuntimeError("after calling llm request", {
              provider: request.provider,
              operation: request.operation,
              model: request.model,
              mode: "trusted-live",
              status: "http_error",
              httpStatus: response.status,
              elapsedMs: Math.round(performance.now() - startedAt),
            });
            return createProviderFailureResult({
              request,
              error: {
                status: response.status,
                body: response.body,
              },
            });
          }

          logRuntimeInfo("after calling llm request", {
            provider: request.provider,
            operation: request.operation,
            model: request.model,
            mode: "trusted-live",
            status: "success",
            httpStatus: response.status,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          return {
            ok: true,
            text: extractProviderText(request.provider, response.body),
            usage: extractProviderUsage(request.provider, response.body),
            requestPlan,
          };
        } catch (error) {
          logRuntimeError("after calling llm request", {
            provider: request.provider,
            operation: request.operation,
            model: request.model,
            mode: "trusted-live",
            status: "failed",
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          return createProviderFailureResult({ request, error });
        }
      }

      if (!resolveCredential) {
        logRuntimeWarn("after calling llm request", {
          provider: request.provider,
          operation: request.operation,
          model: request.model,
          mode: "fallback",
          status: "missing_credential_resolver",
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        return fallbackService.complete(request);
      }

      const credential = await resolveCredential(request.provider);

      if (!credential) {
        logRuntimeWarn("after calling llm request", {
          provider: request.provider,
          operation: request.operation,
          model: request.model,
          mode: "fallback",
          status: "missing_credential",
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        return fallbackService.complete(request);
      }

      try {
        const response = await httpClient(
          createProviderHttpRequest({ requestPlan, credential }),
        );

        if (response.status < 200 || response.status >= 300) {
          logRuntimeError("after calling llm request", {
            provider: request.provider,
            operation: request.operation,
            model: request.model,
            mode: "live",
            status: "http_error",
            httpStatus: response.status,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          return createProviderFailureResult({
            request,
            error: {
              status: response.status,
              body: response.body,
            },
            secrets: [credential],
          });
        }

        logRuntimeInfo("after calling llm request", {
          provider: request.provider,
          operation: request.operation,
          model: request.model,
          mode: "live",
          status: "success",
          httpStatus: response.status,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        return {
          ok: true,
          text: extractProviderText(request.provider, response.body),
          usage: extractProviderUsage(request.provider, response.body),
          requestPlan,
        };
      } catch (error) {
        logRuntimeError("after calling llm request", {
          provider: request.provider,
          operation: request.operation,
          model: request.model,
          mode: "live",
          status: "failed",
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        return createProviderFailureResult({
          request,
          error,
          secrets: [credential],
        });
      }
    },
  };
}

export function createProviderFailureResult({
  request,
  error,
  secrets = [],
}: {
  request: ProviderCompletionRequest;
  error: unknown;
  secrets?: string[];
}): ProviderCompletionResult {
  return {
    ok: false,
    message: "provider_request_failed",
    diagnostic: redactProviderDiagnostic(error, secrets),
    requestPlan: createProviderRequestPlan(request),
  };
}

function createMockCompletionText(request: ProviderCompletionRequest) {
  if (request.operation === "summary") {
    return createMockSummary(request.userPrompt);
  }

  if (
    request.operation === "transcript_review" ||
    request.operation === "transcript_translate"
  ) {
    return createMockTranscriptTransform(request.userPrompt);
  }

  if (request.operation === "podcast_script") {
    return createMockPodcastScript();
  }

  return createMockChatReply(request.userPrompt);
}

function createMockSummary(prompt: string) {
  return [
    "# Summary",
    "",
    "## Key Points",
    "- The transcript was processed through the selected provider contract.",
    "- Timestamped context is preserved for follow-up chat.",
    "",
    "## Source Notes",
    `- Input characters: ${prompt.length}`,
  ].join("\n");
}

function createMockChatReply(prompt: string) {
  return `I used the selected local context to answer: ${prompt.slice(0, 160)}`;
}

function createMockPodcastScript() {
  return JSON.stringify({
    title: "OpenBrief podcast",
    description: "A two-speaker audio brief generated from the current media.",
    turns: [
      {
        speakerId: "A",
        text: "Welcome to this OpenBrief audio overview. We will highlight the main ideas from the source.",
      },
      {
        speakerId: "B",
        text: "The key point is that the material has been condensed into a focused, listenable script.",
      },
      {
        speakerId: "A",
        text: "We will keep the discussion grounded in the transcript and summary instead of adding unrelated context.",
      },
      {
        speakerId: "B",
        text: "That makes this useful as a quick recap before returning to the original media.",
      },
    ],
  });
}

function createMockTokenUsage(
  request: ProviderCompletionRequest,
  text: string,
): AiTokenUsage {
  const inputTokens = estimateTokenCount(
    `${request.systemPrompt}\n${request.userPrompt}`,
  );
  const outputTokens = estimateTokenCount(text);

  return {
    inputTokens,
    cachedInputTokens: request.operation === "chat" ? Math.floor(inputTokens * 0.15) : 0,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function createMockTranscriptTransform(prompt: string) {
  const transcriptStart = prompt.indexOf("TRANSCRIPT_SEGMENTS:");
  const segmentText =
    transcriptStart >= 0 ? prompt.slice(transcriptStart) : prompt;

  return segmentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("TRANSCRIPT_SEGMENTS"))
    .map((line) => {
      const [id, time, ...textParts] = line.split("\t");
      const text = textParts.join("\t").trim();
      return id && time && text ? `${id}\t${time}\t${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
