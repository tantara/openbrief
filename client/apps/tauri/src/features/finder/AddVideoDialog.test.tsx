import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddVideoDialog } from "@/features/finder/AddVideoDialog";
import type { VideoAsset, VideoPlaylist } from "@/domain/media-library";

describe("AddVideoDialog", () => {
  it("adds an existing library video to a playlist", () => {
    const onAddExistingVideo = vi.fn();

    render(
      <AddVideoDialog
        open
        onOpenChange={vi.fn()}
        playlist={playlist}
        videos={videos}
        onAddExistingVideo={onAddExistingVideo}
        onImportLocalFile={vi.fn().mockResolvedValue(undefined)}
        onImportYoutubeUrl={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /from library/i }));
    fireEvent.change(screen.getByPlaceholderText(/search library videos/i), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("button", { name: /second video/i }));

    expect(onAddExistingVideo).toHaveBeenCalledWith("playlist-1", "video-2");
  });

  it("submits a new video URL and closes after import", async () => {
    const onOpenChange = vi.fn();
    const onImportYoutubeUrl = vi.fn().mockResolvedValue(undefined);

    render(
      <AddVideoDialog
        open
        onOpenChange={onOpenChange}
        videos={videos}
        onAddExistingVideo={vi.fn()}
        onImportLocalFile={vi.fn().mockResolvedValue(undefined)}
        onImportYoutubeUrl={onImportYoutubeUrl}
      />,
    );

    fireEvent.change(screen.getByLabelText(/video url/i), {
      target: { value: "https://youtu.be/example" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onImportYoutubeUrl).toHaveBeenCalledWith("https://youtu.be/example");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

const videos: VideoAsset[] = [
  {
    id: "video-1",
    title: "First video",
    sourceKind: "youtube",
    originalUri: "https://youtu.be/first",
    libraryPath: "videos/video-1/source.mp4",
    importStatus: "ready",
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "video-2",
    title: "Second video",
    sourceKind: "vimeo",
    originalUri: "https://vimeo.com/second",
    libraryPath: "videos/video-2/source.mp4",
    importStatus: "ready",
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
];

const playlist: VideoPlaylist = {
  id: "playlist-1",
  title: "Research queue",
  videoIds: ["video-1"],
  createdAtIso: "2026-05-21T00:00:00.000Z",
  updatedAtIso: "2026-05-21T00:00:00.000Z",
};
