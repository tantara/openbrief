import type {
  ChatMessage,
  SummaryDocument,
  VideoAsset,
} from "@/domain/media-library";
import { createShareManifest } from "@/domain/share";
import { describe, expect, it } from "vitest";

import { PortableShareManifestV1Schema } from "@acme/openbrief-content";

const youtubeAsset: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://www.youtube.com/watch?v=abc123",
  originalFileName: "Design Review.mp4",
  libraryPath: "videos/video-1/source.mp4",
  thumbnailPath: "videos/video-1/thumbnail/poster.jpg",
  importStatus: "ready",
  createdAtIso: "2026-05-24T00:00:00.000Z",
};

const summary: SummaryDocument = {
  id: "summary-video-1",
  videoId: "video-1",
  markdown: "# Summary",
  provider: "openai",
  sourceSegmentCount: 1,
  artifactPath: "videos/video-1/summary/summary-video-1.md",
  createdAtIso: "2026-05-24T00:01:00.000Z",
};

const chat: ChatMessage = {
  id: "chat-1",
  videoId: "video-1",
  role: "assistant",
  content: "Answer",
  contextMode: "summary",
  sessionId: "default",
  createdAtIso: "2026-05-24T00:02:00.000Z",
};

describe("portable share manifests", () => {
  it("excludes raw YouTube source video by default", () => {
    const manifest = createShareManifest({
      asset: youtubeAsset,
      transcript: [
        {
          id: "s1",
          startSeconds: 0,
          text: "Hello",
          sourceKind: "youtube-captions",
        },
      ],
      summaries: [summary],
      chatMessages: [chat],
      nowIso: "2026-05-24T01:00:00.000Z",
    });

    expect(PortableShareManifestV1Schema.parse(manifest)).toEqual(manifest);
    expect(manifest.artifacts.map((artifact) => artifact.kind)).toEqual([
      "manifest",
      "thumbnail",
      "transcript",
      "summary",
      "chat",
    ]);
    expect(
      manifest.artifacts.some(
        (artifact) => artifact.path === youtubeAsset.libraryPath,
      ),
    ).toBe(false);
  });

  it("includes source media only when explicitly selected", () => {
    const manifest = createShareManifest({
      asset: youtubeAsset,
      selectedKinds: ["manifest", "source-media"],
      includeSourceMedia: true,
      nowIso: "2026-05-24T01:00:00.000Z",
    });

    expect(manifest.artifacts.map((artifact) => artifact.kind)).toEqual([
      "manifest",
      "source-media",
    ]);
  });

  it("keeps audio and pdf source artifacts in their corresponding roots", () => {
    const audioManifest = createShareManifest({
      asset: {
        ...youtubeAsset,
        id: "audio-1",
        sourceType: "audio",
        sourceKind: "local-file",
        originalUri: "file:///tmp/audio.wav",
        libraryPath: "audios/audio-1/source.wav",
      },
      selectedKinds: ["manifest", "audio"],
      nowIso: "2026-05-24T01:00:00.000Z",
    });
    const pdfManifest = createShareManifest({
      asset: {
        ...youtubeAsset,
        id: "pdf-1",
        sourceType: "pdf",
        sourceKind: "local-file",
        originalUri: "file:///tmp/report.pdf",
        libraryPath: "pdfs/pdf-1/source.pdf",
      },
      selectedKinds: ["manifest", "pdf"],
      nowIso: "2026-05-24T01:00:00.000Z",
    });

    expect(audioManifest.artifacts.at(-1)?.path).toBe(
      "audios/audio-1/source.wav",
    );
    expect(pdfManifest.artifacts.at(-1)?.path).toBe("pdfs/pdf-1/source.pdf");
  });

  it("rejects paths outside the self-contained asset root", () => {
    expect(() =>
      createShareManifest({
        asset: {
          ...youtubeAsset,
          thumbnailPath: "../thumbnail.jpg",
        },
      }),
    ).toThrow("path_traversal");
  });
});
