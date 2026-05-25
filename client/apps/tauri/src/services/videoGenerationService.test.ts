import { describe, expect, it, vi } from "vitest";
import type { HelperClient } from "@/services/fakeHelperClient";
import { createVideoGenerationService } from "@/services/videoGenerationService";

describe("video generation service", () => {
  it("renders a composition through the helper command contract", async () => {
    const helperClient = {
      run: vi.fn(async (command) => {
        if (command.command === "render_html_composition") {
          return {
            command: "render_html_composition" as const,
            videoPath: command.outputPath,
          };
        }

        throw new Error("unexpected command");
      }),
      eventsForJob: vi.fn(() => []),
    } satisfies HelperClient;
    const service = createVideoGenerationService({ helperClient });

    const render = await service.renderComposition({
      composition: {
        id: "composition-1",
        sourceId: "video-1",
        sourceType: "video",
        scenario: "summary-to-video",
        adapter: "deno-hyperframes",
        title: "Demo",
        prompt: "Demo",
        html: "<html></html>",
        entryPath: "videos/video-1/generated-video/composition-1/index.html",
        manifestPath:
          "videos/video-1/generated-video/composition-1/composition.json",
        renderPath: "videos/video-1/generated-video/composition-1/render.mp4",
        durationSeconds: 45,
        aspectRatio: "16:9",
        createdAtIso: "2026-05-25T00:00:00.000Z",
        updatedAtIso: "2026-05-25T00:00:00.000Z",
      },
    });

    expect(helperClient.run).toHaveBeenCalledWith({
      protocolVersion: 1,
      command: "render_html_composition",
      jobId: expect.stringMatching(/^video-generation-render-/),
      inputPath: "videos/video-1/generated-video/composition-1/index.html",
      outputPath: "videos/video-1/generated-video/composition-1/render.mp4",
      tempDir: "videos/video-1/generated-video/composition-1/tmp",
    });
    expect(render.outputPath).toBe(
      "videos/video-1/generated-video/composition-1/render.mp4",
    );
  });
});
