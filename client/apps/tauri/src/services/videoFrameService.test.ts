import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelperClient } from "@/services/fakeHelperClient";
import { createVideoFrameService } from "@/services/videoFrameService";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

describe("video frame service", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("uses an existing frame artifact without invoking ffmpeg", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const invokeCommand = vi
      .fn()
      .mockResolvedValue("/library/videos/video-1/frames/75.jpg");
    const helperClient = {
      run: vi.fn(),
      eventsForJob: vi.fn(() => []),
    } satisfies HelperClient;
    const service = createVideoFrameService({ invokeCommand, helperClient });

    await expect(
      service.getFramePreview({ video: videoFixture, seconds: 75 }),
    ).resolves.toEqual({
      relativePath: "videos/video-1/frames/75.jpg",
      imageUrl: "asset://localhost//library/videos/video-1/frames/75.jpg",
      cached: true,
    });
    expect(helperClient.run).not.toHaveBeenCalled();
  });

  it("extracts and resolves a missing frame artifact", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const invokeCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error("library_file_not_found"))
      .mockResolvedValueOnce("/library/videos/video-1/frames/75.jpg");
    const helperClient = {
      run: vi.fn(async (command) => ({
        command: "extract_thumbnail" as const,
        thumbnailPath: command.outputPath,
      })),
      eventsForJob: vi.fn(() => []),
    } satisfies HelperClient;
    const service = createVideoFrameService({ invokeCommand, helperClient });

    await expect(
      service.getFramePreview({ video: videoFixture, seconds: 75.9 }),
    ).resolves.toEqual({
      relativePath: "videos/video-1/frames/75.jpg",
      imageUrl: "asset://localhost//library/videos/video-1/frames/75.jpg",
      cached: false,
    });
    expect(helperClient.run).toHaveBeenCalledWith({
      protocolVersion: 1,
      command: "extract_thumbnail",
      jobId: "frame-preview-video-1-75",
      videoPath: "videos/video-1/source.mp4",
      outputPath: "videos/video-1/frames/75.jpg",
      tempDir: "job-temp/video-1",
      timestampSeconds: 75,
    });
  });
});

const videoFixture = {
  id: "video-1",
  title: "Source",
  sourceKind: "local-file",
  originalUri: "file:///source.mp4",
  libraryPath: "videos/video-1/source.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-24T00:00:00.000Z",
} as const;

