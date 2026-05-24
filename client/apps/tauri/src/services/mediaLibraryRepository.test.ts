import { describe, expect, it } from "vitest";
import type { MediaLibrarySnapshot } from "@/services/mediaLibraryRepository";
import {
  JsonMediaLibraryRepository,
  SqlMediaLibraryRepository,
  type MediaLibraryStorageAdapter,
} from "@/services/mediaLibraryRepository";
import type { TauriInvoke } from "@/services/tauriHelperClient";

describe("JSON media library repository", () => {
  it("saves and loads a complete media library snapshot", async () => {
    const storage = createMemoryStorageAdapter();
    const repository = new JsonMediaLibraryRepository(storage);
    const snapshot = createSnapshot();

    await repository.saveSnapshot(snapshot);

    expect(await repository.loadSnapshot()).toEqual(snapshot);
    expect(await repository.listVideos()).toEqual(snapshot.videos);
    expect(await repository.listIngestJobs()).toEqual(snapshot.ingestJobs);
    expect(await repository.listTranscriptJobs()).toEqual(snapshot.transcriptJobs);
    expect(await repository.listTranscript("video-1")).toEqual(
      snapshot.transcriptsByVideoId["video-1"],
    );
    expect(await repository.listPlaylists()).toEqual(snapshot.playlists);
  });

  it("keeps summaries and chats after constructing a fresh repository", async () => {
    const storage = createMemoryStorageAdapter();
    const snapshot = createSnapshot();

    await new JsonMediaLibraryRepository(storage).saveSnapshot(snapshot);
    const reloadedRepository = new JsonMediaLibraryRepository(storage);

    expect(await reloadedRepository.getSummary("video-1")).toEqual(
      snapshot.summariesByVideoId["video-1"],
    );
    expect(await reloadedRepository.listChatMessages("video-1")).toEqual(
      snapshot.chatMessagesByVideoId["video-1"],
    );
  });
});

describe("SQL media library repository", () => {
  it("delegates snapshot load and save to trusted Tauri commands", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const snapshot = createSnapshot();
    const invokeCommand: TauriInvoke = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      calls.push({ command, args });
      return (command === "load_media_library_snapshot" ? snapshot : undefined) as T;
    };
    const repository = new SqlMediaLibraryRepository(invokeCommand);

    expect(await repository.loadSnapshot()).toEqual(snapshot);
    await repository.saveSnapshot(snapshot);

    expect(calls).toEqual([
      { command: "load_media_library_snapshot", args: undefined },
      { command: "save_media_library_snapshot", args: { snapshot } },
    ]);
  });
});

function createMemoryStorageAdapter(): MediaLibraryStorageAdapter {
  const files = new Map<string, string>();

  return {
    async readText(path) {
      return files.get(path);
    },
    async writeText(path, contents) {
      files.set(path, contents);
    },
  };
}

function createSnapshot(): MediaLibrarySnapshot {
  return {
    videos: [
      {
        id: "video-1",
        title: "Design Review",
        sourceKind: "youtube",
        originalUri: "https://youtu.be/example",
        libraryPath: "videos/video-1/video.mp4",
        thumbnailPath: "videos/video-1/thumbnail/video-1-thumbnail.jpg",
        durationSeconds: 120,
        fileSizeBytes: 1024,
        importStatus: "ready",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ],
    ingestJobs: [
      {
        id: "ingest-1",
        sourceKind: "youtube",
        status: "completed",
        progressPercent: 100,
        videoId: "video-1",
      },
    ],
    transcriptJobs: [
      {
        id: "transcript-job-1",
        videoId: "video-1",
        status: "completed",
        preferredSource: "youtube-captions",
        progressPercent: 100,
        transcriptPath: "videos/video-1/transcript/transcript.json",
      },
    ],
    transcriptsByVideoId: {
      "video-1": [
        {
          id: "segment-1",
          startSeconds: 0,
          endSeconds: 5,
          text: "Welcome to the design review.",
          sourceKind: "youtube-captions",
        },
      ],
    },
    transcriptVariantsByVideoId: {},
    summariesByVideoId: {
      "video-1": {
        id: "summary-1",
        videoId: "video-1",
        markdown: "# Summary\n\nDesign review notes.",
        provider: "openai",
        sourceSegmentCount: 1,
        createdAtIso: "2026-05-21T00:01:00.000Z",
      },
    },
    summaryHistoryByVideoId: {
      "video-1": [
        {
          id: "summary-1",
          videoId: "video-1",
          markdown: "# Summary\n\nDesign review notes.",
          provider: "openai",
          sourceSegmentCount: 1,
          createdAtIso: "2026-05-21T00:01:00.000Z",
        },
      ],
    },
    chatMessagesByVideoId: {
      "video-1": [
        {
          id: "chat-user-1",
          videoId: "video-1",
          role: "user",
          content: "What changed?",
          contextMode: "summary",
          sessionId: "default",
          createdAtIso: "2026-05-21T00:02:00.000Z",
        },
        {
          id: "chat-assistant-1",
          videoId: "video-1",
          role: "assistant",
          content: "The design review focused on the media library.",
          contextMode: "summary",
          sessionId: "default",
          createdAtIso: "2026-05-21T00:02:01.000Z",
        },
      ],
    },
    playlists: [
      {
        id: "playlist-1",
        title: "Launch queue",
        videoIds: ["video-1"],
        coverImagePath: "playlists/playlist-1/cover.png",
        createdAtIso: "2026-05-21T00:03:00.000Z",
        updatedAtIso: "2026-05-21T00:03:00.000Z",
      },
    ],
  };
}
