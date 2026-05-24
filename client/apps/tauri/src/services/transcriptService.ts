import type {
  CaptionLanguage,
  HelperCommandName,
  HelperCommandResult,
  HelperEvent,
} from "@/domain/helper-protocol";
import {
  createAudioExtractionCommand,
  createCaptionLanguageListCommand,
  createCaptionExtractionCommand,
  createCompletedTranscriptJob,
  createDefaultTranscriptSegments,
  createFailedTranscriptJob,
  createTranscribeAudioCommand,
  normalizeTranscriptLines,
  type TranscriptPipelineEvent,
  type TranscriptPipelineRequest,
  type TranscriptPipelineResult,
} from "@/domain/transcript";
import type { TranscriptSegment } from "@/domain/media-library";
import type { TranscriptSourceKind } from "@/domain/media-library";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import {
  logRuntimeError,
  logRuntimeInfo,
} from "@/services/runtimeLogger";

export type TranscriptService = {
  listCaptionLanguages(
    request: TranscriptPipelineRequest,
  ): Promise<CaptionLanguage[]>;
  extractTranscript(
    request: TranscriptPipelineRequest,
    options?: TranscriptServiceOptions,
  ): Promise<TranscriptPipelineResult>;
};

export type TranscriptServiceOptions = {
  onEvent?: (event: TranscriptPipelineEvent) => void;
};

export function createHelperTranscriptService(
  helperClient: HelperClient = new FakeHelperClient(),
): TranscriptService {
  return {
    async listCaptionLanguages(request) {
      const command = createCaptionLanguageListCommand(request);
      if (!command) return [];

      const result = await helperClient.run(command);

      if (result.command !== "list_captions") {
        return [];
      }

      return result.languages;
    },

    async extractTranscript(request, options = {}) {
      const events: TranscriptPipelineEvent[] = [];
      const seenEvents = new Set<string>();
      let sttStartedAt: number | undefined;
      let sttJobId: string | undefined;
      let failureSource: TranscriptSourceKind = shouldAttemptCaptionExtraction(request)
        ? "youtube-captions"
        : "local-stt";

      function recordEvent(event: TranscriptPipelineEvent) {
        const key = transcriptPipelineEventKey(event);
        if (seenEvents.has(key)) return;

        seenEvents.add(key);
        events.push(event);
        options.onEvent?.(event);
      }

      try {
        if (shouldAttemptCaptionExtraction(request)) {
          const captionsCommand = createCaptionExtractionCommand(request);

          try {
            const captionsResult = await helperClient.run(captionsCommand, {
              onEvent(event) {
                recordEvent({
                  type: "helper_event",
                  jobId: captionsCommand.jobId,
                  event,
                });
              },
            });
            collectHelperEvents(helperClient, captionsCommand.jobId, recordEvent);

            if (
              captionsResult.command === "extract_captions" &&
              captionsResult.captionsAvailable &&
              captionsResult.captionsPath
            ) {
              const captionSegments = captionsResult.segments ?? [];

              if (captionSegments.length > 0) {
                recordEvent({
                  type: "transcript_source_selected",
                  jobId: captionsCommand.jobId,
                  sourceKind: "youtube-captions",
                });

                return {
                  ok: true,
                  job: createCompletedTranscriptJob({
                    videoId: request.video.id,
                    sourceKind: "youtube-captions",
                    transcriptPath: captionsResult.captionsPath,
                  }),
                  segments: captionSegments,
                  events,
                };
              }
            }

            if (request.sourcePreference === "youtube-captions") {
              throw new Error("provider_captions_unavailable");
            }
          } catch (error) {
            collectHelperEvents(helperClient, captionsCommand.jobId, recordEvent);
            recordSyntheticFailureIfMissing({
              events,
              recordEvent,
              jobId: captionsCommand.jobId,
              command: captionsCommand.command,
              message: transcriptErrorMessage(error),
            });
          }
        }

        if (request.sourcePreference === "youtube-captions") {
          throw new Error("provider_captions_unavailable");
        }

        failureSource = "local-stt";
        const audioCommand = createAudioExtractionCommand(request);
        const audioResult = await helperClient.run(audioCommand, {
          onEvent(event) {
            recordEvent({
              type: "helper_event",
              jobId: audioCommand.jobId,
              event,
            });
          },
        });
        collectHelperEvents(helperClient, audioCommand.jobId, recordEvent);

        assertHelperResult(audioResult, "extract_audio");

        const sttCommand = createTranscribeAudioCommand({
          request,
          audioPath: audioResult.audioPath,
        });
        sttStartedAt = performance.now();
        sttJobId = sttCommand.jobId;
        logRuntimeInfo("before running stt", {
          jobId: sttCommand.jobId,
          videoId: request.video.id,
          sourceKind: request.video.sourceKind,
        });
        const sttResult = await helperClient.run(sttCommand, {
          onEvent(event) {
            recordEvent({
              type: "helper_event",
              jobId: sttCommand.jobId,
              event,
            });
          },
        });
        collectHelperEvents(helperClient, sttCommand.jobId, recordEvent);

        assertHelperResult(sttResult, "transcribe_audio");
        logRuntimeInfo("after running stt", {
          jobId: sttCommand.jobId,
          videoId: request.video.id,
          sourceKind: request.video.sourceKind,
          status: "success",
          elapsedMs: Math.round(performance.now() - sttStartedAt),
        });

        recordEvent({
          type: "transcript_source_selected",
          jobId: sttCommand.jobId,
          sourceKind: "local-stt",
        });

        return {
          ok: true,
          job: createCompletedTranscriptJob({
            videoId: request.video.id,
            sourceKind: "local-stt",
            transcriptPath: sttResult.transcriptPath,
          }),
          segments: sttTranscriptSegments(sttResult, request),
          events,
        };
      } catch (error) {
        const message = transcriptErrorMessage(error);
        if (sttStartedAt !== undefined) {
          logRuntimeError("after running stt", {
            jobId: sttJobId,
            videoId: request.video.id,
            sourceKind: request.video.sourceKind,
            status: "failed",
            elapsedMs: Math.round(performance.now() - sttStartedAt),
            error: message,
          });
        }

        return {
          ok: false,
          job: createFailedTranscriptJob({
            videoId: request.video.id,
            preferredSource: failureSource,
            message,
          }),
          events,
          message,
        };
      }
    },
  };
}

function shouldAttemptCaptionExtraction(request: TranscriptPipelineRequest) {
  return (
    request.sourcePreference !== "local-stt" &&
    mediaSourceTypeForAsset(request.video) === "video" &&
    request.video.sourceKind !== "local-file" &&
    Boolean(request.video.originalUri)
  );
}

function sttTranscriptSegments(
  result: Extract<HelperCommandResult, { command: "transcribe_audio" }>,
  request: TranscriptPipelineRequest,
): TranscriptSegment[] {
  if (result.segments?.length) {
    return result.segments;
  }

  if (result.text?.trim()) {
    return normalizeTranscriptLines([result.text], "local-stt");
  }

  return createDefaultTranscriptSegments(request.video, "local-stt");
}

function transcriptErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "null") return serialized;
  } catch {
    // Opaque thrown values should still get a stable fallback.
  }

  return "transcript_pipeline_failed";
}

function recordSyntheticFailureIfMissing({
  events,
  recordEvent,
  jobId,
  command,
  message,
}: {
  events: TranscriptPipelineEvent[];
  recordEvent: (event: TranscriptPipelineEvent) => void;
  jobId: string;
  command: HelperCommandName;
  message: string;
}) {
  const alreadyRecorded = events.some(
    (event) =>
      event.type === "helper_event" &&
      event.jobId === jobId &&
      event.event.type === "job_failed",
  );

  if (alreadyRecorded) return;

  recordEvent({
    type: "helper_event",
    jobId,
    event: {
      type: "job_failed",
      jobId,
      command,
      errorCode: "helper_unavailable",
      message,
    },
  });
}

function collectHelperEvents(
  helperClient: HelperClient,
  jobId: string,
  recordEvent: (event: TranscriptPipelineEvent) => void,
) {
  helperClient.eventsForJob(jobId).forEach((event: HelperEvent) => {
    recordEvent({
      type: "helper_event",
      jobId,
      event,
    });
  });
}

function transcriptPipelineEventKey(event: TranscriptPipelineEvent) {
  if (event.type === "transcript_source_selected") {
    return `${event.type}:${event.jobId}:${event.sourceKind}`;
  }

  const helperEvent = event.event;

  switch (helperEvent.type) {
    case "job_progress":
      return `${event.type}:${helperEvent.type}:${helperEvent.jobId}:${helperEvent.progressPercent}:${helperEvent.message ?? ""}`;
    case "job_completed":
      return `${event.type}:${helperEvent.type}:${helperEvent.jobId}`;
    case "job_failed":
      return `${event.type}:${helperEvent.type}:${helperEvent.jobId}:${helperEvent.message}`;
    case "job_cancelled":
      return `${event.type}:${helperEvent.type}:${helperEvent.jobId}:${helperEvent.targetJobId}`;
    case "job_started":
    default:
      return `${event.type}:${helperEvent.type}:${helperEvent.jobId}`;
  }
}

function assertHelperResult<TCommand extends HelperCommandResult["command"]>(
  result: HelperCommandResult,
  command: TCommand,
): asserts result is Extract<HelperCommandResult, { command: TCommand }> {
  if (result.command !== command) {
    throw new Error(`unexpected_helper_result:${result.command}`);
  }
}
