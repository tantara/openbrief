import type {
  ProviderKind,
  TranscriptSegment,
  TranscriptSourceKind,
  VideoAsset,
} from "@/domain/media-library";
import { sanitizePathSegment } from "@/domain/media-library";
import { formatTimestamp } from "@/domain/summary";

export type TranscriptTransformKind = "review" | "translation" | "source";

export type TranscriptLanguageOption = {
  code: string;
  label: string;
};

export type TranscriptVariant = {
  id: string;
  videoId: string;
  kind: TranscriptTransformKind;
  languageCode?: string;
  languageLabel?: string;
  provider?: ProviderKind;
  model?: string;
  sourceKind?: TranscriptSourceKind;
  segments: TranscriptSegment[];
  artifactPath: string;
  createdAtIso: string;
};

export type TranscriptTransformPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

export const DEFAULT_TRANSCRIPT_REVIEW_SYSTEM_PROMPT = [
  "You proofread speech-to-text transcript segments.",
  "Return only corrected transcript text in the requested TSV format.",
  "Do not summarize, explain, merge timestamps, add new lines, or add commentary.",
  "Preserve meaning, speaker intent, names, numbers, and terminology from context.",
  "Fix obvious ASR spelling, punctuation, casing, spacing, and word-boundary mistakes.",
  "Keep output compact: one line per input segment, using the same segment id.",
].join("\n");

export const DEFAULT_TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT = [
  "You translate timestamped transcript segments.",
  "Return only translated transcript text in the requested TSV format.",
  "Do not summarize, explain, merge timestamps, add new lines, or add commentary.",
  "Preserve names, numbers, technical terms, and source intent.",
  "Keep output compact: one line per input segment, using the same segment id.",
].join("\n");

export const transcriptTranslationLanguages: TranscriptLanguageOption[] = [
  { code: "ko", label: "Korean" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
];

export function createTranscriptReviewPrompt({
  video,
  segments,
  systemPromptOverride,
}: {
  video: VideoAsset;
  segments: TranscriptSegment[];
  systemPromptOverride?: string;
}): TranscriptTransformPrompt {
  return {
    systemPrompt:
      systemPromptOverride?.trim() || DEFAULT_TRANSCRIPT_REVIEW_SYSTEM_PROMPT,
    userPrompt: [
      `VIDEO_TITLE: ${video.title}`,
      `VIDEO_ID: ${video.id}`,
      "",
      "Output format:",
      "segment_id<TAB>corrected_text",
      "",
      "TRANSCRIPT_SEGMENTS:",
      ...segments.map((segment) =>
        [
          segment.id,
          formatTimestamp(segment.startSeconds),
          segment.text.replace(/\s+/g, " ").trim(),
        ].join("\t"),
      ),
    ].join("\n"),
  };
}

export function createTranscriptTranslationPrompt({
  video,
  segments,
  language,
  systemPromptOverride,
}: {
  video: VideoAsset;
  segments: TranscriptSegment[];
  language: TranscriptLanguageOption;
  systemPromptOverride?: string;
}): TranscriptTransformPrompt {
  return {
    systemPrompt:
      systemPromptOverride?.trim() || DEFAULT_TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT,
    userPrompt: [
      `VIDEO_TITLE: ${video.title}`,
      `VIDEO_ID: ${video.id}`,
      `TARGET_LANGUAGE: ${language.label} (${language.code})`,
      "",
      "Output format:",
      "segment_id<TAB>translated_text",
      "",
      "TRANSCRIPT_SEGMENTS:",
      ...segments.map((segment) =>
        [
          segment.id,
          formatTimestamp(segment.startSeconds),
          segment.text.replace(/\s+/g, " ").trim(),
        ].join("\t"),
      ),
    ].join("\n"),
  };
}

export function applyTranscriptTextBySegmentId(
  segments: TranscriptSegment[],
  providerText: string,
) {
  const textById = parseTranscriptSegmentTsv(providerText);

  return segments.map((segment) => ({
    ...segment,
    text: textById.get(segment.id)?.trim() || segment.text,
  }));
}

export function parseTranscriptSegmentTsv(providerText: string) {
  const textById = new Map<string, string>();

  for (const line of providerText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [id, ...textParts] = trimmed.split("\t");
    const text = textParts.join("\t").trim();
    if (id && text) {
      textById.set(id.trim(), text);
    }
  }

  return textById;
}

export function applyTranscriptTextMapBySegmentId(
  segments: TranscriptSegment[],
  textById: Map<string, string>,
) {
  return segments.map((segment) => ({
    ...segment,
    text: textById.get(segment.id)?.trim() || segment.text,
  }));
}

export function findFirstMissingTranscriptSegmentIndex(
  segments: TranscriptSegment[],
  textById: Map<string, string>,
) {
  const missingIndex = segments.findIndex(
    (segment) => !textById.get(segment.id)?.trim(),
  );

  return missingIndex < 0 ? segments.length : missingIndex;
}

export function createTranscriptVariant({
  video,
  kind,
  language,
  provider,
  model,
  segments,
  nowIso = new Date().toISOString(),
}: {
  video: VideoAsset;
  kind: TranscriptTransformKind;
  language?: TranscriptLanguageOption;
  provider: ProviderKind;
  model?: string;
  segments: TranscriptSegment[];
  nowIso?: string;
}): TranscriptVariant {
  const suffix = kind === "translation" && language ? language.code : "reviewed";
  const id = `transcript-${video.id}-${sanitizePathSegment(suffix)}-${sanitizePathSegment(nowIso)}`;

  return {
    id,
    videoId: video.id,
    kind,
    languageCode: language?.code,
    languageLabel: language?.label,
    provider,
    model,
    segments,
    artifactPath: createTranscriptArtifactPath(video, suffix),
    createdAtIso: nowIso,
  };
}

export function createTranscriptSourceVariant({
  video,
  sourceKind,
  segments,
  nowIso = new Date().toISOString(),
}: {
  video: VideoAsset;
  sourceKind: TranscriptSourceKind;
  segments: TranscriptSegment[];
  nowIso?: string;
}): TranscriptVariant {
  const suffix = sourceKind;

  return {
    id: `transcript-${video.id}-${sanitizePathSegment(suffix)}`,
    videoId: video.id,
    kind: "source",
    sourceKind,
    languageLabel: transcriptSourceKindLabel(sourceKind),
    segments,
    artifactPath: createTranscriptArtifactPath(video, suffix),
    createdAtIso: nowIso,
  };
}

export function transcriptSourceKindLabel(sourceKind: TranscriptSourceKind) {
  return sourceKind === "youtube-captions"
    ? "Provider captions"
    : "Whisper transcription";
}

export function createTranscriptArtifactPath(video: VideoAsset, suffix = "original") {
  return `videos/${sanitizePathSegment(video.id)}/transcript/${sanitizePathSegment(
    video.title,
  )}_${sanitizePathSegment(suffix)}.txt`;
}

export function formatTranscriptText(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => `${formatTimestamp(segment.startSeconds)}\t${segment.text}`)
    .join("\n");
}
