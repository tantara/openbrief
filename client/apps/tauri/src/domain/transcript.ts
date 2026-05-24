import {
  helperProtocolVersion,
  type ExtractAudioCommand,
  type ExtractCaptionsCommand,
  type HelperEvent,
  type ListCaptionsCommand,
  type TranscribeAudioCommand,
} from "@/domain/helper-protocol";
import {
  createLibraryAssetDirectory,
  createVideoAudioArtifactPath,
  createVideoTranscriptArtifactDirectory,
  createVideoTranscriptJsonArtifactPath,
  type TranscriptJob,
  type TranscriptSegment,
  type TranscriptSourceKind,
  type VideoAsset,
} from "@/domain/media-library";

export type TranscriptPipelineRequest = {
  video: VideoAsset;
  languages?: string[];
  whisperModelPath?: string;
  whisperLanguage?: string;
  sourcePreference?: TranscriptSourceKind;
};

export type TranscriptPipelineEvent =
  | {
      type: "helper_event";
      jobId: string;
      event: HelperEvent;
    }
  | {
      type: "transcript_source_selected";
      jobId: string;
      sourceKind: TranscriptSourceKind;
    };

export type TranscriptPipelineSuccess = {
  ok: true;
  job: TranscriptJob;
  segments: TranscriptSegment[];
  events: TranscriptPipelineEvent[];
};

export type TranscriptPipelineFailure = {
  ok: false;
  job: TranscriptJob;
  events: TranscriptPipelineEvent[];
  message: string;
};

export type TranscriptPipelineResult =
  | TranscriptPipelineSuccess
  | TranscriptPipelineFailure;

export function createCaptionExtractionCommand(
  request: TranscriptPipelineRequest,
): ExtractCaptionsCommand {
  const sourceUrl =
    request.video.sourceKind === "local-file" ? undefined : request.video.originalUri;

  return {
    protocolVersion: helperProtocolVersion,
    command: "extract_captions",
    jobId: createTranscriptJobId(request.video.id, "captions"),
    videoPath: request.video.libraryPath,
    ...(sourceUrl ? { sourceUrl } : {}),
    outputDir: createVideoTranscriptArtifactDirectory(request.video.id),
    languages: request.languages ?? ["en"],
  };
}

export function createCaptionLanguageListCommand(
  request: TranscriptPipelineRequest,
): ListCaptionsCommand | undefined {
  if (request.video.sourceKind === "local-file" || !request.video.originalUri) {
    return undefined;
  }

  return {
    protocolVersion: helperProtocolVersion,
    command: "list_captions",
    jobId: createTranscriptJobId(request.video.id, "caption-languages"),
    sourceUrl: request.video.originalUri,
  };
}

export function createAudioExtractionCommand(
  request: TranscriptPipelineRequest,
): ExtractAudioCommand {
  return {
    protocolVersion: helperProtocolVersion,
    command: "extract_audio",
    jobId: createTranscriptJobId(request.video.id, "audio"),
    videoPath: request.video.libraryPath,
    outputPath: createVideoAudioArtifactPath(
      request.video.id,
      request.video.originalFileName ?? request.video.title,
    ),
    tempDir: createLibraryAssetDirectory("job-temp", request.video.id),
  };
}

export function createTranscribeAudioCommand({
  request,
  audioPath,
}: {
  request: TranscriptPipelineRequest;
  audioPath: string;
}): TranscribeAudioCommand {
  const requestedModelPath = request.whisperModelPath ?? "models/whisper-small-default.bin";
  const prefersParakeet = requestedModelPath.includes("fluidaudio/parakeet-tdt-0.6b-v3");
  const qwenAsrModelId = qwenAsrModelIdForPath(requestedModelPath);
  const language = request.whisperLanguage ?? request.languages?.[0] ?? "en";

  return {
    protocolVersion: helperProtocolVersion,
    command: "transcribe_audio",
    jobId: createTranscriptJobId(request.video.id, "stt"),
    audioPath,
    enginePreference: qwenAsrModelId ? "qwen3-asr" : "auto",
    ...(prefersParakeet ? { modelId: "parakeet-tdt-0.6b-v3" } : {}),
    ...(qwenAsrModelId ? { modelId: qwenAsrModelId } : {}),
    modelPath: prefersParakeet ? "models/ggml-small.bin" : requestedModelPath,
    outputPath: createVideoTranscriptJsonArtifactPath(request.video.id),
    ...(language ? { language } : {}),
  };
}

function qwenAsrModelIdForPath(modelPath: string) {
  if (modelPath.includes("voicebox/qwen3-asr-1.7B")) {
    return "qwen3-asr-1.7B";
  }
  if (modelPath.includes("voicebox/qwen3-asr-0.6B")) {
    return "qwen3-asr-0.6B";
  }
  return undefined;
}

export function createCompletedTranscriptJob({
  videoId,
  sourceKind,
  transcriptPath,
}: {
  videoId: string;
  sourceKind: TranscriptSourceKind;
  transcriptPath?: string;
}): TranscriptJob {
  return {
    id: createTranscriptJobId(videoId, "pipeline"),
    videoId,
    status: "completed",
    preferredSource: sourceKind,
    progressPercent: 100,
    transcriptPath,
  };
}

export function createFailedTranscriptJob({
  videoId,
  preferredSource,
  message,
}: {
  videoId: string;
  preferredSource: TranscriptSourceKind;
  message: string;
}): TranscriptJob {
  return {
    id: createTranscriptJobId(videoId, "pipeline"),
    videoId,
    status: "failed",
    preferredSource,
    progressPercent: 0,
    errorMessage: message,
  };
}

export function normalizeTranscriptLines(
  lines: string[],
  sourceKind: TranscriptSourceKind,
): TranscriptSegment[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${sourceKind}-${index + 1}`,
      startSeconds: index * 30,
      endSeconds: index * 30 + 24,
      text,
      sourceKind,
    }));
}

export function createDefaultTranscriptSegments(
  video: VideoAsset,
  sourceKind: TranscriptSourceKind,
): TranscriptSegment[] {
  return normalizeTranscriptLines(
    [
      `${video.title} introduction and main context.`,
      "Key details are normalized into timestamped transcript segments.",
      "The transcript is ready for summary and chat context.",
    ],
    sourceKind,
  );
}

export function createTranscriptJobId(videoId: string, step: string) {
  return `transcript-${videoId}-${step}`;
}
