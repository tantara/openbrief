import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  clampMiniPlayerPosition,
  createInitialVideoPlaybackState,
  miniPlayerPositionFromCorner,
  shouldShowMiniPlayer,
  useVideoPlayback,
} from "@/hooks/useVideoPlayback";

describe("video playback state helpers", () => {
  it("starts without an active player", () => {
    expect(createInitialVideoPlaybackState()).toEqual({
      status: "idle",
      currentTimeSeconds: 0,
      miniPlayerCorner: "bottom-right",
      pictureInPictureActive: false,
    });
  });

  it("shows the mini player after playback leaves the workbench", () => {
    expect(
      shouldShowMiniPlayer(
        {
          activeVideoId: "video-1",
          status: "playing",
          currentTimeSeconds: 12,
          miniPlayerCorner: "bottom-right",
          pictureInPictureActive: false,
        },
        "finder",
      ),
    ).toBe(true);
    expect(
      shouldShowMiniPlayer(
        {
          activeVideoId: "video-1",
          status: "playing",
          currentTimeSeconds: 12,
          miniPlayerCorner: "bottom-right",
          pictureInPictureActive: false,
        },
        "workbench",
      ),
    ).toBe(false);
  });

  it("shows picture-in-picture while the workbench is active", () => {
    expect(
      shouldShowMiniPlayer(
        {
          activeVideoId: "video-1",
          status: "playing",
          currentTimeSeconds: 12,
          miniPlayerCorner: "bottom-right",
          pictureInPictureActive: true,
        },
        "workbench",
      ),
    ).toBe(true);
  });

  it("clamps draggable picture-in-picture windows inside the viewport", () => {
    expect(
      clampMiniPlayerPosition(
        { x: 900, y: -20 },
        { width: 800, height: 600 },
        { width: 320, height: 180 },
      ),
    ).toEqual({ x: 464, y: 16 });
  });

  it("can derive the default bottom-right picture-in-picture position", () => {
    expect(
      miniPlayerPositionFromCorner(
        "bottom-right",
        { width: 800, height: 600 },
        { width: 320, height: 180 },
      ),
    ).toEqual({ x: 464, y: 404 });
  });

  it("can keep a paused video in picture-in-picture without resuming it", () => {
    const { result } = renderHook(() => useVideoPlayback());

    act(() => result.current.playVideo("video-1"));
    act(() => result.current.updateVideoTime("video-1", 42));
    act(() => result.current.pauseVideo("video-1"));
    act(() =>
      result.current.openPictureInPicture("video-1", { preserveStatus: true }),
    );

    expect(result.current.playbackState).toMatchObject({
      activeVideoId: "video-1",
      status: "paused",
      currentTimeSeconds: 42,
      pictureInPictureActive: true,
    });
  });

  it("seeks an idle video without starting playback", () => {
    const { result } = renderHook(() => useVideoPlayback());

    act(() => result.current.seekVideo("video-1", 245));

    expect(result.current.playbackState).toMatchObject({
      activeVideoId: "video-1",
      status: "paused",
      currentTimeSeconds: 245,
      pictureInPictureActive: false,
    });
  });

  it("preserves playback when seeking the currently playing video", () => {
    const { result } = renderHook(() => useVideoPlayback());

    act(() => result.current.playVideo("video-1"));
    act(() => result.current.seekVideo("video-1", 245));

    expect(result.current.playbackState).toMatchObject({
      activeVideoId: "video-1",
      status: "playing",
      currentTimeSeconds: 245,
    });
  });

  it("can play a selected video from an external menu command", () => {
    const { result } = renderHook(() => useVideoPlayback());

    act(() => result.current.playActiveOrSelectedVideo("video-1"));

    expect(result.current.playbackState).toMatchObject({
      activeVideoId: "video-1",
      status: "playing",
      currentTimeSeconds: 0,
    });
  });

  it("pauses only the active video from an external menu command", () => {
    const { result } = renderHook(() => useVideoPlayback());

    act(() => result.current.pauseActiveVideo());
    expect(result.current.playbackState.status).toBe("idle");

    act(() => result.current.playVideo("video-1"));
    act(() => result.current.pauseActiveVideo());

    expect(result.current.playbackState).toMatchObject({
      activeVideoId: "video-1",
      status: "paused",
    });
  });
});
