import type {
  AiTokenUsage,
  ChatMessage,
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import { formatTranscriptSegment } from "@/domain/summary";

export type ChatContextMode = ChatMessage["contextMode"];

export type ChatPrompt = {
  systemPrompt: string;
  userPrompt: string;
  contextMode: ChatContextMode;
};

export const DEFAULT_CHAT_SYSTEM_PROMPT =
  "Answer only from the provided local video context. Say when the context is insufficient.";

export function createChatMessageId({
  videoId,
  role,
  nowIso = new Date().toISOString(),
  randomSegment = createRandomIdSegment(),
}: {
  videoId: string;
  role: ChatMessage["role"];
  nowIso?: string;
  randomSegment?: string;
}) {
  const videoSegment = sanitizeChatMessageTtsPathSegment(videoId).slice(0, 32);
  const parsedTime = Date.parse(nowIso);
  const timeSegment = Number.isFinite(parsedTime)
    ? parsedTime.toString(36)
    : sanitizeChatMessageTtsPathSegment(nowIso).slice(0, 12);
  const safeRandomSegment = sanitizeChatMessageTtsPathSegment(randomSegment)
    .slice(0, 16);

  return [
    "chat",
    role,
    videoSegment,
    timeSegment,
    safeRandomSegment || createRandomIdSegment(),
  ].join("-");
}

export function sanitizeChatMessageTtsPathSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 96);

  return sanitized || "item";
}

export function createChatPrompt({
  video,
  question,
  contextMode,
  summary,
  transcript,
  systemPromptOverride,
}: {
  video: VideoAsset;
  question: string;
  contextMode: ChatContextMode;
  summary?: SummaryDocument;
  transcript: TranscriptSegment[];
  systemPromptOverride?: string;
}): ChatPrompt {
  const context =
    contextMode === "summary"
      ? summary?.markdown ?? "No summary is available yet."
      : transcript.map(formatTranscriptSegment).join("\n");
  const systemPrompt = systemPromptOverride?.trim() || DEFAULT_CHAT_SYSTEM_PROMPT;

  return {
    contextMode,
    systemPrompt,
    userPrompt: [
      `Video title: ${video.title}`,
      `Context mode: ${contextMode}`,
      "",
      "Context:",
      context,
      "",
      `Question: ${question}`,
    ].join("\n"),
  };
}

export function createChatMessage({
  id,
  videoId,
  role,
  content,
  contextMode,
  sessionId = "default",
  provider,
  model,
  tokenUsage,
  nowIso = new Date().toISOString(),
}: {
  id?: string;
  videoId: string;
  role: ChatMessage["role"];
  content: string;
  contextMode: ChatContextMode;
  sessionId?: string;
  provider?: ProviderKind;
  model?: string;
  tokenUsage?: AiTokenUsage;
  nowIso?: string;
}): ChatMessage {
  return {
    id: id ?? createChatMessageId({ videoId, role, nowIso }),
    videoId,
    role,
    content,
    contextMode,
    sessionId,
    provider,
    model,
    tokenUsage,
    createdAtIso: nowIso,
  };
}

function createRandomIdSegment() {
  const crypto = globalThis.crypto;
  if (crypto && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  return Math.random().toString(36).slice(2, 14);
}
