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
    id: `chat-${videoId}-${role}-${nowIso}`,
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
