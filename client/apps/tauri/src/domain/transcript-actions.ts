import type {
  ProviderKind,
  TranscriptSegment,
  TranscriptSourceKind,
  VideoAsset,
} from "@/domain/media-library";
import { createMediaAssetFilePrefix, sanitizePathSegment } from "@/domain/media-library";
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
  "Every output line must echo the input segment id and start timestamp exactly.",
  "Do not translate, reformat, infer, renumber, remove, merge, or shift timestamps.",
  "Keep each translation inside its original segment boundary even when the target language changes word order.",
  "Do not summarize, explain, merge segments, add new lines, or add commentary.",
  "Preserve names, numbers, technical terms, and source intent.",
  "Keep output compact: one line per input segment, using the same segment id and timestamp.",
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
      "segment_id<TAB>start_timestamp<TAB>translated_text",
      "The start_timestamp column must match the matching input segment exactly.",
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

    const [id, ...columns] = trimmed.split("\t");
    const textParts =
      columns.length > 1 && isTranscriptTimestamp(columns[0]?.trim())
        ? columns.slice(1)
        : columns;
    const text = textParts.join("\t").trim();
    if (id && text) {
      textById.set(id.trim(), text);
    }
  }

  return textById;
}

export function parseTimestampAlignedTranscriptSegmentTsv(
  providerText: string,
  expectedSegments: TranscriptSegment[],
) {
  const expectedTimestampById = new Map(
    expectedSegments.map((segment) => [
      segment.id,
      formatTimestamp(segment.startSeconds),
    ]),
  );
  const textById = new Map<string, string>();

  for (const line of providerText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [rawId, rawTimestamp, ...textParts] = trimmed.split("\t");
    const id = rawId?.trim();
    const timestamp = rawTimestamp?.trim();
    const expectedTimestamp = id ? expectedTimestampById.get(id) : undefined;

    if (
      !id ||
      !expectedTimestamp ||
      timestamp !== expectedTimestamp ||
      textParts.length === 0
    ) {
      continue;
    }

    const text = textParts.join("\t").trim();
    if (text) {
      textById.set(id, text);
    }
  }

  return textById;
}

function isTranscriptTimestamp(value: string | undefined) {
  return /^\d+:\d{2}(?::\d{2})?$/.test(value ?? "");
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
    artifactPath: createTranscriptArtifactPath(video, suffix, id),
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
  const id = `transcript-${video.id}-${sanitizePathSegment(suffix)}`;

  return {
    id,
    videoId: video.id,
    kind: "source",
    sourceKind,
    languageLabel: transcriptSourceKindLabel(sourceKind),
    segments,
    artifactPath: createTranscriptArtifactPath(video, suffix, id),
    createdAtIso: nowIso,
  };
}

export function transcriptSourceKindLabel(sourceKind: TranscriptSourceKind) {
  return sourceKind === "youtube-captions"
    ? "Provider captions"
    : "AI transcription";
}

export function createTranscriptArtifactPath(
  video: VideoAsset,
  suffix = "original",
  variantId?: string,
) {
  if (variantId) {
    return `videos/${sanitizePathSegment(video.id)}/transcript/${sanitizePathSegment(
      variantId,
    )}/transcript.txt`;
  }

  const prefix = createMediaAssetFilePrefix(video);

  return `videos/${sanitizePathSegment(video.id)}/transcript/${sanitizePathSegment(
    prefix,
  )}_${sanitizePathSegment(suffix)}.txt`;
}

export function formatTranscriptText(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => `${formatTimestamp(segment.startSeconds)}\t${segment.text}`)
    .join("\n");
}
