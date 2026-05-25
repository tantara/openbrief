import { describe, expect, it } from "vitest";
import {
  createSummaryVideoGenerationComposition,
  createVideoGenerationArtifactPaths,
} from "@/domain/video-generation";

describe("video generation domain", () => {
  it("stores generated compositions under the source asset bundle", () => {
    expect(
      createVideoGenerationArtifactPaths(
        {
          id: "pdf-1",
          title: "Deck",
          sourceType: "pdf",
          sourceKind: "local-file",
          originalUri: "file:///deck.pdf",
          libraryPath: "pdfs/pdf-1/deck.pdf",
          importStatus: "ready",
          createdAtIso: "2026-05-25T00:00:00.000Z",
        },
        "composition 1",
      ),
    ).toEqual({
      rootDirectory: "pdfs/pdf-1/generated-video/composition-1",
      entryPath: "pdfs/pdf-1/generated-video/composition-1/index.html",
      manifestPath: "pdfs/pdf-1/generated-video/composition-1/composition.json",
      renderPath: "pdfs/pdf-1/generated-video/composition-1/render.mp4",
      tempDirectory: "pdfs/pdf-1/generated-video/composition-1/tmp",
    });
  });

  it("creates sandboxable HyperFrames HTML with a strict CSP", () => {
    const composition = createSummaryVideoGenerationComposition({
      asset: {
        id: "video-1",
        title: "Strategy Review",
        sourceKind: "local-file",
        originalUri: "file:///strategy.mp4",
        libraryPath: "videos/video-1/strategy.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      summary: {
        id: "summary-1",
        videoId: "video-1",
        markdown: "# Strategy\n\nFocus on native rendering first.",
        provider: "openai",
        sourceSegmentCount: 1,
        createdAtIso: "2026-05-25T00:01:00.000Z",
      },
      nowIso: "2026-05-25T00:02:00.000Z",
    });

    expect(composition.adapter).toBe("deno-hyperframes");
    expect(composition.entryPath).toBe(
      "videos/video-1/generated-video/video-1-20260525000200/index.html",
    );
    expect(composition.html).toContain("Content-Security-Policy");
    expect(composition.html).toContain("script-src 'none'");
    expect(composition.html).not.toContain("script-src 'unsafe-inline'");
    expect(composition.html).toContain("connect-src 'none'");
    expect(composition.html).toContain("Strategy Review");
  });
});
