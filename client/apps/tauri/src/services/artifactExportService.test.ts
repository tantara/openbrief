import { describe, expect, it, vi } from "vitest";
import { createArtifactExportService } from "@/services/artifactExportService";
import { FakeHelperClient } from "@/services/fakeHelperClient";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import type { VideoAsset } from "@/domain/media-library";

describe("artifactExportService", () => {
  it("exports an arbitrary library artifact to the selected save path", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/chat-1-voice.wav",
      sourceRelativePath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
      bytesWritten: 12,
    });
    const fileDialogService = {
      selectVideoFile: vi.fn(),
      selectImageFile: vi.fn(),
      selectSavePath: vi.fn().mockResolvedValue("/exports/chat-1-voice.wav"),
    };
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService,
    });

    await service.exportLibraryArtifact({
      sourceRelativePath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
      defaultFileName: "chat-1-voice.wav",
      label: "voice message",
      filters: [{ name: "Audio", extensions: ["wav"] }],
    });

    expect(fileDialogService.selectSavePath).toHaveBeenCalledWith({
      title: "Export voice message",
      defaultPath: "chat-1-voice.wav",
      filters: [{ name: "Audio", extensions: ["wav"] }],
    });
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
      outputDirectory: "/exports",
      fileName: "chat-1-voice.wav",
    });
  });

  it("asks for an editable save path before exporting a video artifact", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/source.mp4",
      sourceRelativePath: "videos/video-1/source.mp4",
      bytesWritten: 10,
    });
    const fileDialogService = {
      selectVideoFile: vi.fn(),
      selectImageFile: vi.fn(),
      selectSavePath: vi.fn().mockResolvedValue("/exports/Renamed video.mp4"),
    };
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService,
    });

    await service.exportVideoArtifact({ video, kind: "video" });

    expect(fileDialogService.selectSavePath).toHaveBeenCalledWith({
      title: "Export video",
      defaultPath: "source.mp4",
      filters: [{ name: "Video", extensions: ["mp4"] }],
    });
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/source.mp4",
      outputDirectory: "/exports",
      fileName: "Renamed video.mp4",
    });
  });

  it("extracts audio before exporting it to the selected save path", async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === "resolve_library_file_path") {
        throw new Error("library_file_not_found");
      }

      return {
        targetPath: "/exports/Workbench-sample.wav",
        sourceRelativePath: "videos/video-1/audio/Workbench-sample-audio.wav",
        bytesWritten: 10,
      };
    }) as unknown as TauriInvoke;
    const helperClient = new FakeHelperClient();
    const service = createArtifactExportService({
      invokeCommand,
      helperClient,
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/Custom audio.wav"),
      },
    });

    await service.exportVideoArtifact({ video, kind: "audio" });

    expect(helperClient.eventsForJob("export-audio-video-1").length).toBeGreaterThan(0);
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/audio/Workbench-sample-audio.wav",
      outputDirectory: "/exports",
      fileName: "Custom audio.wav",
    });
  });

  it("reuses an existing extracted audio artifact for audio exports", async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === "resolve_library_file_path") {
        return "/library/videos/video-1/audio/Workbench-sample-audio.wav";
      }

      return {
        targetPath: "/exports/Custom audio.wav",
        sourceRelativePath: "videos/video-1/audio/Workbench-sample-audio.wav",
        bytesWritten: 10,
      };
    }) as unknown as TauriInvoke;
    const helperClient = new FakeHelperClient();
    const service = createArtifactExportService({
      invokeCommand,
      helperClient,
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/Custom audio.wav"),
      },
    });

    await service.exportVideoArtifact({ video, kind: "audio" });

    expect(helperClient.eventsForJob("export-audio-video-1")).toHaveLength(0);
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/audio/Workbench-sample-audio.wav",
      outputDirectory: "/exports",
      fileName: "Custom audio.wav",
    });
  });

  it("exports original audio files without running video extraction", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/original.mp3",
      sourceRelativePath: "audio/local-song/song.mp3",
      bytesWritten: 10,
    });
    const helperClient = new FakeHelperClient();
    const service = createArtifactExportService({
      invokeCommand,
      helperClient,
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/original.mp3"),
      },
    });

    await service.exportVideoArtifact({
      video: {
        ...video,
        sourceType: "audio",
        libraryPath: "audio/local-song/song.mp3",
      },
      kind: "audio",
    });

    expect(helperClient.eventsForJob("export-audio-video-1")).toHaveLength(0);
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "audio/local-song/song.mp3",
      outputDirectory: "/exports",
      fileName: "original.mp3",
    });
  });

  it("generates a missing thumbnail before exporting it", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/poster.jpg",
      sourceRelativePath: "videos/video-1/thumbnail/Workbench-sample-thumbnail.jpg",
      bytesWritten: 10,
    });
    const helperClient = new FakeHelperClient();
    const service = createArtifactExportService({
      invokeCommand,
      helperClient,
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/custom-poster.jpg"),
      },
    });

    await service.exportVideoArtifact({
      video: { ...video, thumbnailPath: undefined },
      kind: "thumbnail",
    });

    expect(helperClient.eventsForJob("export-thumbnail-video-1").length)
      .toBeGreaterThan(0);
    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/thumbnail/Workbench-sample-thumbnail.jpg",
      outputDirectory: "/exports",
      fileName: "custom-poster.jpg",
    });
  });

  it("exports a saved markdown summary artifact", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/Workbench sample.md",
      sourceRelativePath: "videos/video-1/summary/summary-video-1/summary.md",
      bytesWritten: 10,
    });
    const selectSavePath = vi.fn().mockResolvedValue("/exports/custom-summary.md");
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath,
      },
    });

    await service.exportVideoArtifact({
      video,
      kind: "summary",
      summary: {
        id: "summary-video-1",
        videoId: "video-1",
        markdown: "# Summary",
        provider: "openai",
        sourceSegmentCount: 1,
        artifactPath: "videos/video-1/summary/summary-video-1/summary.md",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    });

    expect(selectSavePath).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "Workbench-sample-summary-video-1.md",
      }),
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(1, "write_text_artifact", {
      relativePath: "videos/video-1/summary/summary-video-1/summary.md",
      text: "# Summary",
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(2, "export_library_artifact", {
      sourceRelativePath: "videos/video-1/summary/summary-video-1/summary.md",
      outputDirectory: "/exports",
      fileName: "custom-summary.md",
    });
  });

  it("writes current transcript text before exporting transcription", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/transcript.txt",
      sourceRelativePath: "videos/video-1/transcript/Workbench-sample_transcription.txt",
      bytesWritten: 10,
    });
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/transcript.txt"),
      },
    });

    await service.exportVideoArtifact({
      video,
      kind: "transcription",
      transcript: [
        {
          id: "segment-1",
          startSeconds: 0,
          text: "Opening segment",
          sourceKind: "local-stt",
        },
        {
          id: "segment-2",
          startSeconds: 65,
          text: "Second segment",
          sourceKind: "local-stt",
        },
      ],
    });

    expect(invokeCommand).toHaveBeenNthCalledWith(1, "write_text_artifact", {
      relativePath: "videos/video-1/transcript/Workbench-sample_transcription.txt",
      text: "0:00\tOpening segment\n1:05\tSecond segment",
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(2, "export_library_artifact", {
      sourceRelativePath: "videos/video-1/transcript/Workbench-sample_transcription.txt",
      outputDirectory: "/exports",
      fileName: "transcript.txt",
    });
  });

  it("rejects transcription export when no transcript is available", async () => {
    const service = createArtifactExportService({
      invokeCommand: vi.fn(),
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports"),
      },
    });

    await expect(
      service.exportVideoArtifact({ video, kind: "transcription" }),
    ).rejects.toThrow("transcription_export_unavailable");
  });

  it("rejects summary export when no saved markdown artifact exists", async () => {
    const service = createArtifactExportService({
      invokeCommand: vi.fn(),
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports"),
      },
    });

    await expect(
      service.exportVideoArtifact({ video, kind: "summary" }),
    ).rejects.toThrow("summary_export_unavailable");
  });

  it("does nothing when the user cancels save path selection", async () => {
    const invokeCommand = vi.fn();
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.exportVideoArtifact({ video, kind: "video" }),
    ).resolves.toBeUndefined();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("splits Windows save paths into output directory and filename", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "C:\\Exports\\Renamed video.mp4",
      sourceRelativePath: "videos/video-1/source.mp4",
      bytesWritten: 10,
    });
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("C:\\Exports\\Renamed video.mp4"),
      },
    });

    await service.exportVideoArtifact({ video, kind: "video" });

    expect(invokeCommand).toHaveBeenCalledWith("export_library_artifact", {
      sourceRelativePath: "videos/video-1/source.mp4",
      outputDirectory: "C:\\Exports",
      fileName: "Renamed video.mp4",
    });
  });
});

const video: VideoAsset = {
  id: "video-1",
  title: "Workbench sample",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/source.mp4",
  thumbnailPath: "videos/video-1/thumbnail/video-1-thumbnail.jpg",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};
