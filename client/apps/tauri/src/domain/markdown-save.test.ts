import { describe, expect, it } from "vitest";
import type { SummaryDocument, VideoAsset } from "@/domain/media-library";
import { createMarkdownSavePayload } from "@/domain/markdown-save";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review!",
  sourceKind: "local-file",
  originalUri: "/tmp/design.mp4",
  libraryPath: "videos/video-1/design.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const summary: SummaryDocument = {
  id: "summary-video-1",
  videoId: "video-1",
  markdown: "# Summary\n\nExact body",
  provider: "gemini",
  sourceSegmentCount: 3,
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

describe("markdown save domain", () => {
  it("creates a safe suggested markdown filename", () => {
    const payload = createMarkdownSavePayload({ video, summary });

    expect(payload.suggestedFileName).toBe("design-review.md");
  });

  it("preserves markdown body and user chosen path", () => {
    const payload = createMarkdownSavePayload({
      video,
      summary,
      targetPath: "/Users/me/Desktop/summary.md",
    });

    expect(payload.targetPath).toBe("/Users/me/Desktop/summary.md");
    expect(payload.markdown).toBe("# Summary\n\nExact body");
  });
});
