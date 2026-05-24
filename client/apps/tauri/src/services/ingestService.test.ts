import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockIngestService,
  createTauriIngestService,
} from "@/services/ingestService";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import { logRuntimeInfo } from "@/services/runtimeLogger";

vi.mock("@/services/runtimeLogger", () => ({
  logRuntimeError: vi.fn(),
  logRuntimeInfo: vi.fn(),
}));

describe("mock ingest service", () => {
  beforeEach(() => {
    vi.mocked(logRuntimeInfo).mockClear();
  });

  it("imports local files through an app-managed copy contract", async () => {
    const service = createMockIngestService();
    const result = await service.importLocalFile({
      sourcePath: "/tmp/local sample.mp4",
      fileSizeBytes: 2048,
      durationSeconds: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video.libraryPath).toMatch(/^videos\/local-/);
      expect(result.events).toEqual([
        expect.objectContaining({ type: "local_copy_planned" }),
      ]);
    }
  });

  it("imports YouTube URLs with fake helper progress events", async () => {
    const service = createMockIngestService();
    const result = await service.importYoutubeUrl({ url: "https://youtu.be/example" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video).toMatchObject({
        title: "Fake YouTube Video",
        sourceKind: "youtube",
        authorName: "Fake Creator",
        authorUrl: "https://www.youtube.com/@fakecreator",
        importStatus: "ready",
      });
      expect(result.events.map((event) => event.type)).toEqual([
        "helper_event",
        "helper_event",
        "helper_event",
      ]);
    }
  });

  it("fails playlist imports before fake helper execution", async () => {
    const service = createMockIngestService();
    const result = await service.importYoutubeUrl({
      url: "https://www.youtube.com/playlist?list=abc",
    });

    expect(result).toMatchObject({
      ok: false,
      message: "Playlist, channel, profile, and collection imports are not supported in v1",
      job: { status: "failed" },
    });
    expect(result.events).toEqual([
      expect.objectContaining({ type: "ingest_rejected" }),
    ]);
  });

  it("carries classified yt-dlp recovery actions on remote import failures", async () => {
    const failingHelper: HelperClient = {
      async run(command) {
        if (command.command === "download_youtube") {
          throw new Error(
            "ERROR: [youtube] This video is private. If you have been granted access, use --cookies.",
          );
        }

        return new FakeHelperClient().run(command);
      },
      eventsForJob() {
        return [];
      },
    };
    const service = createMockIngestService(failingHelper);

    const result = await service.importYoutubeUrl({
      url: "https://www.youtube.com/watch?v=private",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.job).toMatchObject({
        status: "failed",
        errorKind: "private-video",
        errorMessage:
          "This video is private or restricted. Use cookies from an account that can watch it.",
      });
      expect(result.job.recoveryActions?.map((action) => action.kind)).toEqual([
        "provide-cookies",
        "open-webview-cookies",
        "provide-credentials",
      ]);
    }
  });

  it("copies and probes local files through trusted Tauri commands", async () => {
    const service = createTauriIngestService(
      new FakeHelperClient(),
      async (command, args) => {
        expect(command).toBe("copy_local_file_into_library");
        expect(args).toEqual({ sourcePath: "/tmp/local sample.mp4" });

        return {
          libraryRelativePath: "videos/local-local-sample/local-sample.mp4",
          fileSizeBytes: 4096,
          sourceType: "video",
        } as never;
      },
    );

    const result = await service.importLocalFile({
      sourcePath: "/tmp/local sample.mp4",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video.fileSizeBytes).toBe(4096);
      expect(result.video.durationSeconds).toBe(120);
      expect(result.video.libraryPath).toBe(
        "videos/local-local-sample/local-sample.mp4",
      );
      expect(logRuntimeInfo).toHaveBeenCalledWith(
        "after importing local video",
        expect.objectContaining({
          outputPath: "videos/local-local-sample/local-sample.mp4",
          playbackPath: "videos/local-local-sample/local-sample.mp4",
          status: "ready",
        }),
      );
    }
  });

  it("copies audio and PDF files without video probing in Tauri mode", async () => {
    const helperClient = new FakeHelperClient();
    const service = createTauriIngestService(
      helperClient,
      async () =>
        ({
          libraryRelativePath: "audio/local-local-sample/local-sample.mp3",
          fileSizeBytes: 2048,
          sourceType: "audio",
        }) as never,
    );

    const result = await service.importLocalFile({
      sourcePath: "/tmp/local sample.mp3",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video).toMatchObject({
        sourceType: "audio",
        sourceKind: "local-file",
        libraryPath: "audio/local-local-sample/local-sample.mp3",
        fileSizeBytes: 2048,
      });
      expect(result.video.durationSeconds).toBeUndefined();
      expect(result.video.thumbnailPath).toBeUndefined();
    }
  });

  it("downloads YouTube URLs and probes the resulting media in Tauri mode", async () => {
    const service = createTauriIngestService(new FakeHelperClient());

    const result = await service.importYoutubeUrl({
      url: "https://www.youtube.com/watch?v=openclip-test-id",
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video).toMatchObject({
        title: "Fake YouTube Video",
        sourceKind: "youtube",
        libraryPath: expect.stringMatching(/^videos\/youtube-/),
        durationSeconds: 120,
        fileSizeBytes: 1048576,
        authorName: "Fake Creator",
        authorUrl: "https://www.youtube.com/@fakecreator",
      });
      expect(logRuntimeInfo).toHaveBeenCalledWith(
        "before downloading video",
        expect.objectContaining({
          outputDir: expect.stringMatching(/^videos\/youtube-/),
        }),
      );
      expect(logRuntimeInfo).toHaveBeenCalledWith(
        "after downloading video",
        expect.objectContaining({
          outputDir: expect.stringMatching(/^videos\/youtube-/),
          videoPath: expect.stringMatching(/^videos\/youtube-/),
        }),
      );
      expect(logRuntimeInfo).toHaveBeenCalledWith(
        "after preparing video playback",
        expect.objectContaining({
          playbackPath: expect.stringMatching(/^videos\/youtube-/),
        }),
      );
    }
  });
});
