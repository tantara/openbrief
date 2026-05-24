import { describe, expect, it } from "vitest";
import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  createChatMessage,
  createChatMessageId,
  createChatPrompt,
  sanitizeChatMessageTtsPathSegment,
} from "@/domain/chat";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const summary: SummaryDocument = {
  id: "summary-video-1",
  videoId: "video-1",
  markdown: "# Summary\n\n- Key point",
  provider: "openai",
  sourceSegmentCount: 1,
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const transcript: TranscriptSegment[] = [
  {
    id: "s1",
    startSeconds: 12,
    text: "Transcript detail",
    sourceKind: "local-stt",
  },
];

describe("chat domain", () => {
  it("creates chat requests with summary context only", () => {
    const prompt = createChatPrompt({
      video,
      question: "What mattered?",
      contextMode: "summary",
      summary,
      transcript,
    });

    expect(prompt.userPrompt).toContain("# Summary");
    expect(prompt.userPrompt).not.toContain("Transcript detail");
  });

  it("creates chat requests with transcript context only", () => {
    const prompt = createChatPrompt({
      video,
      question: "What happened at 12 seconds?",
      contextMode: "transcript",
      summary,
      transcript,
    });

    expect(prompt.userPrompt).toContain("[0:12 | 12s] Transcript detail");
    expect(prompt.userPrompt).not.toContain("# Summary");
  });

  it("uses a custom chat system prompt when provided", () => {
    const prompt = createChatPrompt({
      video,
      question: "What mattered?",
      contextMode: "summary",
      summary,
      transcript,
      systemPromptOverride: "Answer in a concise analyst voice.",
    });

    expect(prompt.systemPrompt).toBe("Answer in a concise analyst voice.");
  });

  it("creates TTS-safe unique chat message ids", () => {
    const message = createChatMessage({
      videoId: "video-1",
      role: "user",
      content: "Question",
      contextMode: "summary",
      nowIso: "2026-05-21T00:00:00.000Z",
      id: createChatMessageId({
        videoId: "video-1",
        role: "user",
        nowIso: "2026-05-21T00:00:00.000Z",
        randomSegment: "message-1",
      }),
    });

    expect(message).toMatchObject({
      id: "chat-user-video-1-mpeq51c0-message-1",
      contextMode: "summary",
      sessionId: "default",
    });
    expect(sanitizeChatMessageTtsPathSegment(message.id)).toBe(message.id);
  });

  it("adds entropy so messages created in the same millisecond do not share ids", () => {
    const first = createChatMessageId({
      videoId: "video-1",
      role: "assistant",
      nowIso: "2026-05-21T00:00:00.000Z",
      randomSegment: "first",
    });
    const second = createChatMessageId({
      videoId: "video-1",
      role: "assistant",
      nowIso: "2026-05-21T00:00:00.000Z",
      randomSegment: "second",
    });

    expect(first).not.toBe(second);
  });
});
