import type {
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { formatTranscriptSegment } from "@/domain/summary";

export type QuizMode = "multiple-choice" | "flash-card";

export type QuizAnchor = {
  startSeconds?: number;
  endSeconds?: number;
  pageStart?: number;
  pageEnd?: number;
};

export type MultipleChoiceQuizItem = {
  id: string;
  type: "multiple-choice";
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
  anchor?: QuizAnchor;
};

export type FlashCardQuizItem = {
  id: string;
  type: "flash-card";
  front: string;
  back: string;
  explanation?: string;
  anchor?: QuizAnchor;
};

export type QuizItem = MultipleChoiceQuizItem | FlashCardQuizItem;

export type QuizDocument = {
  schemaVersion: 1;
  id: string;
  sourceAssetId: string;
  mode: QuizMode;
  questionCount: number;
  areaOfInterest: string;
  provider: ProviderKind;
  model?: string;
  createdAtIso: string;
  title: string;
  description?: string;
  items: QuizItem[];
  artifactPath: string;
  sourceSummaryId?: string;
};

export type QuizGenerationJob = {
  videoId: string;
  status: "running" | "failed";
  provider: ProviderKind;
  model?: string;
  errorMessage?: string;
};

export type CreateQuizPromptRequest = {
  video: VideoAsset;
  transcript: TranscriptSegment[];
  summary?: SummaryDocument;
  mode: QuizMode;
  questionCount: number;
  areaOfInterest: string;
  systemPromptOverride?: string;
};

const quizDirectoryBySourceType = {
  video: "videos",
  audio: "audios",
  pdf: "pdfs",
  csv: "csvs",
} as const;

export const DEFAULT_QUIZ_SYSTEM_PROMPT = [
  "You create grounded study quizzes for OpenBrief.",
  "Return only valid JSON. Do not include markdown fences.",
  "Use only the supplied source material. Do not invent facts.",
  "If no specific area of interest is provided, create the strongest general quiz you can from the source.",
  "For general quizzes, cover the most important concepts, relationships, examples, and practical takeaways with a balanced spread across the material.",
  "When possible, include anchors with startSeconds/endSeconds for audio or video, or pageStart/pageEnd for PDFs.",
].join("\n");

export const DEFAULT_QUIZ_AREA_OF_INTEREST =
  "general quiz covering the most important ideas";

export function createQuizId(
  assetId: string,
  nowIso = new Date().toISOString(),
) {
  return `quiz-${sanitizePathSegment(assetId)}-${sanitizePathSegment(nowIso)}`;
}

export function createQuizArtifactPath(asset: VideoAsset, quizId: string) {
  const directory = quizDirectoryBySourceType[mediaSourceTypeForAsset(asset)];
  return `${directory}/${sanitizePathSegment(asset.id)}/quiz/${sanitizePathSegment(quizId)}/quiz.json`;
}

export function createQuizPrompt({
  video,
  transcript,
  summary,
  mode,
  questionCount,
  areaOfInterest,
  systemPromptOverride,
}: CreateQuizPromptRequest) {
  return {
    systemPrompt: systemPromptOverride?.trim() || DEFAULT_QUIZ_SYSTEM_PROMPT,
    userPrompt: [
      `Create a ${quizModeLabel(mode)} quiz.`,
      `Title: ${video.title}`,
      `Source type: ${mediaSourceTypeForAsset(video)}`,
      `Question count: ${questionCount}`,
      `Area of interest: ${normalizeQuizAreaOfInterest(areaOfInterest)}`,
      "",
      "Return JSON with this exact shape:",
      quizJsonShape(mode),
      "",
      summary?.markdown ? "Current summary:" : "",
      summary?.markdown ?? "",
      "",
      "Transcript:",
      transcript.map(formatTranscriptSegment).join("\n"),
    ]
      .filter((line, index, lines) => line || lines[index - 1] !== "")
      .join("\n"),
  };
}

export function parseQuizJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("quiz_json_missing");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export function validateQuizResponse(
  value: unknown,
  request: Pick<
    CreateQuizPromptRequest,
    "video" | "mode" | "questionCount" | "areaOfInterest"
  >,
): Pick<QuizDocument, "title" | "description" | "items"> {
  if (!isRecord(value)) {
    throw new Error("quiz_invalid");
  }

  const rawItems = Array.isArray(value.items) ? value.items : [];
  if (rawItems.length === 0) {
    throw new Error("quiz_empty");
  }

  const requestedCount = normalizeQuestionCount(request.questionCount);
  const items = rawItems.slice(0, requestedCount).map((item, index) => {
    if (!isRecord(item)) {
      throw new Error("quiz_item_invalid");
    }

    return request.mode === "multiple-choice"
      ? normalizeMultipleChoiceItem(item, index, request.video)
      : normalizeFlashCardItem(item, index, request.video);
  });

  return {
    title: stringOrDefault(value.title, `${request.video.title} quiz`),
    description:
      typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : undefined,
    items,
  };
}

export function createQuizDocument({
  video,
  id = createQuizId(video.id),
  mode,
  questionCount,
  areaOfInterest,
  provider,
  model,
  quiz,
  sourceSummaryId,
  nowIso = new Date().toISOString(),
}: {
  video: VideoAsset;
  id?: string;
  mode: QuizMode;
  questionCount: number;
  areaOfInterest: string;
  provider: ProviderKind;
  model?: string;
  quiz: Pick<QuizDocument, "title" | "description" | "items">;
  sourceSummaryId?: string;
  nowIso?: string;
}): QuizDocument {
  return {
    schemaVersion: 1,
    id,
    sourceAssetId: video.id,
    mode,
    questionCount: normalizeQuestionCount(questionCount),
    areaOfInterest: areaOfInterest.trim(),
    provider,
    model,
    createdAtIso: nowIso,
    title: quiz.title,
    description: quiz.description,
    items: quiz.items,
    artifactPath: createQuizArtifactPath(video, id),
    sourceSummaryId,
  };
}

export function normalizeQuestionCount(value: number) {
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function normalizeMultipleChoiceItem(
  item: Record<string, unknown>,
  index: number,
  video: VideoAsset,
): MultipleChoiceQuizItem {
  const question = stringOrDefault(item.question, "");
  const options = Array.isArray(item.options)
    ? item.options
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const correctOptionIndex =
    typeof item.correctOptionIndex === "number" &&
    Number.isInteger(item.correctOptionIndex)
      ? item.correctOptionIndex
      : -1;

  if (!question || options.length < 2 || !options[correctOptionIndex]) {
    throw new Error("quiz_multiple_choice_invalid");
  }

  const explanation = optionalString(item.explanation);
  const anchor = normalizeQuizAnchor(item.anchor, video);

  return {
    id: `question-${String(index + 1).padStart(4, "0")}`,
    type: "multiple-choice",
    question,
    options,
    correctOptionIndex,
    ...(explanation ? { explanation } : {}),
    ...(anchor ? { anchor } : {}),
  };
}

function normalizeFlashCardItem(
  item: Record<string, unknown>,
  index: number,
  video: VideoAsset,
): FlashCardQuizItem {
  const front = stringOrDefault(item.front, "");
  const back = stringOrDefault(item.back, "");

  if (!front || !back) {
    throw new Error("quiz_flash_card_invalid");
  }

  const explanation = optionalString(item.explanation);
  const anchor = normalizeQuizAnchor(item.anchor, video);

  return {
    id: `question-${String(index + 1).padStart(4, "0")}`,
    type: "flash-card",
    front,
    back,
    ...(explanation ? { explanation } : {}),
    ...(anchor ? { anchor } : {}),
  };
}

function quizJsonShape(mode: QuizMode) {
  if (mode === "flash-card") {
    return '{"title":"...","description":"...","items":[{"front":"...","back":"...","explanation":"...","anchor":{"startSeconds":0}}]}';
  }

  return '{"title":"...","description":"...","items":[{"question":"...","options":["...","...","...","..."],"correctOptionIndex":0,"explanation":"...","anchor":{"startSeconds":0}}]}';
}

function quizModeLabel(mode: QuizMode) {
  return mode === "flash-card" ? "flash card" : "multiple choice";
}

function normalizeQuizAreaOfInterest(areaOfInterest: string) {
  return areaOfInterest.trim() || DEFAULT_QUIZ_AREA_OF_INTEREST;
}

function normalizeQuizAnchor(anchor: unknown, video: VideoAsset) {
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

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
