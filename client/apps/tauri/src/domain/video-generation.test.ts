import {
  createSummaryVideoGenerationComposition,
  createVideoGenerationArtifactPaths,
  dimensionsForVideoGenerationAspectRatio,
} from "@/domain/video-generation";
import { describe, expect, it } from "vitest";

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

  it("stores CSV video compositions under CSV asset bundles", () => {
    const composition = createSummaryVideoGenerationComposition({
      asset: {
        id: "csv-1",
        title: "Metrics",
        sourceType: "csv",
        sourceKind: "local-file",
        originalUri: "file:///metrics.csv",
        libraryPath: "csvs/csv-1/metrics.csv",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      nowIso: "2026-05-25T00:02:00.000Z",
    });

    expect(composition.scenario).toBe("csv-to-video");
    expect(composition.sourceType).toBe("csv");
    expect(composition.entryPath).toBe(
      "csvs/csv-1/generated-video/csv-1-20260525000200/index.html",
    );
    expect(composition.prompt).toBe(
      "Create a concise data story video from this CSV.",
    );
  });

  it("creates renderable HyperFrames HTML with a timeline contract", () => {
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
    expect(composition.html).toContain(
      "script-src 'unsafe-inline' https://cdn.jsdelivr.net",
    );
    expect(composition.html).toContain("connect-src 'none'");
    expect(composition.html).toContain(
      'data-composition-id="video-1-20260525000200"',
    );
    expect(composition.html).toContain('class="scene clip"');
    expect(composition.html).toContain('data-width="1920"');
    expect(composition.html).toContain('data-height="1080"');
    expect(composition.html).toContain("window.__timelines");
    expect(composition.html).toContain("gsap.timeline({ paused: true })");
    expect(composition.html).toContain("Strategy Review");
  });

  it("wires pinned caption components from prompt intent into safe preview HTML", () => {
    const composition = createSummaryVideoGenerationComposition({
      asset: {
        id: "video-1",
        title: "Launch Notes",
        sourceKind: "local-file",
        originalUri: "file:///launch.mp4",
        libraryPath: "videos/video-1/launch.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      summary: {
        id: "summary-1",
        videoId: "video-1",
        markdown: "Ship the native preview and render flow first.",
        provider: "openai",
        sourceSegmentCount: 1,
        createdAtIso: "2026-05-25T00:01:00.000Z",
      },
      prompt: "Make TikTok word reveal captions with a wipe.",
      nowIso: "2026-05-25T00:02:00.000Z",
    });

    expect(composition.components).toEqual([
      expect.objectContaining({
        name: "caption-clip-wipe",
        wiringMode: "inline-snippet",
      }),
    ]);
    expect(composition.html).toContain(
      'data-openbrief-component="caption-clip-wipe"',
    );
    expect(composition.html).toContain("caption-clip-wipe .caption-word");
    expect(composition.html).toContain('clipPath: "inset(0 0% 0 0)"');
  });

  it("uses editor-agent storyboard scenes as composition structure and duration", () => {
    const composition = createSummaryVideoGenerationComposition({
      asset: {
        id: "video-1",
        title: "Launch Notes",
        sourceKind: "local-file",
        originalUri: "file:///launch.mp4",
        libraryPath: "videos/video-1/launch.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-25T00:00:00.000Z",
      },
      prompt: "Use the editor agent storyboard.",
      storyboard: [
        {
          title: "Hook",
          narration: "Native preview comes first.",
          startSeconds: 0,
          durationSeconds: 6,
        },
        {
          title: "Render",
          narration: "Render with the trusted helper boundary.",
          startSeconds: 6,
          durationSeconds: 9,
        },
      ],
    });

    expect(composition.durationSeconds).toBe(15);
    expect(composition.storyboard).toEqual([
      expect.objectContaining({ title: "Hook" }),
      expect.objectContaining({ title: "Render" }),
    ]);
    expect(composition.html).toContain("Native preview comes first.");
    expect(composition.html).toContain("6-15s");
  });

  it("rejects unknown explicit component names before creating a composition", () => {
    expect(() =>
      createSummaryVideoGenerationComposition({
        asset: {
          id: "video-1",
          title: "Launch Notes",
          sourceKind: "local-file",
          originalUri: "file:///launch.mp4",
          libraryPath: "videos/video-1/launch.mp4",
          importStatus: "ready",
          createdAtIso: "2026-05-25T00:00:00.000Z",
        },
        componentNames: ["made-up-component"],
      }),
    ).toThrow("video_generation_unknown_components:made-up-component");
  });

  it("resolves deterministic preview and render dimensions from aspect ratio", () => {
    expect(dimensionsForVideoGenerationAspectRatio("16:9")).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(dimensionsForVideoGenerationAspectRatio("9:16")).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(dimensionsForVideoGenerationAspectRatio("1:1")).toEqual({
      width: 1080,
      height: 1080,
    });
  });
});
