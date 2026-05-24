import { describe, expect, it } from "vitest";
import {
  createLocalFileImportPlan,
  createLocalFileIngestResult,
  createYoutubeDownloadCommand,
  mediaSourceTypeFromFileName,
} from "@/domain/ingest";

describe("ingest domain", () => {
  it("plans local imports as app-managed library copies", () => {
    const plan = createLocalFileImportPlan({
      sourcePath: "/Users/example/Movies/demo clip.mp4",
    });

    expect(plan.strategy).toBe("copy-into-library");
    expect(plan.sourceType).toBe("video");
    expect(plan.targetRelativePath).toMatch(/^videos\/local-/);
    expect(plan.targetRelativePath).toContain("demo-clip.mp4");
    expect(plan.tempRelativePath).toMatch(/^job-temp\/local-/);
  });

  it("classifies local video, audio, and PDF files for shared metadata", () => {
    expect(mediaSourceTypeFromFileName("clip.mov")).toBe("video");
    expect(mediaSourceTypeFromFileName("voice memo.mp3")).toBe("audio");
    expect(mediaSourceTypeFromFileName("brief.pdf")).toBe("pdf");
    expect(() => mediaSourceTypeFromFileName("notes.txt")).toThrow(
      "local_file_unsupported_extension",
    );
  });

  it("plans audio and PDF imports into media-specific library directories", () => {
    expect(
      createLocalFileImportPlan({
        sourcePath: "/Users/example/Music/demo audio.mp3",
      }),
    ).toMatchObject({
      sourceType: "audio",
      targetRelativePath: "audio/local-demo-audio/demo-audio.mp3",
    });
    expect(
      createLocalFileImportPlan({
        sourcePath: "/Users/example/Documents/demo paper.pdf",
      }),
    ).toMatchObject({
      sourceType: "pdf",
      targetRelativePath: "documents/local-demo-paper/demo-paper.pdf",
    });
  });

  it("creates local video metadata without retaining an external library path", () => {
    const result = createLocalFileIngestResult({
      sourcePath: "/tmp/source.mp4",
      fileSizeBytes: 10,
      durationSeconds: 5,
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.video).toMatchObject({
      sourceKind: "local-file",
      sourceType: "video",
      libraryPath: expect.stringMatching(/^videos\/local-/),
      fileSizeBytes: 10,
      durationSeconds: 5,
      importStatus: "ready",
    });
  });

  it.each([
    ["youtube", "https://youtu.be/example"],
    ["tiktok", "https://www.tiktok.com/@samplecreator/video/7320000000000000000"],
    ["twitch", "https://www.twitch.tv/videos/123456789"],
    ["vimeo", "https://vimeo.com/123456789"],
  ] as const)("builds fake-helper %s download commands for single videos", (provider, url) => {
    const command = createYoutubeDownloadCommand({
      url,
    });

    expect("ok" in command).toBe(false);
    expect(command).toMatchObject({
      command: "download_youtube",
      sourceKind: provider,
      outputDir: expect.stringMatching(new RegExp(`^videos/${provider}-`)),
      tempDir: expect.stringMatching(new RegExp(`^job-temp/${provider}-`)),
    });
  });

  it("rejects playlist and channel URLs with a clear v1 message", () => {
    const rejected = createYoutubeDownloadCommand({
      url: "https://www.youtube.com/watch?v=abc&list=playlist",
    });

    expect("ok" in rejected && rejected.ok).toBe(false);
    expect(rejected).toMatchObject({
      ok: false,
      message: "Playlist, channel, profile, and collection imports are not supported in v1",
    });
  });
});
