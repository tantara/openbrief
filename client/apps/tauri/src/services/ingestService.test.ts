import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockIngestService,
  createTauriIngestService,
  isWebviewPlayableProbe,
} from "@/services/ingestService";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import { logRuntimeInfo } from "@/services/runtimeLogger";

vi.mock("@/services/runtimeLogger", () => ({
  logRuntimeError: vi.fn(),
  logRuntimeInfo: vi.fn(),
}));

describe("mock ingest service", () => {
  const videoAssetId = "00000000-0000-4000-8000-000000000001";
  const audioAssetId = "00000000-0000-4000-8000-000000000002";
  const pdfAssetId = "00000000-0000-4000-8000-000000000003";

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
      expect(result.video.libraryPath).toMatch(
        /^videos\/[0-9a-f-]{36}\/local-sample\.mp4$/,
      );
      expect(result.video.thumbnailPath).toMatch(
        /^videos\/[0-9a-f-]{36}\/thumbnail\/local-sample-thumbnail\.jpg$/,
      );
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
          assetId: videoAssetId,
          originalFileName: "local sample.mp4",
          libraryRelativePath: `videos/${videoAssetId}/local-sample.mp4`,
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
      expect(result.video.originalFileName).toBe("local sample.mp4");
      expect(result.video.libraryPath).toBe(
        `videos/${videoAssetId}/local-sample.mp4`,
      );
      expect(result.video.thumbnailPath).toBe(
        `videos/${videoAssetId}/thumbnail/local-sample-thumbnail.jpg`,
      );
      expect(logRuntimeInfo).toHaveBeenCalledWith(
        "after importing local video",
        expect.objectContaining({
          outputPath: `videos/${videoAssetId}/local-sample.mp4`,
          playbackPath: `videos/${videoAssetId}/local-sample.mp4`,
          status: "ready",
        }),
      );
    }
  });

  it("copies audio files and stores probed duration in Tauri mode", async () => {
    const helperClient = new FakeHelperClient();
    const service = createTauriIngestService(
      helperClient,
      async () =>
        ({
          assetId: audioAssetId,
          originalFileName: "local sample.mp3",
          libraryRelativePath: `audios/${audioAssetId}/local-sample.mp3`,
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
        originalFileName: "local sample.mp3",
        libraryPath: `audios/${audioAssetId}/local-sample.mp3`,
        fileSizeBytes: 2048,
      });
      expect(result.video.durationSeconds).toBe(120);
      expect(result.video.thumbnailPath).toBeUndefined();
    }

    expect(
      helperClient.eventsForJob(`probe-audios/${audioAssetId}/local-sample.mp3`),
    ).toHaveLength(3);
  });

  it("copies PDF files with page count metadata in Tauri mode", async () => {
    const helperClient = new FakeHelperClient();
    const service = createTauriIngestService(
      helperClient,
      async () =>
        ({
          assetId: pdfAssetId,
          originalFileName: "demo paper.pdf",
          libraryRelativePath: `pdfs/${pdfAssetId}/demo-paper.pdf`,
          fileSizeBytes: 4096,
          sourceType: "pdf",
          pageCount: 7,
        }) as never,
    );

    const result = await service.importLocalFile({
      sourcePath: "/tmp/demo paper.pdf",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video).toMatchObject({
        sourceType: "pdf",
        sourceKind: "local-file",
        originalFileName: "demo paper.pdf",
        libraryPath: `pdfs/${pdfAssetId}/demo-paper.pdf`,
        fileSizeBytes: 4096,
        pageCount: 7,
      });
      expect(result.video.durationSeconds).toBeUndefined();
      expect(result.video.thumbnailPath).toBeUndefined();
    }

    expect(helperClient.eventsForJob(`probe-pdfs/${pdfAssetId}/demo-paper.pdf`))
      .toHaveLength(0);
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
        originalFileName: "fake-video.mp4",
        libraryPath: expect.stringMatching(/^videos\/youtube-/),
        durationSeconds: 120,
        fileSizeBytes: 1048576,
        thumbnailPath: expect.stringMatching(
          /^videos\/youtube-.*\/thumbnail\/Fake-YouTube-Video-thumbnail\.jpg$/,
        ),
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

  it("transcodes downloaded H.264 video when the probed frame rate is too high for WebView", async () => {
    const commands: string[] = [];
    const highFrameRateHelper: HelperClient = {
      async run(command) {
        commands.push(command.command);

        if (command.command === "download_youtube") {
          return {
            command: "download_youtube",
            videoPath: `${command.outputDir}/source.mp4`,
            title: "High Frame Rate Video",
            captionsAvailable: false,
          };
        }

        if (command.command === "probe_media") {
          return {
            command: "probe_media",
            durationSeconds: 120,
            fileSizeBytes: 1048576,
            container: "mov,mp4",
            videoCodec: "h264",
            audioCodec: "aac",
            width: 1280,
            height: 720,
            frameRate: 60000 / 1001,
            pixelFormat: "yuv420p",
          };
        }

        if (command.command === "transcode_video") {
          expect(command.videoPath).toMatch(/source\.mp4$/);
          expect(command.outputPath).toMatch(/playback\.mp4$/);
          return {
            command: "transcode_video",
            videoPath: command.outputPath,
          };
        }

        if (command.command === "extract_thumbnail") {
          return {
            command: "extract_thumbnail",
            thumbnailPath: command.outputPath,
          };
        }

        throw new Error(`unexpected command: ${command.command}`);
      },
      eventsForJob() {
        return [];
      },
    };
    const service = createTauriIngestService(highFrameRateHelper);

    const result = await service.importYoutubeUrl({
      url: "https://www.youtube.com/watch?v=openclip-test-id",
      nowIso: "2026-05-21T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video.libraryPath).toMatch(/\/playback\.mp4$/);
    }
    expect(commands).toContain("transcode_video");
  });

  it("classifies 60fps MP4 probes as requiring a playback transcode", () => {
    expect(
      isWebviewPlayableProbe({
        command: "probe_media",
        durationSeconds: 120,
        fileSizeBytes: 1048576,
        container: "mov,mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        frameRate: 60000 / 1001,
        pixelFormat: "yuv420p",
      }),
    ).toBe(false);
  });
});
