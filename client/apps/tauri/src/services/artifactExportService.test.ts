import { describe, expect, it, vi } from "vitest";
import { createArtifactExportService } from "@/services/artifactExportService";
import { FakeHelperClient } from "@/services/fakeHelperClient";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import type { VideoAsset } from "@/domain/media-library";

describe("artifactExportService", () => {
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
        sourceRelativePath: "videos/video-1/audio/audio.wav",
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
      sourceRelativePath: "videos/video-1/audio/audio.wav",
      outputDirectory: "/exports",
      fileName: "Custom audio.wav",
    });
  });

  it("reuses an existing extracted audio artifact for audio exports", async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === "resolve_library_file_path") {
        return "/library/videos/video-1/audio/audio.wav";
      }

      return {
        targetPath: "/exports/Custom audio.wav",
        sourceRelativePath: "videos/video-1/audio/audio.wav",
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
      sourceRelativePath: "videos/video-1/audio/audio.wav",
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
      sourceRelativePath: "videos/video-1/thumbnail/poster.jpg",
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
      sourceRelativePath: "videos/video-1/thumbnail/poster.jpg",
      outputDirectory: "/exports",
      fileName: "custom-poster.jpg",
    });
  });

  it("exports a saved markdown summary artifact", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({
      targetPath: "/exports/Workbench sample.md",
      sourceRelativePath: "videos/video-1/summary/summary-video-1.md",
      bytesWritten: 10,
    });
    const service = createArtifactExportService({
      invokeCommand,
      helperClient: new FakeHelperClient(),
      fileDialogService: {
        selectVideoFile: vi.fn(),
        selectImageFile: vi.fn(),
        selectSavePath: vi.fn().mockResolvedValue("/exports/custom-summary.md"),
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
        artifactPath: "videos/video-1/summary/summary-video-1.md",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    });

    expect(invokeCommand).toHaveBeenNthCalledWith(1, "write_markdown_summary", {
      relativePath: "videos/video-1/summary/summary-video-1.md",
      markdown: "# Summary",
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(2, "export_library_artifact", {
      sourceRelativePath: "videos/video-1/summary/summary-video-1.md",
      outputDirectory: "/exports",
      fileName: "custom-summary.md",
    });
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
  thumbnailPath: "videos/video-1/thumbnail/poster.jpg",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};
