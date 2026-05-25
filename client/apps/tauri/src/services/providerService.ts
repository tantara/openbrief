import type { AiTokenUsage, ProviderKind } from "@/domain/media-library";
import {
  createProviderRequestPlan,
  redactProviderDiagnostic,
  type GenerationParams,
  type ProviderOperation,
  type ProviderRequestPlan,
} from "@/domain/provider";
import {
  createProviderHttpRequest,
  extractProviderFinishReason,
  extractProviderUsage,
  extractProviderText,
  fetchProviderHttpClient,
  type ProviderFinishReason,
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
  generationParams?: GenerationParams;
  continuationText?: string;
  onTextSnapshot?(text: string): void;
};

export type ProviderCompletionResult =
  | {
      ok: true;
      text: string;
      usage?: AiTokenUsage;
      finishReason?: ProviderFinishReason;
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
  options?: {
    provider: ProviderKind;
    onTextSnapshot?(text: string): void;
  },
) => Promise<ProviderHttpResponse>;

export type LiveProviderServiceOptions = {
  httpClient?: ProviderHttpClient;
  resolveCredential?: ProviderCredentialResolver;
  trustedHttpClient?: TrustedProviderHttpClient;
  fallbackService?: ProviderService;
};

const maxProviderContinuationRequests = 4;

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
        finishReason: "stop" as const,
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
      const startedAt = performance.now();
      const initialRequestPlan = createProviderRequestPlan(request);
      logRuntimeInfo("before calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode: "live",
        streamingMode: request.streamingMode,
      });

      if (trustedHttpClient) {
        try {
          return await completeProviderWithContinuation({
            request,
            startedAt,
            initialRequestPlan,
            mode: "trusted-live",
            executeAttempt: async ({ attemptRequest, requestPlan, onTextSnapshot }) =>
              trustedHttpClient(requestPlan, {
                provider: attemptRequest.provider,
                onTextSnapshot,
              }),
          });
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
        return await completeProviderWithContinuation({
          request,
          startedAt,
          initialRequestPlan,
          mode: "live",
          executeAttempt: async ({ attemptRequest, requestPlan, onTextSnapshot }) =>
            httpClient(
              createProviderHttpRequest({ requestPlan, credential }),
              {
                provider: attemptRequest.provider,
                onTextSnapshot,
              },
            ),
          secrets: [credential],
        });
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

async function completeProviderWithContinuation({
  request,
  startedAt,
  initialRequestPlan,
  mode,
  executeAttempt,
  secrets = [],
}: {
  request: ProviderCompletionRequest;
  startedAt: number;
  initialRequestPlan: ProviderRequestPlan;
  mode: "live" | "trusted-live";
  executeAttempt({
    attemptRequest,
    requestPlan,
    onTextSnapshot,
  }: {
    attemptRequest: ProviderCompletionRequest;
    requestPlan: ProviderRequestPlan;
    onTextSnapshot?: (text: string) => void;
  }): Promise<ProviderHttpResponse>;
  secrets?: string[];
}): Promise<ProviderCompletionResult> {
  let text = "";
  let usage: AiTokenUsage | undefined;
  let finishReason: ProviderFinishReason = "unknown";
  let lastHttpStatus: number | undefined;

  for (
    let attempt = 0;
    attempt <= maxProviderContinuationRequests;
    attempt += 1
  ) {
    const attemptRequest: ProviderCompletionRequest =
      attempt === 0 ? request : { ...request, continuationText: text };
    const requestPlan =
      attempt === 0 ? initialRequestPlan : createProviderRequestPlan(attemptRequest);
    const textBeforeAttempt = text;
    const onTextSnapshot = request.onTextSnapshot
      ? (attemptText: string) => {
          request.onTextSnapshot?.(`${textBeforeAttempt}${attemptText}`);
        }
      : undefined;
    const response = await executeAttempt({
      attemptRequest,
      requestPlan,
      onTextSnapshot,
    });
    lastHttpStatus = response.status;

    if (response.status < 200 || response.status >= 300) {
      logRuntimeError("after calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode,
        status: "http_error",
        httpStatus: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return createProviderFailureResult({
        request: attemptRequest,
        error: {
          status: response.status,
          body: response.body,
        },
        secrets,
      });
    }

    const attemptText = extractProviderText(request.provider, response.body);
    text += attemptText;
    request.onTextSnapshot?.(text);
    usage = mergeProviderUsage(
      usage,
      extractProviderUsage(request.provider, response.body),
    );
    finishReason = extractProviderFinishReason(request.provider, response.body);

    if (finishReason !== "length") {
      logRuntimeInfo("after calling llm request", {
        provider: request.provider,
        operation: request.operation,
        model: request.model,
        mode,
        status: "success",
        httpStatus: response.status,
        finishReason,
        continuationAttempts: attempt,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return {
        ok: true,
        text,
        usage,
        finishReason,
        requestPlan: initialRequestPlan,
      };
    }
  }

  logRuntimeWarn("after calling llm request", {
    provider: request.provider,
    operation: request.operation,
    model: request.model,
    mode,
    status: "max_continuation_attempts_reached",
    httpStatus: lastHttpStatus,
    finishReason,
    continuationAttempts: maxProviderContinuationRequests,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  return {
    ok: true,
    text,
    usage,
    finishReason: "length",
    requestPlan: initialRequestPlan,
  };
}

function mergeProviderUsage(
  current: AiTokenUsage | undefined,
  next: AiTokenUsage | undefined,
): AiTokenUsage | undefined {
  if (!current) return next;
  if (!next) return current;

  return {
    inputTokens: sumOptionalNumbers(current.inputTokens, next.inputTokens),
    cachedInputTokens: sumOptionalNumbers(
      current.cachedInputTokens,
      next.cachedInputTokens,
    ),
    outputTokens: sumOptionalNumbers(current.outputTokens, next.outputTokens),
    totalTokens: sumOptionalNumbers(current.totalTokens, next.totalTokens),
  };
}

function sumOptionalNumbers(
  first: number | undefined,
  second: number | undefined,
): number | undefined {
  const total = (first ?? 0) + (second ?? 0);
  return total > 0 ? total : undefined;
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

  if (request.operation === "quiz") {
    return createMockQuiz();
  }

  if (request.operation === "video_agent_plan") {
    return createMockEditorAgentPlan(request.userPrompt);
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

function createMockQuiz() {
  return JSON.stringify({
    title: "OpenBrief quiz",
    description: "A generated study quiz grounded in the current media.",
    items: [
      {
        question: "What is the main purpose of this OpenBrief quiz?",
        options: [
          "To test recall from the selected source",
          "To replace the source media",
          "To configure provider credentials",
          "To export audio files",
        ],
        correctOptionIndex: 0,
        explanation: "The quiz is generated from the selected source material.",
      },
      {
        question: "What should each answer be grounded in?",
        options: [
          "The supplied transcript or summary",
          "Unrelated background knowledge",
          "Provider account settings",
          "The app release notes",
        ],
        correctOptionIndex: 0,
        explanation: "Quiz generation is constrained to the provided source.",
      },
    ],
  });
}

function createMockEditorAgentPlan(prompt: string) {
  const isTranscriptEdit = prompt.includes("Requested plan kind: transcript-edit");

  return JSON.stringify({
    kind: isTranscriptEdit ? "transcript-edit" : "composition",
    summary: isTranscriptEdit
      ? "Drafted a native transcript edit plan."
      : "Drafted a native HyperFrames composition plan.",
    scenario: "summary-to-video",
    direction: isTranscriptEdit
      ? "Remove low-signal filler segments, keep cuts on transcript timing boundaries, and render through OpenBrief."
      : "Create a concise short-form briefing with kinetic captions and a clear final takeaway.",
    componentNames: isTranscriptEdit ? [] : ["caption-clip-wipe"],
    storyboard: [
      {
        title: "Hook",
        narration: "Open with the strongest summary claim.",
        startSeconds: 0,
        durationSeconds: 8,
      },
      {
        title: "Context",
        narration: "Use the transcript to support the key point.",
        startSeconds: 8,
        durationSeconds: 24,
      },
      {
        title: "Takeaway",
        narration: "Close with one viewer action or takeaway.",
        startSeconds: 32,
        durationSeconds: 13,
      },
    ],
    transcriptEdit: {
      cuts: isTranscriptEdit
        ? [
            {
              startSeconds: 1,
              endSeconds: 2,
              reason: "Remove a low-signal filler phrase.",
            },
          ]
        : [],
      renderNotes: [
        "Keep captions last in the render chain.",
        "Use the native OpenBrief preview before rendering MP4.",
      ],
    },
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
