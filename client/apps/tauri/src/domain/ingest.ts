import {
  classifyVideoProviderUrl,
  helperProtocolVersion,
  type DownloadYoutubeCommand,
  type HelperEvent,
} from "@/domain/helper-protocol";
import {
  createLibraryAssetDirectory,
  createLibraryRelativePath,
  type LibraryDirectory,
  sanitizePathSegment,
  type IngestJob,
  type MediaSourceType,
  type VideoAsset,
  type VideoProviderKind,
} from "@/domain/media-library";

export const supportedVideoFileExtensions = ["mp4", "m4v", "mov", "webm", "mkv"] as const;
export const supportedAudioFileExtensions = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"] as const;
export const supportedPdfFileExtensions = ["pdf"] as const;

export type LocalFileImportRequest = {
  sourcePath: string;
  assetId?: string;
  sourceType?: MediaSourceType;
  fileName?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  pageCount?: number;
  thumbnailPath?: string;
  libraryPath?: string;
  nowIso?: string;
};

export type YoutubeImportRequest = {
  url: string;
  nowIso?: string;
};

export type AppManagedCopyPlan = {
  sourcePath: string;
  sourceType: MediaSourceType;
  assetId: string;
  targetRelativePath: string;
  tempRelativePath: string;
  strategy: "copy-into-library";
};

export type IngestPipelineEvent =
  | {
      type: "local_copy_planned";
      jobId: string;
      targetRelativePath: string;
    }
  | {
      type: "helper_event";
      jobId: string;
      event: HelperEvent;
    }
  | {
      type: "ingest_rejected";
      jobId: string;
      reason: string;
    };

export type IngestSuccess = {
  ok: true;
  job: IngestJob;
  video: VideoAsset;
  events: IngestPipelineEvent[];
};

export type IngestFailure = {
  ok: false;
  job: IngestJob;
  events: IngestPipelineEvent[];
  message: string;
};

export type IngestResult = IngestSuccess | IngestFailure;

export function createLocalFileImportPlan(
  request: LocalFileImportRequest,
): AppManagedCopyPlan {
  const fileName = request.fileName ?? fileNameFromPath(request.sourcePath);
  const sourceType = request.sourceType ?? mediaSourceTypeFromFileName(fileName);
  const assetId = request.assetId ?? createUuid();

  return {
    sourcePath: request.sourcePath,
    sourceType,
    assetId,
    targetRelativePath: createLibraryRelativePath(
      libraryDirectoryForMediaSourceType(sourceType),
      assetId,
      fileName,
    ),
    tempRelativePath: createLibraryAssetDirectory("job-temp", assetId),
    strategy: "copy-into-library",
  };
}

export function createLocalFileIngestResult(
  request: LocalFileImportRequest,
): IngestSuccess {
  const plan = createLocalFileImportPlan(request);
  const jobId = `ingest-${plan.assetId}`;
  const nowIso = request.nowIso ?? new Date().toISOString();
  const originalFileName = request.fileName ?? fileNameFromPath(request.sourcePath);

  return {
    ok: true,
    job: {
      id: jobId,
      sourceKind: "local-file",
      status: "completed",
      progressPercent: 100,
      videoId: plan.assetId,
    },
    video: {
      id: plan.assetId,
      title: titleFromFileName(originalFileName),
      sourceType: plan.sourceType,
      sourceKind: "local-file",
      originalUri: request.sourcePath,
      originalFileName,
      libraryPath: request.libraryPath ?? plan.targetRelativePath,
      thumbnailPath: request.thumbnailPath,
      durationSeconds: request.durationSeconds,
      pageCount: request.pageCount,
      fileSizeBytes: request.fileSizeBytes,
      importStatus: "ready",
      createdAtIso: nowIso,
    },
    events: [
      {
        type: "local_copy_planned",
        jobId,
        targetRelativePath: request.libraryPath ?? plan.targetRelativePath,
      },
    ],
  };
}

export function mediaSourceTypeFromFileName(fileName: string): MediaSourceType {
  const extension = fileExtension(fileName);

  if (isSupportedVideoExtension(extension)) return "video";
  if (isSupportedAudioExtension(extension)) return "audio";
  if (isSupportedPdfExtension(extension)) return "pdf";

  throw new Error("local_file_unsupported_extension");
}

export function isSupportedLocalMediaFile(fileName: string) {
  const extension = fileExtension(fileName);

  return (
    isSupportedVideoExtension(extension) ||
    isSupportedAudioExtension(extension) ||
    isSupportedPdfExtension(extension)
  );
}

function libraryDirectoryForMediaSourceType(
  sourceType: MediaSourceType,
): LibraryDirectory {
  switch (sourceType) {
    case "audio":
      return "audios";
    case "pdf":
      return "pdfs";
    case "video":
      return "videos";
  }
}

function isSupportedVideoExtension(extension: string) {
  return supportedVideoFileExtensions.includes(
    extension as typeof supportedVideoFileExtensions[number],
  );
}

function isSupportedAudioExtension(extension: string) {
  return supportedAudioFileExtensions.includes(
    extension as typeof supportedAudioFileExtensions[number],
  );
}

function isSupportedPdfExtension(extension: string) {
  return supportedPdfFileExtensions.includes(
    extension as typeof supportedPdfFileExtensions[number],
  );
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function createYoutubeDownloadCommand(
  request: YoutubeImportRequest,
): DownloadYoutubeCommand | IngestFailure {
  const classification = classifyVideoProviderUrl(request.url);
  const provider =
    classification.kind === "unsupported-provider"
      ? "youtube"
      : (classification.provider ?? "youtube");
  const assetId = createAssetId(
    provider,
    request.nowIso ? `${request.url}-${request.nowIso}` : request.url,
  );
  const jobId = `ingest-${assetId}`;

  if (classification.kind !== "single-video") {
    return {
      ok: false,
      job: {
        id: jobId,
        sourceKind: provider,
        status: "failed",
        progressPercent: 0,
        errorMessage: classification.reason,
      },
      events: [
        {
          type: "ingest_rejected",
          jobId,
          reason: classification.reason,
        },
      ],
      message: classification.reason,
    };
  }

  return {
    protocolVersion: helperProtocolVersion,
    command: "download_youtube",
    jobId,
    url: classification.normalizedUrl,
    sourceKind: classification.provider,
    outputDir: createLibraryAssetDirectory("videos", assetId),
    tempDir: createLibraryAssetDirectory("job-temp", assetId),
    subtitleLanguages: ["en"],
  };
}

export function createYoutubeVideoAsset({
  jobId,
  url,
  provider,
  videoPath,
  title,
  durationSeconds,
  fileSizeBytes,
  thumbnailPath,
  authorName,
  authorUrl,
  nowIso = new Date().toISOString(),
}: {
  jobId: string;
  url: string;
  provider?: VideoProviderKind;
  videoPath: string;
  title: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  thumbnailPath?: string;
  authorName?: string;
  authorUrl?: string;
  nowIso?: string;
}): VideoAsset {
  const normalizedAuthorName = normalizeOptionalText(authorName);

  return {
    id: jobId.replace(/^ingest-/, ""),
    title,
    sourceKind: provider ?? providerForUrl(url),
    originalUri: url,
    originalFileName: fileNameFromPath(videoPath),
    libraryPath: videoPath,
    thumbnailPath,
    durationSeconds,
    fileSizeBytes,
    channelName: normalizedAuthorName,
    authorName: normalizedAuthorName,
    authorUrl: normalizeOptionalText(authorUrl),
    importStatus: "ready",
    createdAtIso: nowIso,
  };
}

function createAssetId(prefix: VideoProviderKind, value: string) {
  return `${prefix}-${sanitizePathSegment(value).slice(0, 64)}`;
}

function createUuid() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return formatUuidHex(hex);
}

function formatUuidHex(hex: string) {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function providerForUrl(url: string): VideoProviderKind {
  const classification = classifyVideoProviderUrl(url);
  return classification.kind === "unsupported-provider"
    ? "youtube"
    : (classification.provider ?? "youtube");
}

function fileNameFromPath(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);

  return segments[segments.length - 1] ?? "video.mp4";
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[-_]+/g, " ");
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
