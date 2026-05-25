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
  const snapshot: MediaLibrarySnapshot = {
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
    podcastsByVideoId: {
      "video-1": {
        schemaVersion: 1,
        id: "podcast-1",
        sourceAssetId: "video-1",
        mode: "podcast-summary",
        sourceKind: "current-summary",
        lengthMode: "default",
        provider: "openai",
        createdAtIso: "2026-05-21T00:04:00.000Z",
        script: {
          title: "Design Review podcast",
          turns: [
            {
              id: "turn-0001",
              speakerId: "A",
              speakerLabel: "Mark",
              text: "Welcome.",
            },
            {
              id: "turn-0002",
              speakerId: "B",
              speakerLabel: "Sophia",
              text: "Here are the notes.",
            },
            {
              id: "turn-0003",
              speakerId: "A",
              speakerLabel: "Mark",
              text: "The library changed.",
            },
            {
              id: "turn-0004",
              speakerId: "B",
              speakerLabel: "Sophia",
              text: "That is the recap.",
            },
          ],
          markdown: "# Design Review podcast\n",
        },
        tts: {
          modelId: "Supertone/supertonic-3",
          languageCode: "en",
          speakers: [
            { id: "A", label: "Mark", voiceStyleId: "M1" },
            { id: "B", label: "Sophia", voiceStyleId: "F2" },
          ],
        },
        artifacts: {
          rootDirectory: "videos/video-1/podcast/podcast-1",
          manifestPath: "videos/video-1/podcast/podcast-1/podcast.json",
          scriptPath: "videos/video-1/podcast/podcast-1/script.md",
          turnAudioDirectory: "videos/video-1/podcast/podcast-1/audio/turns",
          podcastAudioPath: "videos/video-1/podcast/podcast-1/audio/podcast.wav",
          turnAudioPaths: [
            "videos/video-1/podcast/podcast-1/audio/turns/0001-speaker-a.wav",
          ],
        },
      },
    },
    podcastHistoryByVideoId: {
      "video-1": [],
    },
    podcastJobsByVideoId: {},
    quizzesByVideoId: {
      "video-1": {
        schemaVersion: 1,
        id: "quiz-1",
        sourceAssetId: "video-1",
        mode: "multiple-choice",
        questionCount: 1,
        areaOfInterest: "design review",
        provider: "openai",
        createdAtIso: "2026-05-21T00:05:00.000Z",
        title: "Design Review quiz",
        items: [
          {
            id: "question-0001",
            type: "multiple-choice",
            question: "What changed?",
            options: ["Media library", "Theme settings"],
            correctOptionIndex: 0,
          },
        ],
        artifactPath: "videos/video-1/quiz/quiz-1/quiz.json",
      },
    },
    quizHistoryByVideoId: {
      "video-1": [],
    },
    quizJobsByVideoId: {},
    videoGenerationsBySourceId: {
      "video-1": {
        id: "composition-1",
        sourceId: "video-1",
        sourceType: "video",
        scenario: "summary-to-video",
        adapter: "deno-hyperframes",
        title: "Design Review",
        prompt: "Make a concise briefing.",
        html: "<html></html>",
        entryPath: "videos/video-1/generated-video/composition-1/index.html",
        manifestPath:
          "videos/video-1/generated-video/composition-1/composition.json",
        renderPath: "videos/video-1/generated-video/composition-1/render.mp4",
        durationSeconds: 45,
        aspectRatio: "16:9",
        createdAtIso: "2026-05-21T00:06:00.000Z",
        updatedAtIso: "2026-05-21T00:06:00.000Z",
      },
    },
    videoGenerationHistoryBySourceId: {
      "video-1": [],
    },
    videoGenerationRendersByCompositionId: {
      "composition-1": [
        {
          id: "render-1",
          compositionId: "composition-1",
          sourceId: "video-1",
          adapter: "deno-hyperframes",
          outputPath: "videos/video-1/generated-video/composition-1/render.mp4",
          createdAtIso: "2026-05-21T00:07:00.000Z",
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

  snapshot.podcastHistoryByVideoId["video-1"] = [
    snapshot.podcastsByVideoId["video-1"],
  ];
  snapshot.quizHistoryByVideoId["video-1"] = [
    snapshot.quizzesByVideoId["video-1"],
  ];
  snapshot.videoGenerationHistoryBySourceId["video-1"] = [
    snapshot.videoGenerationsBySourceId["video-1"],
  ];
  return snapshot;
}
