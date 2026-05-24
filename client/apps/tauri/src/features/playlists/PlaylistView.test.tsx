import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VideoAsset, VideoPlaylist } from "@/domain/media-library";
import { PlaylistView } from "@/features/playlists/PlaylistView";

describe("PlaylistView", () => {
  it("creates a playlist from the list page", () => {
    const onCreatePlaylist = vi.fn(() => playlistFixture);
    const onSelectPlaylist = vi.fn();

    render(
      <PlaylistView
        {...defaultProps({
          playlists: [],
          onCreatePlaylist,
          onSelectPlaylist,
        })}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /new playlist/i })[0]);
    fireEvent.change(screen.getByLabelText(/playlist title/i), {
      target: { value: "Research queue" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^new playlist$/i }));

    expect(onCreatePlaylist).toHaveBeenCalledWith("Research queue");
    expect(onSelectPlaylist).toHaveBeenCalledWith("playlist-1");
  });

  it("renames and reorders videos on the detail page", () => {
    const onRenamePlaylist = vi.fn();
    const onReorderVideo = vi.fn();

    render(
      <PlaylistView
        {...defaultProps({
          selectedPlaylistId: "playlist-1",
          onRenamePlaylist,
          onReorderVideo,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/playlist title/i), {
      target: { value: "Updated queue" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save title/i }));
    fireEvent.click(screen.getByRole("button", { name: /move second video up/i }));

    expect(onRenamePlaylist).toHaveBeenCalledWith("playlist-1", "Updated queue");
    expect(onReorderVideo).toHaveBeenCalledWith("playlist-1", 1, 0);
  });

  it("adds an existing library video from the two-tab add dialog", () => {
    const onAddExistingVideo = vi.fn();

    render(
      <PlaylistView
        {...defaultProps({
          selectedPlaylistId: "playlist-1",
          onAddExistingVideo,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^add video$/i }));
    fireEvent.click(screen.getByRole("button", { name: /from library/i }));
    fireEvent.change(screen.getByPlaceholderText(/search library videos/i), {
      target: { value: "third" },
    });
    fireEvent.click(screen.getByRole("button", { name: /third video/i }));

    expect(onAddExistingVideo).toHaveBeenCalledWith("playlist-1", "video-3");
  });

  it("uses the first video thumbnail as the default cover and uploads a custom cover", async () => {
    const onChangePlaylistCover = vi.fn().mockResolvedValue(undefined);
    const fileDialogService = {
      selectVideoFile: vi.fn(),
      selectImageFile: vi.fn().mockResolvedValue("/tmp/cover.png"),
      selectSavePath: vi.fn(),
    };

    render(
      <PlaylistView
        {...defaultProps({
          selectedPlaylistId: "playlist-1",
          onChangePlaylistCover,
          fileDialogService,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Research queue")).toHaveAttribute(
        "src",
        "videos/video-1/thumb.jpg",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /change cover/i }));

    await waitFor(() => {
      expect(onChangePlaylistCover).toHaveBeenCalledWith(
        "playlist-1",
        "/tmp/cover.png",
      );
    });
  });
});

const videosFixture: VideoAsset[] = [
  {
    id: "video-1",
    title: "First video",
    sourceKind: "youtube",
    originalUri: "https://youtu.be/first",
    libraryPath: "videos/video-1/source.mp4",
    thumbnailPath: "videos/video-1/thumb.jpg",
    importStatus: "ready",
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "video-2",
    title: "Second video",
    sourceKind: "youtube",
    originalUri: "https://youtu.be/second",
    libraryPath: "videos/video-2/source.mp4",
    importStatus: "ready",
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
  {
    id: "video-3",
    title: "Third video",
    sourceKind: "vimeo",
    originalUri: "https://vimeo.com/third",
    libraryPath: "videos/video-3/source.mp4",
    importStatus: "ready",
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
];

const playlistFixture: VideoPlaylist = {
  id: "playlist-1",
  title: "Research queue",
  videoIds: ["video-1", "video-2"],
  createdAtIso: "2026-05-21T00:00:00.000Z",
  updatedAtIso: "2026-05-21T00:00:00.000Z",
};

function defaultProps(overrides: Partial<Parameters<typeof PlaylistView>[0]> = {}) {
  return {
    playlists: [playlistFixture],
    videos: videosFixture,
    selectedPlaylistId: undefined,
    onSelectPlaylist: vi.fn(),
    onBackToPlaylists: vi.fn(),
    onCreatePlaylist: vi.fn(() => playlistFixture),
    onRenamePlaylist: vi.fn(),
    onChangePlaylistCover: vi.fn().mockResolvedValue(undefined),
    onAddExistingVideo: vi.fn(),
    onImportLocalFile: vi.fn().mockResolvedValue(undefined),
    onImportYoutubeUrl: vi.fn().mockResolvedValue(undefined),
    onReorderVideo: vi.fn(),
    onOpenVideo: vi.fn(),
    ...overrides,
  };
}
