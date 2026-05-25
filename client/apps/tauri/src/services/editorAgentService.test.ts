import { describe, expect, it, vi } from "vitest";
import type { ProviderService } from "@/services/providerService";
import { createEditorAgentService } from "@/services/editorAgentService";

const asset = {
  id: "video-1",
  title: "Strategy Review",
  sourceKind: "local-file" as const,
  originalUri: "file:///strategy.mp4",
  libraryPath: "videos/video-1/strategy.mp4",
  importStatus: "ready" as const,
  createdAtIso: "2026-05-25T00:00:00.000Z",
};

const transcript = [
  {
    id: "seg-1",
    startSeconds: 0,
    endSeconds: 8,
    text: "Ship the native editor first.",
    sourceKind: "local-stt" as const,
  },
  {
    id: "seg-2",
    startSeconds: 8,
    endSeconds: 18,
    text: "Then layer agent workflows on top.",
    sourceKind: "local-stt" as const,
  },
];

describe("editor agent service", () => {
  it("requests provider JSON plans through the video agent operation", async () => {
    const providerService = {
      complete: vi.fn(async () => ({
        ok: true as const,
        text: JSON.stringify({
          kind: "composition",
          summary: "Use a short native briefing.",
          scenario: "summary-to-video",
          direction: "Make a 30 second short with wipe captions.",
          componentNames: ["caption-clip-wipe"],
          storyboard: [
            {
              title: "Hook",
              narration: "Start with the key claim.",
              startSeconds: 0,
              durationSeconds: 8,
            },
          ],
          transcriptEdit: { cuts: [], renderNotes: [] },
        }),
        requestPlan: {} as never,
      })),
    } satisfies ProviderService;
    const service = createEditorAgentService(
      providerService,
      () => ({
        summary: {
          provider: "openai",
          model: "gpt-5.4-mini",
          streamingMode: false,
        },
        chat: {
          provider: "gemini",
          model: "gemini-3.1-flash-lite",
          streamingMode: true,
        },
        editorAgent: {
          provider: "gemini",
          model: "gemini-3.1-flash-lite",
          streamingMode: true,
        },
      }),
      () => ({
        summary: { temperature: 0.3, topP: 0.9, maxTokens: 4096 },
        chat: { temperature: 0.2, topP: 0.9, maxTokens: 2048 },
        podcast_script: { temperature: 0.55, topP: 0.95, maxTokens: 4096 },
        quiz: { temperature: 0.35, topP: 0.9, maxTokens: 4096 },
        transcript_review: { temperature: 0.1, topP: 0.9, maxTokens: 4096 },
        transcript_translate: { temperature: 0.1, topP: 0.9, maxTokens: 4096 },
        video_agent_plan: { temperature: 0.25, topP: 0.9, maxTokens: 4096 },
      }),
    );

    const plan = await service.draftPlan({
      asset,
      transcript,
      instruction: "Make this into a short with wipe captions.",
    });

    expect(providerService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        operation: "video_agent_plan",
        model: "gemini-3.1-flash-lite",
        streamingMode: true,
        generationParams: { temperature: 0.25, topP: 0.9, maxTokens: 4096 },
      }),
    );
    expect(plan.componentNames).toEqual(["caption-clip-wipe"]);
    expect(plan.validation.ok).toBe(true);
  });

  it("falls back to a deterministic native plan when provider JSON is malformed", async () => {
    const providerService = {
      complete: vi.fn(async () => ({
        ok: true as const,
        text: "not json",
        requestPlan: {} as never,
      })),
    } satisfies ProviderService;
    const service = createEditorAgentService(providerService);

    const plan = await service.draftPlan({
      asset,
      transcript,
      instruction: "Add TikTok wipe captions.",
    });

    expect(plan.componentNames).toEqual(["caption-clip-wipe"]);
    expect(plan.validation.warnings.join(" ")).toContain("native fallback");
  });
});
