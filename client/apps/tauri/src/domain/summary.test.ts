import { describe, expect, it } from "vitest";
import type { TranscriptSegment, VideoAsset } from "@/domain/media-library";
import {
  chunkTranscriptSegments,
  createSummaryDocument,
  createSummaryPrompt,
  getVideoSummaryTemplate,
} from "@/domain/summary";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const segments: TranscriptSegment[] = [
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

describe("summary domain", () => {
  it("chunks transcripts deterministically with timestamps retained", () => {
    const chunks = chunkTranscriptSegments(segments, 18);

    expect(chunks).toEqual([
      {
        index: 0,
        text: "[0:00 | 0s] Intro",
        startSeconds: 0,
        endSeconds: 10,
      },
      {
        index: 1,
        text: "[0:30 | 30s] Main idea",
        startSeconds: 30,
        endSeconds: 42,
      },
    ]);
  });

  it("creates markdown summary prompts from transcript chunks", () => {
    const prompt = createSummaryPrompt({
      video,
      segments,
      options: {
        templateId: "documentary-report",
        lengthMode: "long",
      },
    });

    expect(prompt.systemPrompt).toContain("blog-post-style Markdown article");
    expect(prompt.systemPrompt).toContain("Documentary/report additions");
    expect(prompt.systemPrompt).toContain("Length mode: long");
    expect(prompt.systemPrompt).toContain("## Table of Contents");
    expect(prompt.systemPrompt).toContain("## Key Sections");
    expect(prompt.systemPrompt).toContain("## Key Takeaways");
    expect(prompt.systemPrompt).toContain("## Final Thought");
    expect(prompt.systemPrompt).toContain("Never invent a timestamp");
    expect(prompt.userPrompt).toContain("VIDEO_TITLE: Design Review");
    expect(prompt.userPrompt).toContain("VIDEO_URL: https://youtu.be/example");
    expect(prompt.userPrompt).toContain("SUMMARY_TEMPLATE: Documentary report");
    expect(prompt.userPrompt).toContain("LENGTH_MODE: Long");
    expect(prompt.userPrompt).toContain("LAST_AVAILABLE_TIMESTAMP: 0:42 (42 seconds)");
    expect(prompt.userPrompt).toContain("TIMESTAMPED_TRANSCRIPT");
    expect(prompt.userPrompt).toContain("[0:30 | 30s] Main idea");
  });

  it("uses a custom summary system prompt while preserving dynamic length instructions", () => {
    const prompt = createSummaryPrompt({
      video,
      segments,
      options: {
        systemPromptOverride: "Write a custom editorial report.",
        lengthMode: "short",
      },
    });

    expect(prompt.systemPrompt).toContain("Write a custom editorial report.");
    expect(prompt.systemPrompt).toContain("Length mode: short");
    expect(prompt.systemPrompt).not.toContain("blog-post-style Markdown article");
  });

  it("falls back to the YouTube blog template for default callers", () => {
    expect(getVideoSummaryTemplate().id).toBe("youtube-blog");
  });

  it("persists summary metadata with provider and source segment count", () => {
    const summary = createSummaryDocument({
      videoId: "video-1",
      provider: "openai",
      markdown: "# Summary",
      templateId: "youtube-blog",
      lengthMode: "default",
      sourceSegmentCount: 2,
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(summary).toMatchObject({
      id: "summary-video-1-2026-05-21T00-00-00-000Z",
      provider: "openai",
      templateId: "youtube-blog",
      lengthMode: "default",
      sourceSegmentCount: 2,
      artifactPath:
        "videos/video-1/summary/summary-video-1-2026-05-21T00-00-00-000Z.md",
    });
  });
});
