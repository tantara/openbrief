import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import type { VideoAsset } from "@/domain/media-library";

vi.mock("@/services/browserThumbnail", () => ({
  generateVideoThumbnail: vi.fn(async () => "blob:poster"),
}));

describe("VideoPlayer", () => {
  it("shows the thumbnail before the video has played", async () => {
    const onPlay = vi.fn();

    render(
      <VideoPlayer
        video={{ ...videoFixture, thumbnailPath: "videos/video-1/thumb.jpg" }}
        activeVideoId="video-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPlay={onPlay}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
      />,
    );

    const playButton = await screen.findByRole("button", {
      name: /play fullscreen sample/i,
    });

    expect(playButton.querySelector("img")).toHaveAttribute(
      "src",
      "videos/video-1/thumb.jpg",
    );

    fireEvent.click(playButton);
    expect(onPlay).toHaveBeenCalledWith("video-1");
  });

  it("expands the player inside the app shell without native fullscreen", () => {
    render(
      <VideoPlayer
        video={videoFixture}
        activeVideoId="video-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /enter fullscreen/i }));

    expect(screen.getByRole("button", { name: /exit fullscreen/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Fullscreen sample").parentElement).toHaveClass(
      "fixed",
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("button", { name: /enter fullscreen/i })).toBeInTheDocument();
  });

  it("keeps active playback running when switching app fullscreen", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());

    render(
      <VideoPlayer
        video={videoFixture}
        activeVideoId="video-1"
        isPlaying
        currentTimeSeconds={12}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
      />,
    );

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /enter fullscreen/i }));

    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    play.mockRestore();
  });

  it("uses focused player shortcuts for playback, mute, and seeking", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onTimeUpdate = vi.fn();

    render(
      <VideoPlayer
        video={videoFixture}
        activeVideoId="video-1"
        isPlaying
        currentTimeSeconds={20}
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={onTimeUpdate}
        onEnded={vi.fn()}
      />,
    );

    const video = screen.getByLabelText("Fullscreen sample") as HTMLVideoElement;
    const player = video.parentElement;
    expect(player).not.toBeNull();
    video.currentTime = 20;

    fireEvent.keyDown(player!, { key: " " });
    expect(onPause).toHaveBeenCalledWith("video-1");

    fireEvent.keyDown(player!, { key: "m" });
    expect(video.muted).toBe(true);

    fireEvent.keyDown(player!, { key: "ArrowRight" });
    expect(onTimeUpdate).toHaveBeenLastCalledWith("video-1", 25);

    fireEvent.keyDown(player!, { key: "ArrowLeft" });
    expect(onTimeUpdate).toHaveBeenLastCalledWith("video-1", 20);

    play.mockRestore();
  });

  it("does not hijack button keyboard events inside the player", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    const onPause = vi.fn();

    render(
      <VideoPlayer
        video={videoFixture}
        activeVideoId="video-1"
        isPlaying
        currentTimeSeconds={0}
        onPlay={vi.fn()}
        onPause={onPause}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /enter fullscreen/i }), {
      key: " ",
    });

    expect(onPause).not.toHaveBeenCalled();

    play.mockRestore();
  });
});

const videoFixture: VideoAsset = {
  id: "video-1",
  title: "Fullscreen sample",
  sourceKind: "local-file",
  originalUri: "/tmp/sample.mp4",
  libraryPath: "videos/video-1/source.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};
