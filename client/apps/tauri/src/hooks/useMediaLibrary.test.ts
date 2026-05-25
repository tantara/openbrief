import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IngestResult } from "@/domain/ingest";
import type {
  ChatMessage,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type { TranscriptPipelineResult } from "@/domain/transcript";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import type { IngestService } from "@/services/ingestService";
import type { SummaryChatService } from "@/services/summaryChatService";
import type { TranscriptService } from "@/services/transcriptService";
import {
  createEmptyMediaLibrarySnapshot,
  type MediaLibraryRepository,
  type MediaLibrarySnapshot,
} from "@/services/mediaLibraryRepository";

describe("useMediaLibrary", () => {
  it("adds imported local videos and ingest jobs to finder state", async () => {
    const { result } = renderHook(() => useMediaLibrary());

    await act(async () => {
      await result.current.importLocalFile({
        sourcePath: "/tmp/local clip.mp4",
        fileSizeBytes: 123,
      });
    });

    await waitFor(() => {
      expect(result.current.state.videos).toHaveLength(1);
    });
    expect(result.current.state.videos[0]).toMatchObject({
      title: "local clip",
      sourceKind: "local-file",
      importStatus: "ready",
    });
    expect(result.current.state.ingestJobs[0]).toMatchObject({
      sourceKind: "local-file",
      status: "completed",
    });
  });

  it("creates, renames, appends, and reorders playlists in library state", () => {
    const videos: VideoAsset[] = [
      {
        id: "video-1",
        title: "First",
        sourceKind: "youtube",
        originalUri: "https://youtu.be/first",
        libraryPath: "videos/video-1/source.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
      {
        id: "video-2",
        title: "Second",
        sourceKind: "youtube",
        originalUri: "https://youtu.be/second",
        libraryPath: "videos/video-2/source.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    ];
    const { result } = renderHook(() => useMediaLibrary(videos));

    let playlistId = "";
    act(() => {
      playlistId = result.current.createPlaylist("Research queue").id;
      result.current.addPlaylistVideo(playlistId, "video-1");
      result.current.addPlaylistVideo(playlistId, "video-2");
      result.current.reorderPlaylistVideo(playlistId, 1, 0);
      result.current.renamePlaylist(playlistId, "Updated queue");
      result.current.setPlaylistCover(playlistId, "playlists/playlist-1/cover.png");
    });

    expect(result.current.state.playlists[0]).toMatchObject({
      id: playlistId,
      title: "Updated queue",
      videoIds: ["video-2", "video-1"],
      coverImagePath: "playlists/playlist-1/cover.png",
    });
  });

  it("keeps rejected YouTube playlist imports in ingest state", async () => {
    const { result } = renderHook(() => useMediaLibrary());

    await act(async () => {
      await result.current.importYoutubeUrl({
        url: "https://www.youtube.com/playlist?list=abc",
      });
    });

    expect(result.current.state.videos).toHaveLength(0);
    expect(result.current.state.ingestJobs[0]).toMatchObject({
      sourceKind: "youtube",
      status: "failed",
      errorMessage: "Playlist, channel, profile, and collection imports are not supported in v1",
    });

    act(() => {
      result.current.removeFailedIngestJob(result.current.state.ingestJobs[0].id);
    });

    expect(result.current.state.ingestJobs).toHaveLength(0);
  });

  it("renames and deletes videos from the library snapshot", () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Original title",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const { result } = renderHook(() => useMediaLibrary([video]));

    act(() => {
      result.current.renameVideoTitle("video-1", "Updated title");
    });

    expect(result.current.state.videos[0].title).toBe("Updated title");

    act(() => {
      result.current.deleteVideo("video-1");
    });

    expect(result.current.state.videos).toHaveLength(0);
    expect(result.current.state.selectedVideoId).toBeUndefined();
  });

  it("queues remote imports, streams progress, and cancels queued jobs", async () => {
    const firstDownload = deferred<IngestResult>();
    let firstOptions:
      | Parameters<IngestService["importYoutubeUrl"]>[1]
      | undefined;
    const ingestService: IngestService = {
      importLocalFile: vi.fn(),
      importYoutubeUrl: vi.fn((request, options) => {
        firstOptions = options;
        return request.url.includes("youtu.be")
          ? firstDownload.promise
          : Promise.reject(new Error("second download should stay queued"));
      }),
      cancelIngestJob: vi.fn(),
    };
    const { result } = renderHook(() => useMediaLibrary([], ingestService));

    await act(async () => {
      await result.current.importYoutubeUrl({ url: "https://youtu.be/example" });
      await result.current.importYoutubeUrl({ url: "https://vimeo.com/123456789" });
    });

    await waitFor(() => {
      expect(ingestService.importYoutubeUrl).toHaveBeenCalledTimes(1);
    });
    const runningJob = result.current.state.ingestJobs.find(
      (job) => job.originalUri === "https://youtu.be/example",
    );
    const queuedJob = result.current.state.ingestJobs.find(
      (job) => job.originalUri === "https://vimeo.com/123456789",
    );

    expect(runningJob).toMatchObject({ status: "running" });
    expect(queuedJob).toMatchObject({ status: "queued" });

    act(() => {
      firstOptions?.onEvent?.({
        type: "job_progress",
        jobId: runningJob!.id,
        command: "download_youtube",
        progressPercent: 37,
      });
    });

    expect(
      result.current.state.ingestJobs.find((job) => job.id === runningJob!.id),
    ).toMatchObject({ progressPercent: 37 });

    await act(async () => {
      await result.current.cancelIngestJob(queuedJob!.id);
    });

    expect(ingestService.cancelIngestJob).not.toHaveBeenCalled();
    expect(
      result.current.state.ingestJobs.find((job) => job.id === queuedJob!.id),
    ).toMatchObject({ status: "cancelled" });

    await act(async () => {
      firstDownload.resolve({
        ok: true,
        job: {
          id: runningJob!.id,
          sourceKind: "youtube",
          status: "completed",
          progressPercent: 100,
          videoId: "youtube-video",
        },
        video: {
          id: "youtube-video",
          title: "Queued Video",
          sourceKind: "youtube",
          originalUri: "https://youtu.be/example",
          libraryPath: "videos/youtube-video/video.mp4",
          thumbnailPath: "videos/youtube-video/thumbnail/youtube-video-thumbnail.jpg",
          importStatus: "ready",
          createdAtIso: "2026-05-21T00:00:00.000Z",
        },
        events: [],
      });
      await firstDownload.promise;
    });

    await waitFor(() => {
      expect(result.current.state.videos[0]).toMatchObject({
        title: "Queued Video",
        thumbnailPath: "videos/youtube-video/thumbnail/youtube-video-thumbnail.jpg",
      });
    });
    expect(ingestService.importYoutubeUrl).toHaveBeenCalledTimes(1);
  });

  it("adds extracted transcripts and transcript jobs to library state", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const { result } = renderHook(() => useMediaLibrary([video]));

    await act(async () => {
      await result.current.extractTranscript("video-1");
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      videoId: "video-1",
      status: "completed",
      preferredSource: "youtube-captions",
    });
    expect(result.current.selectedTranscript[0]).toMatchObject({
      sourceKind: "youtube-captions",
      startSeconds: 0,
    });
  });

  it("updates transcript segment text and persists the library snapshot", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const savedSnapshots: MediaLibrarySnapshot[] = [];
    const repository: MediaLibraryRepository = {
      async loadSnapshot() {
        return { ...createEmptyMediaLibrarySnapshot(), videos: [video] };
      },
      async saveSnapshot(snapshot) {
        savedSnapshots.push(snapshot);
      },
      async listVideos() {
        return [];
      },
      async getVideo() {
        return undefined;
      },
      async listIngestJobs() {
        return [];
      },
      async listTranscriptJobs() {
        return [];
      },
      async listTranscript() {
        return [];
      },
      async getSummary() {
        return undefined;
      },
      async listChatMessages() {
        return [];
      },
      async listPlaylists() {
        return [];
      },
    };
    const { result } = renderHook(() =>
      useMediaLibrary(
        [video],
        undefined,
        undefined,
        undefined,
        repository,
      ),
    );

    await waitFor(() => {
      expect(result.current.state.videos).toHaveLength(1);
    });
    await act(async () => {
      await result.current.extractTranscript("video-1");
    });
    const segmentId = result.current.selectedTranscript[0].id;

    act(() => {
      result.current.updateTranscriptSegment(
        "video-1",
        segmentId,
        "Corrected transcript text",
      );
    });

    expect(result.current.selectedTranscript[0].text).toBe(
      "Corrected transcript text",
    );
    const lastSnapshot = savedSnapshots[savedSnapshots.length - 1];
    expect(
      lastSnapshot?.transcriptsByVideoId["video-1"]?.[0].text,
    ).toBe("Corrected transcript text");
  });

  it("lists caption languages and forwards the selected language to extraction", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const transcriptService: TranscriptService = {
      listCaptionLanguages: vi.fn().mockResolvedValue([
        { code: "ko", label: "Korean", kind: "manual" },
      ]),
      extractTranscript: vi.fn().mockResolvedValue({
        ok: true,
        job: {
          id: "transcript-video-1-pipeline",
          videoId: "video-1",
          status: "completed",
          preferredSource: "youtube-captions",
          progressPercent: 100,
        },
        segments: [],
        events: [],
      }),
    };
    const { result } = renderHook(() =>
      useMediaLibrary([video], undefined, transcriptService),
    );

    await expect(result.current.listCaptionLanguages("video-1")).resolves.toEqual([
      { code: "ko", label: "Korean", kind: "manual" },
    ]);
    await act(async () => {
      await result.current.extractTranscript("video-1", { languages: ["ko"] });
    });

    expect(transcriptService.extractTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ["ko"] }),
      expect.any(Object),
    );
  });

  it("keeps provider and Whisper transcripts as selectable source variants", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const transcriptService: TranscriptService = {
      listCaptionLanguages: vi.fn().mockResolvedValue([]),
      extractTranscript: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          job: {
            id: "transcript-video-1-pipeline",
            videoId: "video-1",
            status: "completed",
            preferredSource: "local-stt",
            progressPercent: 100,
          },
          segments: [
            {
              id: "local-stt-1",
              startSeconds: 0,
              text: "Whisper transcript.",
              sourceKind: "local-stt",
            },
          ],
          events: [],
        } satisfies TranscriptPipelineResult)
        .mockResolvedValueOnce({
          ok: true,
          job: {
            id: "transcript-video-1-pipeline",
            videoId: "video-1",
            status: "completed",
            preferredSource: "youtube-captions",
            progressPercent: 100,
          },
          segments: [
            {
              id: "youtube-captions-1",
              startSeconds: 0,
              text: "Provider caption transcript.",
              sourceKind: "youtube-captions",
            },
          ],
          events: [],
        } satisfies TranscriptPipelineResult),
    };
    const { result } = renderHook(() =>
      useMediaLibrary([video], undefined, transcriptService),
    );

    await act(async () => {
      await result.current.extractTranscript("video-1", {
        sourcePreference: "local-stt",
      });
      await result.current.extractTranscript("video-1", {
        sourcePreference: "youtube-captions",
        languages: ["ko"],
      });
    });

    expect(result.current.selectedTranscript[0]).toMatchObject({
      text: "Provider caption transcript.",
      sourceKind: "youtube-captions",
    });
    expect(result.current.selectedTranscriptVariants).toHaveLength(1);
    expect(result.current.selectedTranscriptVariants[0]).toMatchObject({
      kind: "source",
      sourceKind: "local-stt",
      languageLabel: "AI transcription",
      segments: [
        expect.objectContaining({
          text: "Whisper transcript.",
          sourceKind: "local-stt",
        }),
      ],
    });
  });

  it("streams transcript extraction progress into library state", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const transcriptResult = deferred<TranscriptPipelineResult>();
    let transcriptOptions:
      | Parameters<TranscriptService["extractTranscript"]>[1]
      | undefined;
    const transcriptService: TranscriptService = {
      listCaptionLanguages: vi.fn().mockResolvedValue([]),
      extractTranscript: vi.fn((_request, options) => {
        transcriptOptions = options;
        return transcriptResult.promise;
      }),
    };
    const { result } = renderHook(() =>
      useMediaLibrary([video], undefined, transcriptService),
    );

    let extractionPromise!: Promise<TranscriptPipelineResult>;
    await act(async () => {
      extractionPromise = result.current.extractTranscript("video-1");
      await Promise.resolve();
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      videoId: "video-1",
      status: "running",
      progressPercent: 1,
    });

    act(() => {
      transcriptOptions?.onEvent?.({
        type: "helper_event",
        jobId: "transcript-video-1-stt",
        event: {
          type: "job_progress",
          jobId: "transcript-video-1-stt",
          command: "transcribe_audio",
          progressPercent: 50,
          message: "stt-progress",
        },
      });
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      status: "running",
      preferredSource: "local-stt",
      progressPercent: 80,
    });

    await act(async () => {
      transcriptResult.resolve({
        ok: true,
        job: {
          id: "transcript-video-1-pipeline",
          videoId: "video-1",
          status: "completed",
          preferredSource: "local-stt",
          progressPercent: 100,
          transcriptPath: "videos/video-1/transcript/transcript.json",
        },
        segments: [
          {
            id: "local-stt-1",
            startSeconds: 0,
            text: "Completed transcript.",
            sourceKind: "local-stt",
          },
        ],
        events: [],
      });
      await extractionPromise;
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      status: "completed",
      progressPercent: 100,
    });
    expect(result.current.selectedTranscript[0]).toMatchObject({
      text: "Completed transcript.",
    });
  });

  it("starts audio asset transcription as local STT in the shared workflow", async () => {
    const audio: VideoAsset = {
      id: "audio-1",
      title: "Audio interview",
      sourceType: "audio",
      sourceKind: "local-file",
      originalUri: "file:///Users/test/Music/interview.mp3",
      libraryPath: "audio/local-interview/interview.mp3",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const transcriptResult = deferred<TranscriptPipelineResult>();
    const transcriptService: TranscriptService = {
      listCaptionLanguages: vi.fn().mockResolvedValue([]),
      extractTranscript: vi.fn(() => transcriptResult.promise),
    };
    const { result } = renderHook(() =>
      useMediaLibrary([audio], undefined, transcriptService),
    );

    let extractionPromise!: Promise<TranscriptPipelineResult>;
    await act(async () => {
      extractionPromise = result.current.extractTranscript("audio-1");
      await Promise.resolve();
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      videoId: "audio-1",
      status: "running",
      preferredSource: "local-stt",
      progressPercent: 1,
    });
    expect(transcriptService.extractTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ video: audio }),
      expect.any(Object),
    );

    await act(async () => {
      transcriptResult.resolve({
        ok: true,
        job: {
          id: "transcript-audio-1-pipeline",
          videoId: "audio-1",
          status: "completed",
          preferredSource: "local-stt",
          progressPercent: 100,
          transcriptPath: "videos/audio-1/transcript/transcript.json",
        },
        segments: [
          {
            id: "local-stt-1",
            startSeconds: 0,
            text: "Completed audio transcript.",
            sourceKind: "local-stt",
          },
        ],
        events: [],
      });
      await extractionPromise;
    });

    expect(result.current.state.transcriptsByVideoId["audio-1"][0]).toMatchObject({
      text: "Completed audio transcript.",
    });
  });

  it("keeps the transcript job running when captions fail and local STT fallback starts", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const transcriptResult = deferred<TranscriptPipelineResult>();
    let transcriptOptions:
      | Parameters<TranscriptService["extractTranscript"]>[1]
      | undefined;
    const transcriptService: TranscriptService = {
      listCaptionLanguages: vi.fn().mockResolvedValue([]),
      extractTranscript: vi.fn((_request, options) => {
        transcriptOptions = options;
        return transcriptResult.promise;
      }),
    };
    const { result } = renderHook(() =>
      useMediaLibrary([video], undefined, transcriptService),
    );

    let extractionPromise!: Promise<TranscriptPipelineResult>;
    await act(async () => {
      extractionPromise = result.current.extractTranscript("video-1");
      await Promise.resolve();
    });

    act(() => {
      transcriptOptions?.onEvent?.({
        type: "helper_event",
        jobId: "transcript-video-1-captions",
        event: {
          type: "job_failed",
          jobId: "transcript-video-1-captions",
          command: "extract_captions",
          errorCode: "helper_unavailable",
          message:
            "yt-dlp exited with status exit status: 1: ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests",
        },
      });
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      status: "running",
      preferredSource: "local-stt",
      progressPercent: 35,
    });
    expect(result.current.state.transcriptJobs[0].errorMessage).toBeUndefined();

    act(() => {
      transcriptOptions?.onEvent?.({
        type: "helper_event",
        jobId: "transcript-video-1-audio",
        event: {
          type: "job_started",
          jobId: "transcript-video-1-audio",
          command: "extract_audio",
        },
      });
    });

    expect(result.current.state.transcriptJobs[0]).toMatchObject({
      status: "running",
      preferredSource: "local-stt",
      progressPercent: 40,
    });

    await act(async () => {
      transcriptResult.resolve({
        ok: true,
        job: {
          id: "transcript-video-1-pipeline",
          videoId: "video-1",
          status: "completed",
          preferredSource: "local-stt",
          progressPercent: 100,
          transcriptPath: "videos/video-1/transcript/transcript.json",
        },
        segments: [
          {
            id: "local-stt-1",
            startSeconds: 0,
            text: "Completed transcript.",
            sourceKind: "local-stt",
          },
        ],
        events: [],
      });
      await extractionPromise;
    });
  });

  it("generates summaries, chats, and markdown save payloads from selected media state", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const { result } = renderHook(() => useMediaLibrary([video]));

    await act(async () => {
      await result.current.extractTranscript("video-1");
      await result.current.generateSummary("video-1", "openai");
      await result.current.sendChat({
        videoId: "video-1",
        question: "What is this about?",
        contextMode: "summary",
        provider: "openai",
      });
    });

    expect(result.current.selectedSummary?.markdown).toContain("# Summary");
    expect(result.current.selectedChatMessages).toHaveLength(2);
    expect(result.current.createMarkdownSave("video-1")).toMatchObject({
      suggestedFileName: "design-review.md",
    });
  });

  it("keeps multiple generated summaries for the same video", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const firstSummary: SummaryDocument = {
      id: "summary-1",
      videoId: "video-1",
      markdown: "# First",
      provider: "openai",
      sourceSegmentCount: 0,
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const secondSummary: SummaryDocument = {
      ...firstSummary,
      id: "summary-2",
      markdown: "# Second",
      provider: "anthropic",
      createdAtIso: "2026-05-21T00:01:00.000Z",
    };
    const translatedTranscript: TranscriptSegment[] = [
      {
        id: "s1",
        startSeconds: 0,
        text: "번역된 대본",
        sourceKind: "youtube-captions",
      },
    ];
    const summaryChatService: SummaryChatService = {
      generateSummary: vi
        .fn()
        .mockResolvedValueOnce(firstSummary)
        .mockResolvedValueOnce(secondSummary),
      generatePodcastScript: vi.fn(),
      generateQuiz: vi.fn(),
      sendChat: vi.fn().mockResolvedValue([]),
      reviewTranscript: vi.fn().mockResolvedValue([]),
      translateTranscript: vi.fn(),
      createMarkdownSave: vi.fn(({ summary }) => ({
        suggestedFileName: `${summary.id}.md`,
        markdown: summary.markdown,
      })),
    };
    const { result } = renderHook(() =>
      useMediaLibrary(
        [video],
        undefined,
        undefined,
        summaryChatService,
      ),
    );

    await act(async () => {
      await result.current.generateSummary("video-1", "openai", undefined, {
        streamingMode: true,
        outputLanguage: "Korean",
        transcript: translatedTranscript,
      });
      await result.current.generateSummary("video-1", "anthropic");
    });

    expect(summaryChatService.generateSummary).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        streamingMode: true,
        outputLanguage: "Korean",
        transcript: translatedTranscript,
      }),
    );
    expect(result.current.selectedSummary?.markdown).toBe("# Second");
    expect(result.current.selectedSummaryHistory.map((summary) => summary.id)).toEqual([
      "summary-2",
      "summary-1",
    ]);

    act(() => {
      result.current.updateSummaryMarkdown("video-1", "summary-1", "## Edited first");
    });

    expect(
      result.current.createMarkdownSave("video-1", undefined, "summary-1"),
    ).toMatchObject({
      markdown: "## Edited first",
    });
  });

  it("keeps summary and chat jobs active when the user changes views", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const summaryResult = deferred<SummaryDocument>();
    const chatResult = deferred<ChatMessage[]>();
    const summaryChatService: SummaryChatService = {
      generateSummary: vi.fn(() => summaryResult.promise),
      generatePodcastScript: vi.fn(),
      generateQuiz: vi.fn(),
      sendChat: vi.fn(() => chatResult.promise),
      reviewTranscript: vi.fn().mockResolvedValue([]),
      translateTranscript: vi.fn(),
      createMarkdownSave: vi.fn(() => ({
        suggestedFileName: "design-review.md",
        markdown: "# Summary",
      })),
    };
    const { result } = renderHook(() =>
      useMediaLibrary(
        [video],
        undefined,
        undefined,
        summaryChatService,
      ),
    );

    let summaryPromise!: Promise<SummaryDocument>;
    await act(async () => {
      summaryPromise = result.current.generateSummary(
        "video-1",
        "openai",
        "gpt-5.4-mini",
      );
      result.current.setActiveView("settings");
      await Promise.resolve();
    });

    expect(result.current.state.activeView).toBe("settings");
    expect(result.current.state.summaryJobsByVideoId["video-1"]).toMatchObject({
      status: "running",
      provider: "openai",
      model: "gpt-5.4-mini",
    });

    await act(async () => {
      summaryResult.resolve({
        id: "summary-video-1",
        videoId: "video-1",
        markdown: "# Summary",
        provider: "openai",
        sourceSegmentCount: 0,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      });
      await summaryPromise;
    });

    expect(result.current.state.summaryJobsByVideoId["video-1"]).toBeUndefined();
    expect(result.current.state.summariesByVideoId["video-1"]?.markdown).toBe(
      "# Summary",
    );

    let chatPromise!: Promise<ChatMessage[]>;
    await act(async () => {
      chatPromise = result.current.sendChat({
        videoId: "video-1",
        question: "What mattered?",
        contextMode: "summary",
        provider: "openai",
        model: "gpt-5.4-mini",
      });
      result.current.setActiveView("finder");
      await Promise.resolve();
    });

    expect(result.current.state.activeView).toBe("finder");
    expect(result.current.state.chatJobsByVideoId["video-1"]).toMatchObject({
      status: "running",
      provider: "openai",
      model: "gpt-5.4-mini",
    });

    await act(async () => {
      chatResult.resolve([
        {
          id: "chat-user-1",
          videoId: "video-1",
          role: "user",
          content: "What mattered?",
          contextMode: "summary",
          createdAtIso: "2026-05-21T00:00:00.000Z",
        },
        {
          id: "chat-assistant-1",
          videoId: "video-1",
          role: "assistant",
          content: "The important part.",
          contextMode: "summary",
          createdAtIso: "2026-05-21T00:00:00.000Z",
        },
      ]);
      await chatPromise;
    });

    expect(result.current.state.chatJobsByVideoId["video-1"]).toBeUndefined();
    expect(result.current.state.chatMessagesByVideoId["video-1"]).toHaveLength(2);
  });

  it("stores streaming chat drafts while the response is running", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const chatResult = deferred<ChatMessage[]>();
    const summaryChatService: SummaryChatService = {
      generateSummary: vi.fn(),
      generatePodcastScript: vi.fn(),
      generateQuiz: vi.fn(),
      sendChat: vi.fn((request) => {
        request.onTextSnapshot?.("Draft chat answer");
        return chatResult.promise;
      }),
      reviewTranscript: vi.fn().mockResolvedValue([]),
      translateTranscript: vi.fn(),
      createMarkdownSave: vi.fn(() => ({
        suggestedFileName: "design-review.md",
        markdown: "# Summary",
      })),
    };
    const { result } = renderHook(() =>
      useMediaLibrary(
        [video],
        undefined,
        undefined,
        summaryChatService,
      ),
    );

    let chatPromise!: Promise<ChatMessage[]>;
    await act(async () => {
      chatPromise = result.current.sendChat({
        videoId: "video-1",
        question: "What mattered?",
        contextMode: "summary",
        provider: "openai",
        streamingMode: true,
      });
      await Promise.resolve();
    });

    expect(summaryChatService.sendChat).toHaveBeenCalledWith(
      expect.objectContaining({ streamingMode: true }),
    );
    expect(result.current.state.chatJobsByVideoId["video-1"]).toMatchObject({
      status: "running",
      streamingMode: true,
      draftText: "Draft chat answer",
    });

    await act(async () => {
      chatResult.resolve([]);
      await chatPromise;
    });
  });

  it("coalesces rapid streaming summary drafts", async () => {
    vi.useFakeTimers();
    try {
      const video: VideoAsset = {
        id: "video-1",
        title: "Design Review",
        sourceKind: "youtube",
        originalUri: "https://youtu.be/example",
        libraryPath: "videos/video-1/video.mp4",
        importStatus: "ready",
        createdAtIso: "2026-05-21T00:00:00.000Z",
      };
      const summaryResult = deferred<SummaryDocument>();
      const summaryChatService: SummaryChatService = {
        generateSummary: vi.fn((request) => {
          request.onTextSnapshot?.("Draft 1");
          request.onTextSnapshot?.("Draft 2");
          request.onTextSnapshot?.("Draft 3");
          return summaryResult.promise;
        }),
        generatePodcastScript: vi.fn(),
        generateQuiz: vi.fn(),
        sendChat: vi.fn().mockResolvedValue([]),
        reviewTranscript: vi.fn().mockResolvedValue([]),
        translateTranscript: vi.fn(),
        createMarkdownSave: vi.fn(() => ({
          suggestedFileName: "design-review.md",
          markdown: "# Summary",
        })),
      };
      const { result } = renderHook(() =>
        useMediaLibrary(
          [video],
          undefined,
          undefined,
          summaryChatService,
        ),
      );

      let summaryPromise!: Promise<SummaryDocument>;
      await act(async () => {
        summaryPromise = result.current.generateSummary("video-1", "openai", undefined, {
          streamingMode: true,
        });
        await Promise.resolve();
      });

      expect(result.current.state.summaryJobsByVideoId["video-1"]).toMatchObject({
        draftText: "Draft 1",
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(result.current.state.summaryJobsByVideoId["video-1"]).toMatchObject({
        draftText: "Draft 3",
      });

      await act(async () => {
        summaryResult.resolve({
          id: "summary-video-1",
          videoId: "video-1",
          markdown: "# Summary",
          provider: "openai",
          sourceSegmentCount: 0,
          createdAtIso: "2026-05-21T00:00:00.000Z",
        });
        await summaryPromise;
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a new visible chat session while preserving previous messages", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const { result } = renderHook(() => useMediaLibrary([video]));

    await act(async () => {
      await result.current.sendChat({
        videoId: "video-1",
        question: "First question?",
        contextMode: "summary",
        provider: "openai",
      });
    });

    expect(result.current.selectedChatMessages).toHaveLength(2);

    act(() => {
      result.current.resetChatSession("video-1");
    });

    expect(result.current.selectedChatMessages).toHaveLength(0);
    expect(result.current.state.chatMessagesByVideoId["video-1"]).toHaveLength(2);
  });

  it("persists generated voice artifacts on the owning chat message", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const assistantMessage: ChatMessage = {
      id: "chat-assistant-video-1-message-1",
      videoId: "video-1",
      role: "assistant",
      content: "The important part.",
      contextMode: "summary",
      sessionId: "default",
      createdAtIso: "2026-05-21T00:01:00.000Z",
    };
    const savedSnapshots: MediaLibrarySnapshot[] = [];
    const repository: MediaLibraryRepository = {
      async loadSnapshot() {
        return {
          ...createEmptyMediaLibrarySnapshot(),
          videos: [video],
          chatMessagesByVideoId: {
            "video-1": [assistantMessage],
          },
        };
      },
      async saveSnapshot(snapshot) {
        savedSnapshots.push(snapshot);
      },
      async listVideos() {
        return [video];
      },
      async getVideo() {
        return video;
      },
      async listIngestJobs() {
        return [];
      },
      async listTranscriptJobs() {
        return [];
      },
      async listTranscript() {
        return [];
      },
      async getSummary() {
        return undefined;
      },
      async listChatMessages() {
        return [assistantMessage];
      },
      async listPlaylists() {
        return [];
      },
    };

    const { result } = renderHook(() =>
      useMediaLibrary([], undefined, undefined, undefined, repository),
    );

    await waitFor(() => {
      expect(result.current.selectedChatMessages).toHaveLength(1);
    });

    act(() => {
      result.current.updateChatMessageVoiceMessage(
        "video-1",
        assistantMessage.id,
        {
          audioPath:
            "videos/video-1/chat/tts/chat-assistant-video-1-message-1/voice-message-1/voice-message-1.wav",
          generationId: "voice-message-1",
          sizeBytes: 123,
          createdAtIso: "2026-05-21T00:02:00.000Z",
        },
      );
    });

    expect(result.current.selectedChatMessages[0]?.voiceMessage).toMatchObject({
      generationId: "voice-message-1",
      sizeBytes: 123,
    });
    expect(
      savedSnapshots.at(-1)?.chatMessagesByVideoId["video-1"]?.[0]
        ?.voiceMessage,
    ).toMatchObject({
      audioPath:
        "videos/video-1/chat/tts/chat-assistant-video-1-message-1/voice-message-1/voice-message-1.wav",
    });
  });

  it("persists generated summaries and chat messages through the repository", async () => {
    const video: VideoAsset = {
      id: "video-1",
      title: "Design Review",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/example",
      libraryPath: "videos/video-1/video.mp4",
      importStatus: "ready",
      createdAtIso: "2026-05-21T00:00:00.000Z",
    };
    const savedSnapshots: MediaLibrarySnapshot[] = [];
    const repository: MediaLibraryRepository = {
      async loadSnapshot() {
        return { ...createEmptyMediaLibrarySnapshot(), videos: [video] };
      },
      async saveSnapshot(snapshot) {
        savedSnapshots.push(snapshot);
      },
      async listVideos() {
        return [];
      },
      async getVideo() {
        return undefined;
      },
      async listIngestJobs() {
        return [];
      },
      async listTranscriptJobs() {
        return [];
      },
      async listTranscript() {
        return [];
      },
      async getSummary() {
        return undefined;
      },
      async listChatMessages() {
        return [];
      },
      async listPlaylists() {
        return [];
      },
    };
    const { result } = renderHook(() =>
      useMediaLibrary(
        [video],
        undefined,
        undefined,
        undefined,
        repository,
      ),
    );

    await waitFor(() => {
      expect(result.current.state.videos).toHaveLength(1);
    });
    await act(async () => {
      await result.current.extractTranscript("video-1");
      await result.current.generateSummary("video-1", "openai");
      await result.current.sendChat({
        videoId: "video-1",
        question: "What is this about?",
        contextMode: "summary",
        provider: "openai",
      });
    });

    const lastSnapshot = savedSnapshots[savedSnapshots.length - 1];

    expect(lastSnapshot?.summariesByVideoId["video-1"]?.artifactPath).toContain(
      "videos/video-1/summary/summary-video-1-",
    );
    expect(lastSnapshot?.summaryHistoryByVideoId["video-1"]).toHaveLength(1);
    expect(lastSnapshot?.chatMessagesByVideoId["video-1"]?.[0]).toMatchObject({
      sessionId: "default",
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
