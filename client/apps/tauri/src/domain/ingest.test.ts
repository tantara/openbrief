import { describe, expect, it } from "vitest";
import {
  createLocalFileImportPlan,
  createLocalFileIngestResult,
  createYoutubeDownloadCommand,
  mediaSourceTypeFromFileName,
} from "@/domain/ingest";

describe("ingest domain", () => {
  const uuidPattern =
    "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

  it("plans local imports as app-managed library copies", () => {
    const plan = createLocalFileImportPlan({
      sourcePath: "/Users/example/Movies/demo clip.mp4",
    });

    expect(plan.strategy).toBe("copy-into-library");
    expect(plan.sourceType).toBe("video");
    expect(plan.assetId).toMatch(new RegExp(`^${uuidPattern}$`));
    expect(plan.targetRelativePath).toMatch(
      new RegExp(`^videos/${uuidPattern}/demo-clip\\.mp4$`),
    );
    expect(plan.targetRelativePath).toContain("demo-clip.mp4");
    expect(plan.tempRelativePath).toBe(`job-temp/${plan.assetId}`);
  });

  it("creates distinct local import paths for repeated file names", () => {
    const first = createLocalFileImportPlan({
      sourcePath: "/Users/example/Movies/demo clip.mp4",
      nowIso: "2026-05-21T00:00:00.000Z",
    });
    const second = createLocalFileImportPlan({
      sourcePath: "/Users/example/Movies/demo clip.mp4",
      nowIso: "2026-05-21T00:00:01.000Z",
    });

    expect(first.assetId).not.toBe(second.assetId);
    expect(first.targetRelativePath).not.toBe(second.targetRelativePath);
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
      targetRelativePath: expect.stringMatching(
        new RegExp(`^audios/${uuidPattern}/demo-audio\\.mp3$`),
      ),
    });
    expect(
      createLocalFileImportPlan({
        sourcePath: "/Users/example/Documents/demo paper.pdf",
      }),
    ).toMatchObject({
      sourceType: "pdf",
      targetRelativePath: expect.stringMatching(
        new RegExp(`^pdfs/${uuidPattern}/demo-paper\\.pdf$`),
      ),
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
      originalFileName: "source.mp4",
      libraryPath: expect.stringMatching(new RegExp(`^videos/${uuidPattern}/source\\.mp4$`)),
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
