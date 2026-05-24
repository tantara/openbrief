import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTranscriptOverlayPayload,
  hideTranscriptOverlay,
  showTranscriptOverlay,
} from "@/services/transcriptOverlayService";
import type { TranscriptSegment, VideoAsset } from "@/domain/media-library";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("transcriptOverlayService", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("does not try to open the overlay outside the Tauri runtime", async () => {
    const invokeCommand = vi.fn();

    await expect(
      showTranscriptOverlay({
        videoTitle: "Demo",
        timestamp: "0:12",
        text: "Transcript line",
      }, invokeCommand),
    ).resolves.toBe(false);

    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("opens the overlay through the trusted Tauri command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const invokeCommand = vi.fn().mockResolvedValue(true);
    const payload = {
      videoTitle: "Demo",
      timestamp: "0:12",
      text: "Transcript line",
    };

    await expect(showTranscriptOverlay(payload, invokeCommand)).resolves.toBe(true);

    expect(invokeCommand).toHaveBeenCalledWith("show_transcript_overlay", {
      payload,
    });
  });

  it("hides the overlay through the trusted Tauri command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const invokeCommand = vi.fn().mockResolvedValue(true);

    await expect(hideTranscriptOverlay(invokeCommand)).resolves.toBe(true);

    expect(invokeCommand).toHaveBeenCalledWith("hide_transcript_overlay");
  });

  it("creates the current-segment payload with a no-transcript fallback", () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Demo",
      sourceKind: "youtube",
      originalUri: "https://example.com/watch?v=demo",
      libraryPath: "videos/video-1/source.mp4",
      durationSeconds: 120,
      importStatus: "ready",
      createdAtIso: "2026-05-22T12:00:00.000Z",
    };
    const segment: TranscriptSegment = {
      id: "segment-1",
      startSeconds: 12,
      endSeconds: 16,
      text: "Transcript line",
      sourceKind: "youtube-captions",
    };
    const nextSegment: TranscriptSegment = {
      id: "segment-2",
      startSeconds: 16,
      endSeconds: 20,
      text: "Next transcript line",
      sourceKind: "youtube-captions",
    };

    expect(
      createTranscriptOverlayPayload({
        video,
        segment,
        nextSegment,
        timestamp: "0:12",
      }),
    ).toEqual({
      videoTitle: "Demo",
      timestamp: "0:12",
      text: "Transcript line",
      nextText: "Next transcript line",
    });
    expect(
      createTranscriptOverlayPayload({
        video,
        timestamp: "0:13",
      }).text,
    ).toBe("No transcript at the current timestamp.");
  });
});
