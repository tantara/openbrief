import type {
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type { TranscriptVariant } from "@/domain/transcript-actions";
import type {
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
} from "@/services/ttsSettingsService";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { formatTranscriptSegment } from "@/domain/summary";

export type PodcastOutputMode = "podcast-summary" | "audiobook-brief";
export type PodcastLengthMode = "short" | "default" | "long";
export type PodcastSourceKind =
  | "current-summary"
  | "transcript"
  | "active-transcript-translation";
export type PodcastSpeakerId = "A" | "B";
export type PodcastGenerationStage = "script" | "tts" | "complete";

export type PodcastSpeakerConfig = {
  id: PodcastSpeakerId;
  label: string;
  voiceStyleId: SupertonicVoiceStyleId;
};

export type PodcastScriptTurn = {
  id: string;
  speakerId: PodcastSpeakerId;
  speakerLabel: string;
  text: string;
  anchor?: {
    startSeconds?: number;
    endSeconds?: number;
    pageStart?: number;
    pageEnd?: number;
  };
};

export type PodcastScriptDocument = {
  title: string;
  description?: string;
  turns: PodcastScriptTurn[];
  markdown: string;
};

export type PodcastArtifactPaths = {
  rootDirectory: string;
  manifestPath: string;
  scriptPath: string;
  podcastAudioPath: string;
  turnAudioDirectory: string;
};

export type PodcastTurnTiming = {
  turnId: string;
  audioPath: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type PodcastDocument = {
  schemaVersion: 1;
  id: string;
  sourceAssetId: string;
  mode: PodcastOutputMode;
  sourceKind: PodcastSourceKind;
  lengthMode: PodcastLengthMode;
  outputLanguage?: string;
  provider: ProviderKind;
  model?: string;
  createdAtIso: string;
  script: PodcastScriptDocument;
  tts: {
    modelId: TtsModelId;
    languageCode: TtsLanguageCode;
    speakers: PodcastSpeakerConfig[];
  };
  artifacts: PodcastArtifactPaths & {
    turnAudioPaths: string[];
  };
  durationSeconds?: number;
  sizeBytes?: number;
  turnTimings?: PodcastTurnTiming[];
  sourceSummaryId?: string;
  sourceTranscriptVariantId?: string;
};

export type PodcastGenerationJob = {
  videoId: string;
  status: "running" | "failed";
  stage: PodcastGenerationStage;
  provider: ProviderKind;
  model?: string;
  errorMessage?: string;
};

export type CreatePodcastScriptPromptRequest = {
  video: VideoAsset;
  sourceKind: PodcastSourceKind;
  summary?: SummaryDocument;
  transcript: TranscriptSegment[];
  transcriptVariant?: TranscriptVariant;
  mode: PodcastOutputMode;
  lengthMode: PodcastLengthMode;
  outputLanguage?: string;
  speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig];
};

const podcastDirectoryBySourceType = {
  video: "videos",
  audio: "audios",
  pdf: "pdfs",
} as const;

const lengthGuidance: Record<PodcastLengthMode, string> = {
  short: "6 to 8 concise turns, about 3 to 5 minutes",
  default: "14 to 18 focused turns, about 8 to 10 minutes",
  long: "24 to 32 detailed turns, about 15 to 20 minutes",
};

export function createPodcastId(
  assetId: string,
  nowIso = new Date().toISOString(),
) {
  return `podcast-${sanitizePathSegment(assetId)}-${sanitizePathSegment(nowIso)}`;
}

export function createPodcastArtifactPaths(
  asset: VideoAsset,
  podcastId: string,
): PodcastArtifactPaths {
  const directory =
    podcastDirectoryBySourceType[mediaSourceTypeForAsset(asset)];
  const rootDirectory = `${directory}/${sanitizePathSegment(asset.id)}/podcast/${sanitizePathSegment(podcastId)}`;

  return {
    rootDirectory,
    manifestPath: `${rootDirectory}/podcast.json`,
    scriptPath: `${rootDirectory}/script.md`,
    turnAudioDirectory: `${rootDirectory}/audio/turns`,
    podcastAudioPath: `${rootDirectory}/audio/podcast.wav`,
  };
}

export function createPodcastScriptPrompt({
  video,
  sourceKind,
  summary,
  transcript,
  transcriptVariant,
  mode,
  lengthMode,
  outputLanguage,
  speakers,
}: CreatePodcastScriptPromptRequest) {
  const sourceLabel = podcastSourceLabel(sourceKind);
  const sourceText = podcastSourceText({
    sourceKind,
    summary,
    transcript,
    transcriptVariant,
  });

  return {
    systemPrompt: [
      "You write two-speaker podcast scripts for OpenBrief.",
      "Return only valid JSON. Do not include markdown fences.",
      "Keep every turn suitable for text-to-speech and avoid stage directions.",
    ].join("\n"),
    userPrompt: [
      `Create a ${mode === "podcast-summary" ? "conversational podcast summary" : "calm audiobook brief"}.`,
      `Title: ${video.title}`,
      `Source type: ${mediaSourceTypeForAsset(video)}`,
      `Source: ${sourceLabel}`,
      `Length: ${lengthGuidance[lengthMode]}`,
      outputLanguage
        ? `Output language: ${outputLanguage}`
        : "Output language: match the source.",
      `Speaker A: ${speakers[0].label}`,
      `Speaker B: ${speakers[1].label}`,
      "",
      "Return JSON with this exact shape:",
      '{"title":"...","description":"...","turns":[{"speakerId":"A","text":"...","anchor":{"startSeconds":0}}]}',
      "",
      "Source material:",
      sourceText,
    ].join("\n"),
  };
}

export function parsePodcastScriptJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("podcast_script_json_missing");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export function validatePodcastScriptResponse(
  value: unknown,
  request: Pick<CreatePodcastScriptPromptRequest, "video" | "speakers">,
): PodcastScriptDocument {
  if (!isRecord(value)) {
    throw new Error("podcast_script_invalid");
  }

  const rawTurns = Array.isArray(value.turns) ? value.turns : [];
  if (rawTurns.length < 4) {
    throw new Error("podcast_script_too_short");
  }

  const speakers = new Map(
    request.speakers.map((speaker) => [speaker.id, speaker]),
  );
  const turns = rawTurns.map((turn, index) => {
    if (!isRecord(turn)) {
      throw new Error("podcast_turn_invalid");
    }

    if (turn.speakerId !== "A" && turn.speakerId !== "B") {
      throw new Error("podcast_turn_speaker_invalid");
    }
    const speakerId: PodcastSpeakerId = turn.speakerId;

    const text = typeof turn.text === "string" ? turn.text.trim() : "";
    if (!text) {
      throw new Error("podcast_turn_text_empty");
    }
    if (text.length > 1200) {
      throw new Error("podcast_turn_text_too_long");
    }

    const anchor = normalizePodcastAnchor(turn.anchor, request.video);

    return {
      id: `turn-${String(index + 1).padStart(4, "0")}`,
      speakerId,
      speakerLabel: speakers.get(speakerId)?.label ?? `Speaker ${speakerId}`,
      text,
      ...(anchor ? { anchor } : {}),
    };
  });

  return {
    title: stringOrDefault(value.title, `${request.video.title} podcast`),
    description:
      typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : undefined,
    turns,
    markdown: createPodcastScriptMarkdown({
      title: stringOrDefault(value.title, `${request.video.title} podcast`),
      turns,
    }),
  };
}

export function createPodcastDocument({
  video,
  id = createPodcastId(video.id),
  mode,
  sourceKind,
  lengthMode,
  outputLanguage,
  provider,
  model,
  script,
  tts,
  artifacts,
  durationSeconds,
  sizeBytes,
  turnTimings,
  sourceSummaryId,
  sourceTranscriptVariantId,
  nowIso = new Date().toISOString(),
}: {
  video: VideoAsset;
  id?: string;
  mode: PodcastOutputMode;
  sourceKind: PodcastSourceKind;
  lengthMode: PodcastLengthMode;
  outputLanguage?: string;
  provider: ProviderKind;
  model?: string;
  script: PodcastScriptDocument;
  tts: PodcastDocument["tts"];
  artifacts?: PodcastDocument["artifacts"];
  durationSeconds?: number;
  sizeBytes?: number;
  turnTimings?: PodcastTurnTiming[];
  sourceSummaryId?: string;
  sourceTranscriptVariantId?: string;
  nowIso?: string;
}): PodcastDocument {
  const paths = createPodcastArtifactPaths(video, id);

  return {
    schemaVersion: 1,
    id,
    sourceAssetId: video.id,
    mode,
    sourceKind,
    lengthMode,
    outputLanguage,
    provider,
    model,
    createdAtIso: nowIso,
    script,
    tts,
    artifacts: artifacts ?? {
      ...paths,
      turnAudioPaths: script.turns.map(
        (turn, index) =>
          `${paths.turnAudioDirectory}/${turnAudioFileName(index, turn.speakerId)}`,
      ),
    },
    durationSeconds,
    sizeBytes,
    turnTimings,
    sourceSummaryId,
    sourceTranscriptVariantId,
  };
}

export function createPodcastScriptMarkdown({
  title,
  turns,
}: Pick<PodcastScriptDocument, "title" | "turns">) {
  return (
    [
      `# ${title}`,
      "",
      ...turns.flatMap((turn) => [
        `**${turn.speakerLabel}**`,
        "",
        turn.text,
        "",
      ]),
    ]
      .join("\n")
      .trimEnd() + "\n"
  );
}

export function turnAudioFileName(index: number, speakerId: PodcastSpeakerId) {
  return `${String(index + 1).padStart(4, "0")}-speaker-${speakerId.toLowerCase()}.wav`;
}

function podcastSourceLabel(sourceKind: PodcastSourceKind) {
  switch (sourceKind) {
    case "current-summary":
      return "current summary";
    case "active-transcript-translation":
      return "active transcript translation";
    case "transcript":
      return "source transcript";
  }
}

function podcastSourceText({
  sourceKind,
  summary,
  transcript,
  transcriptVariant,
}: Pick<
  CreatePodcastScriptPromptRequest,
  "sourceKind" | "summary" | "transcript" | "transcriptVariant"
>) {
  if (sourceKind === "current-summary" && summary?.markdown) {
    return summary.markdown;
  }

  const segments =
    sourceKind === "active-transcript-translation" && transcriptVariant
      ? transcriptVariant.segments
      : transcript;

  return segments.map(formatTranscriptSegment).join("\n");
}

function normalizePodcastAnchor(anchor: unknown, video: VideoAsset) {
  if (!isRecord(anchor)) return undefined;

  const startSeconds = numberOrUndefined(anchor.startSeconds);
  const endSeconds = numberOrUndefined(anchor.endSeconds);
  const pageStart = numberOrUndefined(anchor.pageStart);
  const pageEnd = numberOrUndefined(anchor.pageEnd);
  const normalized = {
    ...(isValidSeconds(startSeconds, video.durationSeconds)
      ? { startSeconds }
      : {}),
    ...(isValidSeconds(endSeconds, video.durationSeconds)
      ? { endSeconds }
      : {}),
    ...(isValidPage(pageStart, video.pageCount) ? { pageStart } : {}),
    ...(isValidPage(pageEnd, video.pageCount) ? { pageEnd } : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isValidSeconds(value: number | undefined, durationSeconds?: number) {
  return (
    typeof value === "number" &&
    value >= 0 &&
    (typeof durationSeconds !== "number" || value <= durationSeconds)
  );
}

function isValidPage(value: number | undefined, pageCount?: number) {
  if (typeof value !== "number") return false;

  return (
    Number.isInteger(value) &&
    value >= 1 &&
    (typeof pageCount !== "number" || value <= pageCount)
  );
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sanitizePathSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "item"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
