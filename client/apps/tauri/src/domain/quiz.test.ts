import { describe, expect, it } from "vitest";
import type { TranscriptSegment, VideoAsset } from "@/domain/media-library";
import {
  createQuizDocument,
  createQuizPrompt,
  DEFAULT_QUIZ_SYSTEM_PROMPT,
} from "@/domain/quiz";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const transcript: TranscriptSegment[] = [
  {
    id: "s1",
    startSeconds: 0,
    endSeconds: 10,
    text: "Intro",
    sourceKind: "youtube-captions",
  },
  {
    id: "s2",
    startSeconds: 30,
    endSeconds: 42,
    text: "Main idea",
    sourceKind: "youtube-captions",
  },
];

describe("quiz domain", () => {
  it("directs blank interest prompts toward a balanced general quiz", () => {
    const prompt = createQuizPrompt({
      video,
      transcript,
      mode: "multiple-choice",
      questionCount: 6,
      areaOfInterest: "   ",
    });

    expect(DEFAULT_QUIZ_SYSTEM_PROMPT).toContain(
      "If no specific area of interest is provided",
    );
    expect(prompt.userPrompt).toContain(
      "Area of interest: general quiz covering the most important ideas",
    );
    expect(prompt.userPrompt).toContain("[0:30 | 30s] Main idea");
  });

  it("preserves a supplied interest area in the prompt and stored quiz metadata", () => {
    const prompt = createQuizPrompt({
      video,
      transcript,
      mode: "flash-card",
      questionCount: 4,
      areaOfInterest: "  retrieval practice  ",
    });
    const quiz = createQuizDocument({
      video,
      mode: "flash-card",
      questionCount: 4,
      areaOfInterest: "  retrieval practice  ",
      provider: "openai",
      quiz: {
        title: "Quiz",
        items: [{ id: "card-1", type: "flash-card", front: "Q", back: "A" }],
      },
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(prompt.userPrompt).toContain("Area of interest: retrieval practice");
    expect(quiz.areaOfInterest).toBe("retrieval practice");
  });
});
