import {
  createLocalFileIngestResult,
  createLocalFileImportPlan,
  createYoutubeDownloadCommand,
  createYoutubeVideoAsset,
  type IngestResult,
  type LocalFileImportRequest,
  type YoutubeImportRequest,
} from "@/domain/ingest";
import { classifyDownloadError } from "@/domain/download-error";
import { helperProtocolVersion, type HelperEvent } from "@/domain/helper-protocol";
import type { HelperCommandResult } from "@/domain/helper-protocol";
import {
  createVideoPosterArtifactPath,
  type MediaSourceType,
} from "@/domain/media-library";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import { invoke } from "@tauri-apps/api/core";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import {
  logRuntimeError,
  logRuntimeInfo,
} from "@/services/runtimeLogger";

export type IngestService = {
  importLocalFile(request: LocalFileImportRequest): Promise<IngestResult>;
  importYoutubeUrl(
    request: YoutubeImportRequest,
    options?: IngestRunOptions,
  ): Promise<IngestResult>;
  cancelIngestJob(jobId: string): Promise<void>;
};

export type IngestRunOptions = {
  onEvent?: (event: HelperEvent) => void;
};

type LocalFileImportResult = {
  assetId: string;
  originalFileName: string;
  libraryRelativePath: string;
  fileSizeBytes: number;
  sourceType?: MediaSourceType;
  pageCount?: number;
};

type ProbeMediaResult = Extract<HelperCommandResult, { command: "probe_media" }>;

export function createTauriIngestService(
  helperClient: HelperClient,
  invokeCommand: TauriInvoke = invoke,
): IngestService {
  return {
    async importLocalFile(request) {
      const startedAt = performance.now();
      logRuntimeInfo("before importing local video", {
        sourcePath: request.sourcePath,
      });

      try {
        const copied = await invokeCommand<LocalFileImportResult>(
          "copy_local_file_into_library",
          { sourcePath: request.sourcePath },
        );
        logRuntimeInfo("after copying local file", {
          sourcePath: request.sourcePath,
          outputPath: copied.libraryRelativePath,
          fileSizeBytes: copied.fileSizeBytes,
          sourceType: copied.sourceType ?? request.sourceType ?? "video",
        });
        const sourceType = copied.sourceType ?? request.sourceType ?? "video";
        const importRequest = {
          ...request,
          assetId: copied.assetId,
          sourceType,
          fileName: copied.originalFileName,
        };
        const localPlan = createLocalFileImportPlan(importRequest);

        if (sourceType === "audio") {
          const probeResult = await helperClient.run({
            protocolVersion: helperProtocolVersion,
            command: "probe_media",
            jobId: `probe-${copied.libraryRelativePath}`,
            inputPath: copied.libraryRelativePath,
          });

          if (probeResult.command !== "probe_media") {
            throw new Error("invalid_probe_result");
          }

          logRuntimeInfo("after importing local file", {
            sourcePath: request.sourcePath,
            outputPath: copied.libraryRelativePath,
            sourceType,
            status: "ready",
            elapsedMs: Math.round(performance.now() - startedAt),
          });

          return createLocalFileIngestResult({
            ...importRequest,
            sourceType,
            fileSizeBytes: copied.fileSizeBytes || probeResult.fileSizeBytes,
            durationSeconds: probeResult.durationSeconds,
            libraryPath: copied.libraryRelativePath,
          });
        }

        if (sourceType !== "video") {
          logRuntimeInfo("after importing local file", {
            sourcePath: request.sourcePath,
            outputPath: copied.libraryRelativePath,
            sourceType,
            status: "ready",
            elapsedMs: Math.round(performance.now() - startedAt),
          });

          return createLocalFileIngestResult({
            ...importRequest,
            sourceType,
            fileSizeBytes: copied.fileSizeBytes,
            pageCount: copied.pageCount,
            libraryPath: copied.libraryRelativePath,
          });
        }

        const probeResult = await helperClient.run({
          protocolVersion: helperProtocolVersion,
          command: "probe_media",
          jobId: `probe-${copied.libraryRelativePath}`,
          inputPath: copied.libraryRelativePath,
        });

        if (probeResult.command !== "probe_media") {
          throw new Error("invalid_probe_result");
        }
        const playbackPath = await ensureWebviewPlayableVideo(helperClient, {
          sourcePath: copied.libraryRelativePath,
          probeResult,
          outputPath: siblingPlaybackPath(copied.libraryRelativePath),
          tempDir: localPlan.tempRelativePath,
          jobId: `transcode-${localPlan.assetId}`,
        });
        const thumbnailPath = await generateThumbnail(helperClient, {
          jobId: `thumbnail-${localPlan.assetId}`,
          videoPath: playbackPath,
          outputPath: createVideoPosterArtifactPath(
            localPlan.assetId,
            importRequest.fileName ?? request.sourcePath,
          ),
          tempDir: localPlan.tempRelativePath,
        });
        logRuntimeInfo("after importing local video", {
          sourcePath: request.sourcePath,
          outputPath: copied.libraryRelativePath,
          playbackPath,
          thumbnailPath,
          status: "ready",
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        return createLocalFileIngestResult({
          ...importRequest,
          sourceType,
          fileSizeBytes: copied.fileSizeBytes || probeResult.fileSizeBytes,
          durationSeconds: probeResult.durationSeconds,
          thumbnailPath: request.thumbnailPath ?? thumbnailPath,
          libraryPath: playbackPath,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "local_file_import_failed";
        logRuntimeError("after importing local video", {
          sourcePath: request.sourcePath,
          status: "failed",
          elapsedMs: Math.round(performance.now() - startedAt),
          error: message,
        });

        return {
          ok: false,
          job: {
            id: `ingest-local-failed`,
            sourceKind: "local-file",
            status: "failed",
            progressPercent: 0,
            errorMessage: message,
          },
          events: [],
          message,
        };
      }
    },

    async importYoutubeUrl(request, options = {}) {
      const commandOrFailure = createYoutubeDownloadCommand(request);

      if ("ok" in commandOrFailure) {
        return commandOrFailure;
      }

      try {
        const startedAt = performance.now();
        logRuntimeInfo("before downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          outputDir: commandOrFailure.outputDir,
        });
        const result = await helperClient.run(commandOrFailure, {
          onEvent: options.onEvent,
        });
        const helperEvents = helperClient.eventsForJob(commandOrFailure.jobId);

        if (result.command !== "download_youtube") {
          throw new Error("invalid_helper_result");
        }
        logRuntimeInfo("after downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          status: "downloaded",
          outputDir: commandOrFailure.outputDir,
          videoPath: result.videoPath,
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        const probeResult = await helperClient.run({
          protocolVersion: helperProtocolVersion,
          command: "probe_media",
          jobId: `probe-${commandOrFailure.jobId}`,
          inputPath: result.videoPath,
        });

        if (probeResult.command !== "probe_media") {
          throw new Error("invalid_probe_result");
        }
        const playbackPath = await ensureWebviewPlayableVideo(helperClient, {
          sourcePath: result.videoPath,
          probeResult,
          outputPath: siblingPlaybackPath(result.videoPath),
          tempDir: commandOrFailure.tempDir,
          jobId: `transcode-${commandOrFailure.jobId}`,
        });
        logRuntimeInfo("after preparing video playback", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          videoPath: result.videoPath,
          playbackPath,
        });

        const thumbnailPath = await generateThumbnail(helperClient, {
          jobId: `thumbnail-${commandOrFailure.jobId}`,
          videoPath: playbackPath,
          outputPath: createVideoPosterArtifactPath(
            commandOrFailure.jobId.replace(/^ingest-/, ""),
            result.title,
          ),
          tempDir: commandOrFailure.tempDir,
        });

        const video = createYoutubeVideoAsset({
          jobId: commandOrFailure.jobId,
          url: commandOrFailure.url,
          provider: commandOrFailure.sourceKind,
          videoPath: playbackPath,
          title: result.title,
          durationSeconds: probeResult.durationSeconds,
          fileSizeBytes: probeResult.fileSizeBytes,
          thumbnailPath,
          authorName: result.authorName,
          authorUrl: result.authorUrl,
          nowIso: request.nowIso,
        });

        return {
          ok: true,
          job: {
            id: commandOrFailure.jobId,
            sourceKind: video.sourceKind,
            status: "completed",
            progressPercent: 100,
            videoId: video.id,
          },
          video,
          events: helperEvents.map((event: HelperEvent) => ({
            type: "helper_event" as const,
            jobId: commandOrFailure.jobId,
            event,
          })),
        };
      } catch (error) {
        logRuntimeError("after downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          status: "failed",
          outputDir: commandOrFailure.outputDir,
        });
        const classifiedError = classifyDownloadError(error);
        console.error("OpenBrief YouTube import failed", {
          diagnosticMessage: classifiedError.diagnosticMessage,
        });
        const message = classifiedError.userMessage;
        const wasCancelled =
          classifiedError.diagnosticMessage.includes("helper_job_cancelled") ||
          helperClient
            .eventsForJob(commandOrFailure.jobId)
            .some((event) => event.type === "job_cancelled");

        return {
          ok: false,
          job: {
            id: commandOrFailure.jobId,
            sourceKind: commandOrFailure.sourceKind,
            status: wasCancelled ? "cancelled" : "failed",
            progressPercent: 0,
            errorMessage: wasCancelled ? undefined : message,
            errorKind: wasCancelled ? undefined : classifiedError.kind,
            recoveryActions: wasCancelled
              ? undefined
              : classifiedError.recoveryActions,
          },
          events: helperClient.eventsForJob(commandOrFailure.jobId).map((event) => ({
            type: "helper_event" as const,
            jobId: commandOrFailure.jobId,
            event,
          })),
          message,
        };
      }
    },

    async cancelIngestJob(jobId) {
      await helperClient.run({
        protocolVersion: helperProtocolVersion,
        command: "cancel_job",
        jobId: `cancel-${jobId}`,
        targetJobId: jobId,
      });
    },
  };
}

export function createMockIngestService(
  helperClient: HelperClient = new FakeHelperClient(),
): IngestService {
  return {
    async importLocalFile(request) {
      const localPlan = createLocalFileImportPlan(request);
      const importRequest = { ...request, assetId: localPlan.assetId };

      return createLocalFileIngestResult({
        ...importRequest,
        thumbnailPath:
          request.thumbnailPath ??
          createVideoPosterArtifactPath(
            localPlan.assetId,
            request.fileName ?? request.sourcePath,
          ),
      });
    },

    async importYoutubeUrl(request, options = {}) {
      const commandOrFailure = createYoutubeDownloadCommand(request);

      if ("ok" in commandOrFailure) {
        return commandOrFailure;
      }

      try {
        const startedAt = performance.now();
        logRuntimeInfo("before downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          mode: "mock",
          outputDir: commandOrFailure.outputDir,
        });
        const result = await helperClient.run(commandOrFailure, {
          onEvent: options.onEvent,
        });
        const helperEvents = helperClient.eventsForJob(commandOrFailure.jobId);

        if (result.command !== "download_youtube") {
          throw new Error("invalid_helper_result");
        }
        logRuntimeInfo("after downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          mode: "mock",
          status: "downloaded",
          outputDir: commandOrFailure.outputDir,
          videoPath: result.videoPath,
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        const video = createYoutubeVideoAsset({
          jobId: commandOrFailure.jobId,
          url: commandOrFailure.url,
          provider: commandOrFailure.sourceKind,
          videoPath: result.videoPath,
          title: result.title,
          durationSeconds: 120,
          fileSizeBytes: 1048576,
          thumbnailPath: createVideoPosterArtifactPath(
            commandOrFailure.jobId.replace(/^ingest-/, ""),
            result.title,
          ),
          authorName: result.authorName,
          authorUrl: result.authorUrl,
          nowIso: request.nowIso,
        });

        return {
          ok: true,
          job: {
            id: commandOrFailure.jobId,
            sourceKind: video.sourceKind,
            status: "completed",
            progressPercent: 100,
            videoId: video.id,
          },
          video,
          events: helperEvents.map((event: HelperEvent) => ({
            type: "helper_event" as const,
            jobId: commandOrFailure.jobId,
            event,
          })),
        };
      } catch (error) {
        logRuntimeError("after downloading video", {
          jobId: commandOrFailure.jobId,
          provider: commandOrFailure.sourceKind,
          mode: "mock",
          status: "failed",
          outputDir: commandOrFailure.outputDir,
        });
        const classifiedError = classifyDownloadError(error);
        console.error("OpenBrief YouTube import failed", {
          diagnosticMessage: classifiedError.diagnosticMessage,
        });
        const message = classifiedError.userMessage;

        return {
          ok: false,
          job: {
            id: commandOrFailure.jobId,
            sourceKind: commandOrFailure.sourceKind,
            status: "failed",
            progressPercent: 0,
            errorMessage: message,
            errorKind: classifiedError.kind,
            recoveryActions: classifiedError.recoveryActions,
          },
          events: helperClient.eventsForJob(commandOrFailure.jobId).map((event) => ({
            type: "helper_event" as const,
            jobId: commandOrFailure.jobId,
            event,
          })),
          message,
        };
      }
    },

    async cancelIngestJob(jobId) {
      await helperClient.run({
        protocolVersion: helperProtocolVersion,
        command: "cancel_job",
        jobId: `cancel-${jobId}`,
        targetJobId: jobId,
      });
    },
  };
}

async function generateThumbnail(
  helperClient: HelperClient,
  request: {
    jobId: string;
    videoPath: string;
    outputPath: string;
    tempDir: string;
  },
) {
  try {
    const result = await helperClient.run({
      protocolVersion: helperProtocolVersion,
      command: "extract_thumbnail",
      ...request,
    });

    return result.command === "extract_thumbnail" ? result.thumbnailPath : undefined;
  } catch {
    return undefined;
  }
}

async function ensureWebviewPlayableVideo(
  helperClient: HelperClient,
  request: {
    sourcePath: string;
    probeResult: ProbeMediaResult;
    outputPath: string;
    tempDir: string;
    jobId: string;
  },
) {
  if (isWebviewPlayableProbe(request.probeResult)) {
    return request.sourcePath;
  }

  const result = await helperClient.run({
    protocolVersion: helperProtocolVersion,
    command: "transcode_video",
    jobId: request.jobId,
    videoPath: request.sourcePath,
    outputPath: request.outputPath,
    tempDir: request.tempDir,
  });

  if (result.command !== "transcode_video") {
    throw new Error("invalid_transcode_result");
  }

  return result.videoPath;
}

function isWebviewPlayableProbe(probeResult: ProbeMediaResult) {
  const container = probeResult.container.toLowerCase();
  const videoCodec = probeResult.videoCodec?.toLowerCase();
  const audioCodec = probeResult.audioCodec?.toLowerCase();
  const isMp4Container =
    container.includes("mp4") ||
    container.includes("mov") ||
    container.includes("m4v");

  return (
    isMp4Container &&
    videoCodec === "h264" &&
    (!audioCodec || audioCodec === "aac" || audioCodec === "mp3")
  );
}

function siblingPlaybackPath(sourcePath: string) {
  const segments = sourcePath.split("/");

  if (segments.length <= 1) {
    return "playback.mp4";
  }

  return [...segments.slice(0, -1), "playback.mp4"].join("/");
}
