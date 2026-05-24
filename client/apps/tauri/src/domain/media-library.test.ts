import { describe, expect, it } from "vitest";
import {
  createLibraryRelativePath,
  addVideoToPlaylist,
  createChatSessionArtifactPath,
  createVideoPlaylist,
  createVideoEvidenceAnchors,
  filterVideoLibrary,
  playlistVideos,
  renameVideoPlaylist,
  reorderPlaylistVideos,
  setVideoPlaylistCover,
  createSummaryArtifactPath,
  createVideoArtifactDirectory,
  createVideoArtifactBundle,
  createVideoBundleManifest,
  createVideoAudioArtifactPath,
  createVideoPosterArtifactPath,
  createVideoTranscriptArtifactDirectory,
  createVideoTranscriptJsonArtifactPath,
  getStoragePolicy,
  libraryDirectories,
  sanitizePathSegment,
  selectTranscriptSource,
} from "@/domain/media-library";

describe("media library contracts", () => {
  it("keeps the planned app-managed library directories stable", () => {
    expect(libraryDirectories).toEqual([
      "videos",
      "audios",
      "pdfs",
      "playlists",
      "thumbnails",
      "transcripts",
      "summaries",
      "job-temp",
    ]);
  });

  it("copies local imports into app-managed storage on every platform", () => {
    expect(getStoragePolicy("macos")?.localImportStrategy).toBe("copy-into-library");
    expect(getStoragePolicy("windows")?.localImportStrategy).toBe("copy-into-library");
    expect(getStoragePolicy("linux")?.localImportStrategy).toBe("copy-into-library");
  });

  it("prefers YouTube captions before local STT", () => {
    expect(selectTranscriptSource(true)).toBe("youtube-captions");
    expect(selectTranscriptSource(false)).toBe("local-stt");
  });

  it("sanitizes path segments before constructing library paths", () => {
    expect(sanitizePathSegment("../bad/name.mp4")).toBe("bad-name.mp4");
    expect(createLibraryRelativePath("videos", "../asset", "source file.mp4")).toBe(
      "videos/asset/source-file.mp4",
    );
  });

  it("keeps per-video artifact paths under the video directory", () => {
    const bundle = createVideoArtifactBundle("video-1");

    expect(createVideoArtifactDirectory("video-1")).toBe("videos/video-1");
    expect(bundle.manifestPath).toBe("videos/video-1/openbrief-video.json");
    expect(createVideoPosterArtifactPath("video-1")).toBe(
      "videos/video-1/thumbnail/video-1-thumbnail.jpg",
    );
    expect(createVideoPosterArtifactPath("video-1", "Design Review.mp4")).toBe(
      "videos/video-1/thumbnail/Design-Review-thumbnail.jpg",
    );
    expect(createVideoAudioArtifactPath("video-1", "Design Review.mp4")).toBe(
      "videos/video-1/audio/Design-Review-audio.wav",
    );
    expect(createVideoTranscriptArtifactDirectory("video-1")).toBe(
      "videos/video-1/transcript",
    );
    expect(createVideoTranscriptJsonArtifactPath("video-1")).toBe(
      "videos/video-1/transcript/transcript.json",
    );
    expect(createSummaryArtifactPath("video-1", "summary main")).toBe(
      "videos/video-1/summary/summary-main.md",
    );
    expect(
      createSummaryArtifactPath(
        "video-1",
        "summary-video-1-2026-05-21T00-00-00-000Z",
        "Design Review.mp4",
      ),
    ).toBe(
      "videos/video-1/summary/Design-Review-summary-2026-05-21T00-00-00-000Z.md",
    );
    expect(createChatSessionArtifactPath("video-1", "session 1")).toBe(
      "videos/video-1/chat/session-1.jsonl",
    );
  });

  it("creates a typed manifest for portable video bundles", () => {
    const video = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube" as const,
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/source.mp4",
      thumbnailPath: "videos/video-1/thumbnail/video-1-thumbnail.jpg",
      importStatus: "ready" as const,
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };

    expect(
      createVideoBundleManifest({
        video,
        summaryPaths: ["videos/video-1/summary/summary-1.md"],
        chatSessionPaths: ["videos/video-1/chat/default.jsonl"],
      }),
    ).toEqual({
      schemaVersion: 1,
      videoId: "video-1",
      video,
      artifacts: {
        thumbnailPath: "videos/video-1/thumbnail/video-1-thumbnail.jpg",
        transcriptVariantPaths: [],
        summaryPaths: ["videos/video-1/summary/summary-1.md"],
        chatSessionPaths: ["videos/video-1/chat/default.jsonl"],
      },
    });
  });

  it("filters videos by transcript and summary evidence for the searchable archive", () => {
    const videos = [
      {
        id: "video-1",
        title: "Design Review",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/example",
        libraryPath: "videos/video-1/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      {
        id: "video-2",
        title: "Travel Clip",
        sourceKind: "vimeo" as const,
        originalUri: "https://vimeo.com/123",
        libraryPath: "videos/video-2/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];

    const results = filterVideoLibrary({
      videos,
      transcriptsByVideoId: {
        "video-1": [
          {
            id: "s1",
            startSeconds: 12,
            text: "The speaker explains component architecture.",
            sourceKind: "youtube-captions",
          },
        ],
      },
      summariesByVideoId: {
        "video-1": {
          id: "summary-video-1",
          videoId: "video-1",
          markdown: "# Architecture Notes",
          provider: "openai",
          sourceSegmentCount: 1,
          createdAtIso: "2026-05-21T00:00:00.000Z",
        },
      },
      query: {
        searchText: "component architecture",
        sourceKind: "youtube",
        transcriptStatus: "with-transcript",
        summaryStatus: "with-summary",
      },
    });

    expect(results.map((video) => video.id)).toEqual(["video-1"]);
  });

  it("matches Korean search text across composed syllables and partial jamo input", () => {
    const videos = [
      {
        id: "korean-sample-video",
        title: "크보 분석 샘플",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/korean-sample",
        libraryPath: "videos/korean-sample/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      {
        id: "other-video",
        title: "여행 샘플 영상",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/travel",
        libraryPath: "videos/travel/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];

    for (const searchText of ["크보", "크ㅂ", "큽", "ㅋㅂ"]) {
      expect(
        filterVideoLibrary({ videos, query: { searchText } }).map(
          (video) => video.id,
        ),
      ).toEqual(["korean-sample-video"]);
    }
  });

  it("matches English search text case-insensitively", () => {
    const videos = [
      {
        id: "english-sample-video",
        title: "MLB analysis sample",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/english-sample",
        libraryPath: "videos/english-sample/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      {
        id: "other-video",
        title: "Travel vlog sample",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/travel",
        libraryPath: "videos/travel/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];

    for (const searchText of ["MLB", "mlb", "analysis"]) {
      expect(
        filterVideoLibrary({ videos, query: { searchText } }).map(
          (video) => video.id,
        ),
      ).toEqual(["english-sample-video"]);
    }
  });

  it("sorts filtered videos by created date, duration, and file size", () => {
    const videos = [
      {
        id: "older-short-small",
        title: "Older short small",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/older",
        libraryPath: "videos/older/source.mp4",
        importStatus: "ready" as const,
        durationSeconds: 30,
        fileSizeBytes: 100,
        createdAtIso: "2026-05-20T00:00:00.000Z",
      },
      {
        id: "newer-medium-large",
        title: "Newer medium large",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/newer",
        libraryPath: "videos/newer/source.mp4",
        importStatus: "ready" as const,
        durationSeconds: 60,
        fileSizeBytes: 300,
        createdAtIso: "2026-05-22T00:00:00.000Z",
      },
      {
        id: "middle-long-medium",
        title: "Middle long medium",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/middle",
        libraryPath: "videos/middle/source.mp4",
        importStatus: "ready" as const,
        durationSeconds: 120,
        fileSizeBytes: 200,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];

    expect(
      filterVideoLibrary({ videos, query: { sortBy: "created_at" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["newer-medium-large", "middle-long-medium", "older-short-small"]);
    expect(
      filterVideoLibrary({ videos, query: { sortBy: "created_at_asc" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["older-short-small", "middle-long-medium", "newer-medium-large"]);
    expect(
      filterVideoLibrary({ videos, query: { sortBy: "time" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["middle-long-medium", "newer-medium-large", "older-short-small"]);
    expect(
      filterVideoLibrary({ videos, query: { sortBy: "time_asc" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["older-short-small", "newer-medium-large", "middle-long-medium"]);
    expect(
      filterVideoLibrary({ videos, query: { sortBy: "size" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["newer-medium-large", "middle-long-medium", "older-short-small"]);
    expect(
      filterVideoLibrary({ videos, query: { sortBy: "size_asc" } }).map(
        (video) => video.id,
      ),
    ).toEqual(["older-short-small", "middle-long-medium", "newer-medium-large"]);
  });

  it("creates, renames, appends, and reorders playlist videos", () => {
    const playlist = createVideoPlaylist({
      id: "playlist-1",
      title: " Launch queue ",
      nowIso: "2026-05-21T00:00:00.000Z",
    });
    const withFirstVideo = addVideoToPlaylist(playlist, "video-1");
    const withDuplicate = addVideoToPlaylist(withFirstVideo, "video-1");
    const withSecondVideo = addVideoToPlaylist(withDuplicate, "video-2");
    const reordered = reorderPlaylistVideos(withSecondVideo, 1, 0);
    const renamed = renameVideoPlaylist(
      reordered,
      "Review later",
      "2026-05-21T00:01:00.000Z",
    );
    const covered = setVideoPlaylistCover(
      renamed,
      "playlists/playlist-1/cover.png",
      "2026-05-21T00:02:00.000Z",
    );

    expect(playlist.title).toBe("Launch queue");
    expect(withDuplicate.videoIds).toEqual(["video-1"]);
    expect(reordered.videoIds).toEqual(["video-2", "video-1"]);
    expect(renamed).toMatchObject({
      id: "playlist-1",
      title: "Review later",
      updatedAtIso: "2026-05-21T00:01:00.000Z",
    });
    expect(covered).toMatchObject({
      coverImagePath: "playlists/playlist-1/cover.png",
      updatedAtIso: "2026-05-21T00:02:00.000Z",
    });
  });

  it("resolves playlist videos in saved order and skips missing videos", () => {
    const videos = [
      {
        id: "video-1",
        title: "First",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/first",
        libraryPath: "videos/first/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      {
        id: "video-2",
        title: "Second",
        sourceKind: "youtube" as const,
        originalUri: "https://youtu.be/second",
        libraryPath: "videos/second/source.mp4",
        importStatus: "ready" as const,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];

    expect(
      playlistVideos(
        {
          id: "playlist-1",
          title: "Playlist",
          videoIds: ["video-2", "missing", "video-1"],
          createdAtIso: "2026-05-21T00:00:00.000Z",
          updatedAtIso: "2026-05-21T00:00:00.000Z",
        },
        videos,
      ).map((video) => video.id),
    ).toEqual(["video-2", "video-1"]);
  });

  it("models video transcript spans as reusable evidence anchors", () => {
    const anchors = createVideoEvidenceAnchors({
      video: {
        id: "video-1",
        title: "Design Review",
        sourceKind: "youtube",
        originalUri: "https://youtu.be/example",
        libraryPath: "videos/video-1/source.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      transcript: [
        {
          id: "s1",
          startSeconds: 65,
          endSeconds: 70,
          text: "Timestamp evidence",
          sourceKind: "youtube-captions",
        },
      ],
    });

    expect(anchors[0]).toMatchObject({
      sourceKind: "video",
      kind: "timestamp-range",
      label: "1:05",
      startSeconds: 65,
      endSeconds: 70,
    });
  });
});
