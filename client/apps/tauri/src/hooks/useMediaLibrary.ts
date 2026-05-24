import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  IngestJob,
  ProviderKind,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
  VideoPlaylist,
} from "@/domain/media-library";
import {
  createTranscriptSourceVariant,
  type TranscriptLanguageOption,
  type TranscriptVariant,
} from "@/domain/transcript-actions";
import type { CaptionLanguage } from "@/domain/helper-protocol";
import type {
  SummaryLengthMode,
  VideoSummaryTemplateId,
} from "@/domain/summary";
import {
  createPodcastDocument,
  createPodcastId,
  type PodcastDocument,
  type PodcastGenerationJob,
  type PodcastLengthMode,
  type PodcastOutputMode,
  type PodcastSourceKind,
  type PodcastSpeakerConfig,
} from "@/domain/podcast";
import {
  generatePodcastTts,
  type GeneratePodcastTtsRequest,
} from "@/services/podcastService";
import type { HelperCommandName } from "@/domain/helper-protocol";
import type {
  IngestResult,
  LocalFileImportRequest,
  YoutubeImportRequest,
} from "@/domain/ingest";
import { createYoutubeDownloadCommand } from "@/domain/ingest";
import {
  createTranscriptJobId,
  type TranscriptPipelineEvent,
  type TranscriptPipelineResult,
} from "@/domain/transcript";
import {
  createMockIngestService,
  createTauriIngestService,
  type IngestService,
} from "@/services/ingestService";
import {
  createHelperTranscriptService,
  type TranscriptService,
} from "@/services/transcriptService";
import {
  createSummaryChatService,
  type SummaryChatService,
} from "@/services/summaryChatService";
import { createDefaultProviderService } from "@/services/providerService";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import {
  canUseTauriRuntime,
  TauriHelperClient,
} from "@/services/tauriHelperClient";
import type { ChatContextMode } from "@/domain/chat";
import type { MarkdownSavePayload } from "@/domain/markdown-save";
import {
  addVideoToPlaylist,
  createVideoPlaylist,
  mediaSourceTypeForAsset,
  renameVideoPlaylist,
  reorderPlaylistVideos,
  setVideoPlaylistCover,
} from "@/domain/media-library";
import {
  createDefaultMediaLibraryRepository,
  createEmptyMediaLibrarySnapshot,
  type MediaLibraryRepository,
  type MediaLibrarySnapshot,
} from "@/services/mediaLibraryRepository";

export type LibraryView =
  | "finder"
  | "workbench"
  | "playlists"
  | "voices"
  | "settings"
  | "tutorial"
  | "faq"
  | "onboarding";

export type MediaLibraryState = {
  activeView: LibraryView;
  selectedVideoId?: string;
  videos: VideoAsset[];
  ingestJobs: IngestJob[];
  transcriptJobs: TranscriptJob[];
  summaryJobsByVideoId: Record<string, AiGenerationJob>;
  chatJobsByVideoId: Record<string, AiGenerationJob>;
  transcriptsByVideoId: Record<string, TranscriptSegment[]>;
  transcriptVariantsByVideoId: Record<string, TranscriptVariant[]>;
  summariesByVideoId: Record<string, SummaryDocument>;
  summaryHistoryByVideoId: Record<string, SummaryDocument[]>;
  chatMessagesByVideoId: Record<string, ChatMessage[]>;
  podcastsByVideoId: Record<string, PodcastDocument>;
  podcastHistoryByVideoId: Record<string, PodcastDocument[]>;
  podcastJobsByVideoId: Record<string, PodcastGenerationJob>;
  activeChatSessionIdsByVideoId: Record<string, string>;
  playlists: VideoPlaylist[];
};

export type PodcastTtsGenerator = (
  request: GeneratePodcastTtsRequest,
) => ReturnType<typeof generatePodcastTts>;

export type AiGenerationJob = {
  videoId: string;
  status: "running" | "failed";
  provider: ProviderKind;
  model?: string;
  streamingMode?: boolean;
  draftText?: string;
  errorMessage?: string;
};

export function useMediaLibrary(
  initialVideos: VideoAsset[] = [],
  ingestService: IngestService = createDefaultIngestService(),
  transcriptService: TranscriptService = createDefaultTranscriptService(),
  summaryChatService: SummaryChatService = createSummaryChatService(
    createDefaultProviderService(),
  ),
  repositoryOverride?: MediaLibraryRepository,
  podcastTtsGenerator: PodcastTtsGenerator = generatePodcastTts,
) {
  const [activeView, setActiveView] = useState<LibraryView>("finder");
  const [librarySnapshot, setLibrarySnapshot] = useState<MediaLibrarySnapshot>({
    ...createEmptyMediaLibrarySnapshot(),
    videos: initialVideos,
  });
  const [summaryJobsByVideoId, setSummaryJobsByVideoId] = useState<
    Record<string, AiGenerationJob>
  >({});
  const [chatJobsByVideoId, setChatJobsByVideoId] = useState<
    Record<string, AiGenerationJob>
  >({});
  const [podcastJobsByVideoId, setPodcastJobsByVideoId] = useState<
    Record<string, PodcastGenerationJob>
  >({});
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>(
    initialVideos[0]?.id,
  );
  const [activeChatSessionIdsByVideoId, setActiveChatSessionIdsByVideoId] =
    useState<Record<string, string>>({});
  const repositoryRef = useRef<MediaLibraryRepository | undefined>(
    repositoryOverride,
  );
  if (!repositoryRef.current) {
    repositoryRef.current = createDefaultMediaLibraryRepository(initialVideos);
  }
  const repository = repositoryRef.current;
  const librarySnapshotRef = useRef(librarySnapshot);
  const hasLocalMutationRef = useRef(false);
  const remoteImportQueueRef = useRef<YoutubeImportRequest[]>([]);
  const activeRemoteImportRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    repository
      .loadSnapshot()
      .then((snapshot) => {
        if (cancelled || hasLocalMutationRef.current) return;

        librarySnapshotRef.current = snapshot;
        setLibrarySnapshot(snapshot);
        setSelectedVideoId((current) => current ?? snapshot.videos[0]?.id);
      })
      .catch(() => {
        // Keep the in-memory startup snapshot if durable storage is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const selectedVideo = useMemo(
    () => librarySnapshot.videos.find((video) => video.id === selectedVideoId),
    [librarySnapshot.videos, selectedVideoId],
  );
  const selectedTranscript = selectedVideoId
    ? librarySnapshot.transcriptsByVideoId[selectedVideoId] ?? []
    : [];
  const selectedTranscriptVariants = selectedVideoId
    ? librarySnapshot.transcriptVariantsByVideoId[selectedVideoId] ?? []
    : [];
  const selectedSummary = selectedVideoId
    ? latestSummaryForVideo(librarySnapshot, selectedVideoId)
    : undefined;
  const selectedSummaryHistory = selectedVideoId
    ? summaryHistoryForVideo(librarySnapshot, selectedVideoId)
    : [];
  const selectedSummaryJob = selectedVideoId
    ? summaryJobsByVideoId[selectedVideoId]
    : undefined;
  const selectedChatJob = selectedVideoId
    ? chatJobsByVideoId[selectedVideoId]
    : undefined;
  const selectedPodcastJob = selectedVideoId
    ? podcastJobsByVideoId[selectedVideoId]
    : undefined;
  const selectedPodcast = selectedVideoId
    ? librarySnapshot.podcastsByVideoId[selectedVideoId]
    : undefined;
  const selectedPodcastHistory = selectedVideoId
    ? librarySnapshot.podcastHistoryByVideoId[selectedVideoId] ?? []
    : [];
  const selectedChatMessages = selectedVideoId
    ? (librarySnapshot.chatMessagesByVideoId[selectedVideoId] ?? []).filter(
        (message) =>
          (message.sessionId ?? "default") ===
          (activeChatSessionIdsByVideoId[selectedVideoId] ?? "default"),
      )
    : [];

  async function importLocalFile(request: LocalFileImportRequest) {
    const result = await ingestService.importLocalFile({
      ...request,
      nowIso: request.nowIso ?? new Date().toISOString(),
    });
    applyIngestResult(result);
    return result;
  }

  async function importYoutubeUrl(request: YoutubeImportRequest) {
    const queuedRequest = {
      ...request,
      nowIso: request.nowIso ?? new Date().toISOString(),
    };
    const commandOrFailure = createYoutubeDownloadCommand(queuedRequest);

    if ("ok" in commandOrFailure) {
      applyIngestResult(commandOrFailure);
      return commandOrFailure;
    }

    const queuedJob: IngestJob = {
      id: commandOrFailure.jobId,
      sourceKind: commandOrFailure.sourceKind,
      status: "queued",
      progressPercent: 0,
      originalUri: commandOrFailure.url,
      title: commandOrFailure.url,
    };

    updateLibrarySnapshot((current) => ({
      ...current,
      ingestJobs: upsertIngestJob(current.ingestJobs, queuedJob),
    }));
    remoteImportQueueRef.current = [...remoteImportQueueRef.current, queuedRequest];
    void processRemoteImportQueue();

    return queuedJob;
  }

  async function cancelIngestJob(jobId: string) {
    remoteImportQueueRef.current = remoteImportQueueRef.current.filter((request) => {
      const commandOrFailure = createYoutubeDownloadCommand(request);
      return "ok" in commandOrFailure || commandOrFailure.jobId !== jobId;
    });

    updateLibrarySnapshot((current) => ({
      ...current,
      ingestJobs: updateIngestJob(current.ingestJobs, jobId, {
        status: "cancelled",
        progressPercent: 0,
        errorMessage: undefined,
      }),
    }));

    if (activeRemoteImportRef.current === jobId) {
      await ingestService.cancelIngestJob(jobId);
    }
  }

  function removeFailedIngestJob(jobId: string) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        ingestJobs: current.ingestJobs.filter(
          (job) => job.id !== jobId || job.status !== "failed",
        ),
      }),
      true,
    );
  }

  async function processRemoteImportQueue() {
    if (activeRemoteImportRef.current) return;

    const nextRequest = remoteImportQueueRef.current.shift();
    if (!nextRequest) return;

    const commandOrFailure = createYoutubeDownloadCommand(nextRequest);
    if ("ok" in commandOrFailure) {
      applyIngestResult(commandOrFailure);
      void processRemoteImportQueue();
      return;
    }

    activeRemoteImportRef.current = commandOrFailure.jobId;
    updateLibrarySnapshot((current) => ({
      ...current,
      ingestJobs: updateIngestJob(current.ingestJobs, commandOrFailure.jobId, {
        status: "running",
        progressPercent: Math.max(
          current.ingestJobs.find((job) => job.id === commandOrFailure.jobId)
            ?.progressPercent ?? 0,
          1,
        ),
      }),
    }));

    try {
      const result = await ingestService.importYoutubeUrl(nextRequest, {
        onEvent(event) {
          if (event.type === "job_progress") {
            updateLibrarySnapshot((current) => ({
              ...current,
              ingestJobs: updateIngestJob(current.ingestJobs, commandOrFailure.jobId, {
                status: "running",
                progressPercent: event.progressPercent,
              }),
            }));
          }

          if (event.type === "job_cancelled") {
            updateLibrarySnapshot((current) => ({
              ...current,
              ingestJobs: updateIngestJob(current.ingestJobs, commandOrFailure.jobId, {
                status: "cancelled",
                errorMessage: undefined,
              }),
            }));
          }
        },
      });

      applyIngestResult(result);
    } finally {
      activeRemoteImportRef.current = undefined;
      void processRemoteImportQueue();
    }
  }

  async function listCaptionLanguages(videoId: string): Promise<CaptionLanguage[]> {
    const video = findVideo(videoId);
    return transcriptService.listCaptionLanguages({ video });
  }

  async function extractTranscript(
    videoId: string,
    optionsOrWhisperModelPath?: string | {
      whisperModelPath?: string;
      whisperLanguage?: string;
      languages?: string[];
      sourcePreference?: "youtube-captions" | "local-stt";
    },
  ) {
    const video = librarySnapshotRef.current.videos.find(
      (candidate) => candidate.id === videoId,
    );

    if (!video) {
      throw new Error(`Unknown video: ${videoId}`);
    }

    const transcriptOptions =
      typeof optionsOrWhisperModelPath === "string"
        ? { whisperModelPath: optionsOrWhisperModelPath }
        : optionsOrWhisperModelPath ?? {};

    const pipelineJobId = createTranscriptJobId(videoId, "pipeline");
    const preferredSource =
      transcriptOptions.sourcePreference ??
      (shouldAttemptCaptionTranscript(video) ? "youtube-captions" : "local-stt");
    updateLibrarySnapshot((current) => ({
      ...current,
      transcriptJobs: upsertTranscriptJob(current.transcriptJobs, {
        id: pipelineJobId,
        videoId,
        status: "running",
        preferredSource,
        progressPercent: 1,
      }),
    }));

    const result = await transcriptService.extractTranscript({
      video,
      ...transcriptOptions,
    }, {
      onEvent(event) {
        applyTranscriptPipelineEvent(videoId, event);
      },
    });
    applyTranscriptResult(result);
    return result;
  }

  async function generateSummary(
    videoId: string,
    provider: ProviderKind = "openai",
    model?: string,
    options: {
      templateId?: VideoSummaryTemplateId;
      lengthMode?: SummaryLengthMode;
      outputLanguage?: string;
      streamingMode?: boolean;
      transcript?: TranscriptSegment[];
    } = {},
  ) {
    const video = findVideo(videoId);
    const transcript =
      options.transcript ??
      librarySnapshotRef.current.transcriptsByVideoId[videoId] ??
      [];
    setSummaryJob(videoId, {
      videoId,
      status: "running",
      provider,
      model,
      streamingMode: options.streamingMode,
    });

    try {
      const summary = await summaryChatService.generateSummary({
        video,
        transcript,
        provider,
        model,
        templateId: options.templateId,
        lengthMode: options.lengthMode,
        outputLanguage: options.outputLanguage,
        streamingMode: options.streamingMode,
        onTextSnapshot: options.streamingMode
          ? (draftText) => {
              setSummaryJob(videoId, {
                videoId,
                status: "running",
                provider,
                model,
                streamingMode: true,
                draftText,
              });
            }
          : undefined,
      });

      updateLibrarySnapshot(
        (current) => ({
          ...current,
          summariesByVideoId: {
            ...current.summariesByVideoId,
            [videoId]: summary,
          },
          summaryHistoryByVideoId: {
            ...current.summaryHistoryByVideoId,
            [videoId]: upsertSummaryDocument(
              current.summaryHistoryByVideoId[videoId] ?? [],
              summary,
            ),
          },
        }),
        true,
      );
      clearSummaryJob(videoId);

      return summary;
    } catch (error) {
      setSummaryJob(videoId, {
        videoId,
        status: "failed",
        provider,
        model,
        errorMessage:
          error instanceof Error ? error.message : "summary_generation_failed",
      });
      throw error;
    }
  }

  async function sendChat({
    videoId,
    question,
    contextMode,
    provider = "openai",
    model,
    summaryId,
    sessionId,
    streamingMode,
  }: {
    videoId: string;
    question: string;
    contextMode: ChatContextMode;
    provider?: ProviderKind;
    model?: string;
    summaryId?: string;
    sessionId?: string;
    streamingMode?: boolean;
  }) {
    const video = findVideo(videoId);
    const activeSessionId =
      sessionId ?? activeChatSessionIdsByVideoId[videoId] ?? "default";
    setChatJob(videoId, {
      videoId,
      status: "running",
      provider,
      model,
      streamingMode,
    });

    try {
      const messages = await summaryChatService.sendChat({
        video,
        question,
        contextMode,
        provider,
        model,
        sessionId: activeSessionId,
        transcript: librarySnapshotRef.current.transcriptsByVideoId[videoId] ?? [],
        summary:
          summaryById(librarySnapshotRef.current, videoId, summaryId) ??
          latestSummaryForVideo(librarySnapshotRef.current, videoId),
        streamingMode,
        onTextSnapshot: streamingMode
          ? (draftText) => {
              setChatJob(videoId, {
                videoId,
                status: "running",
                provider,
                model,
                streamingMode: true,
                draftText,
              });
            }
          : undefined,
      });

      updateLibrarySnapshot(
        (current) => ({
          ...current,
          chatMessagesByVideoId: {
            ...current.chatMessagesByVideoId,
            [videoId]: [
              ...(current.chatMessagesByVideoId[videoId] ?? []),
              ...messages,
            ],
          },
        }),
        true,
      );
      clearChatJob(videoId);

      return messages;
    } catch (error) {
      setChatJob(videoId, {
        videoId,
        status: "failed",
        provider,
        model,
        errorMessage: error instanceof Error ? error.message : "chat_failed",
      });
      throw error;
    }
  }

  async function generatePodcast({
    videoId,
    provider = "openai",
    model,
    mode,
    sourceKind,
    lengthMode,
    outputLanguage,
    speakers,
    tts,
    transcript,
    transcriptVariantId,
    summaryId,
  }: {
    videoId: string;
    provider?: ProviderKind;
    model?: string;
    mode: PodcastOutputMode;
    sourceKind: PodcastSourceKind;
    lengthMode: PodcastLengthMode;
    outputLanguage?: string;
    speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig];
    tts: PodcastDocument["tts"];
    transcript?: TranscriptSegment[];
    transcriptVariantId?: string;
    summaryId?: string;
  }) {
    const video = findVideo(videoId);
    const resolvedTranscript =
      transcript ?? librarySnapshotRef.current.transcriptsByVideoId[videoId] ?? [];
    const transcriptVariant = transcriptVariantId
      ? (librarySnapshotRef.current.transcriptVariantsByVideoId[videoId] ?? []).find(
          (variant) => variant.id === transcriptVariantId,
        )
      : undefined;
    const summary =
      summaryById(librarySnapshotRef.current, videoId, summaryId) ??
      latestSummaryForVideo(librarySnapshotRef.current, videoId);

    setPodcastJob(videoId, {
      videoId,
      status: "running",
      stage: "script",
      provider,
      model,
    });

    try {
      const script = await summaryChatService.generatePodcastScript({
        video,
        sourceKind,
        summary,
        transcript: resolvedTranscript,
        transcriptVariant,
        mode,
        lengthMode,
        outputLanguage,
        speakers,
        provider,
        model,
      });
      const podcastId = createPodcastId(videoId);
      const basePodcast = createPodcastDocument({
        video,
        id: podcastId,
        mode,
        sourceKind,
        lengthMode,
        outputLanguage,
        provider,
        model,
        script,
        tts,
        sourceSummaryId: summary?.id,
        sourceTranscriptVariantId: transcriptVariant?.id,
      });

      setPodcastJob(videoId, {
        videoId,
        status: "running",
        stage: "tts",
        provider,
        model,
      });
      const ttsResult = await podcastTtsGenerator({
        video,
        podcast: basePodcast,
      });
      const podcast = {
        ...basePodcast,
        artifacts: {
          ...basePodcast.artifacts,
          manifestPath: ttsResult.manifestPath,
          scriptPath: ttsResult.scriptPath,
          podcastAudioPath: ttsResult.audioPath,
          turnAudioPaths: ttsResult.turnAudioPaths,
        },
        durationSeconds: ttsResult.durationSeconds,
        sizeBytes: ttsResult.sizeBytes,
      } satisfies PodcastDocument;

      updateLibrarySnapshot(
        (current) => ({
          ...current,
          podcastsByVideoId: {
            ...current.podcastsByVideoId,
            [videoId]: podcast,
          },
          podcastHistoryByVideoId: {
            ...current.podcastHistoryByVideoId,
            [videoId]: upsertPodcastDocument(
              current.podcastHistoryByVideoId[videoId] ?? [],
              podcast,
            ),
          },
        }),
        true,
      );
      clearPodcastJob(videoId);
      return podcast;
    } catch (error) {
      setPodcastJob(videoId, {
        videoId,
        status: "failed",
        stage: "tts",
        provider,
        model,
        errorMessage:
          error instanceof Error ? error.message : "podcast_generation_failed",
      });
      throw error;
    }
  }

  function deletePodcast(videoId: string, podcastId: string) {
    updateLibrarySnapshot(
      (current) => {
        const history = (current.podcastHistoryByVideoId[videoId] ?? []).filter(
          (podcast) => podcast.id !== podcastId,
        );
        return {
          ...current,
          podcastsByVideoId:
            current.podcastsByVideoId[videoId]?.id === podcastId
              ? history[0]
                ? {
                    ...current.podcastsByVideoId,
                    [videoId]: history[0],
                  }
                : omitRecordKey(current.podcastsByVideoId, videoId)
              : current.podcastsByVideoId,
          podcastHistoryByVideoId: {
            ...current.podcastHistoryByVideoId,
            [videoId]: history,
          },
        };
      },
      true,
    );
  }

  function resetChatSession(videoId: string) {
    const nextSessionId = `session-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setActiveChatSessionIdsByVideoId((current) => ({
      ...current,
      [videoId]: nextSessionId,
    }));
    return nextSessionId;
  }

  async function reviewTranscript(
    videoId: string,
    provider: ProviderKind = "openai",
    model?: string,
  ) {
    const video = findVideo(videoId);
    const transcript = librarySnapshotRef.current.transcriptsByVideoId[videoId] ?? [];

    const reviewed = await summaryChatService.reviewTranscript({
      video,
      transcript,
      provider,
      model,
    });

    updateLibrarySnapshot(
      (current) => ({
        ...current,
        transcriptsByVideoId: {
          ...current.transcriptsByVideoId,
          [videoId]: reviewed,
        },
      }),
      true,
    );

    return reviewed;
  }

  async function translateTranscript({
    videoId,
    provider = "openai",
    model,
    language,
  }: {
    videoId: string;
    provider?: ProviderKind;
    model?: string;
    language: TranscriptLanguageOption;
  }) {
    const video = findVideo(videoId);
    const transcript = librarySnapshotRef.current.transcriptsByVideoId[videoId] ?? [];
    const variant = await summaryChatService.translateTranscript({
      video,
      transcript,
      provider,
      model,
      language,
    });

    updateLibrarySnapshot(
      (current) => ({
        ...current,
        transcriptVariantsByVideoId: {
          ...current.transcriptVariantsByVideoId,
          [videoId]: upsertTranscriptVariant(
            current.transcriptVariantsByVideoId[videoId] ?? [],
            variant,
          ),
        },
      }),
      true,
    );

    return variant;
  }

  function createMarkdownSave(
    videoId: string,
    targetPath?: string,
    summaryId?: string,
  ): MarkdownSavePayload {
    const video = findVideo(videoId);
    const summary =
      summaryById(librarySnapshotRef.current, videoId, summaryId) ??
      latestSummaryForVideo(librarySnapshotRef.current, videoId);

    if (!summary) {
      throw new Error(`Missing summary for video: ${videoId}`);
    }

    return summaryChatService.createMarkdownSave({
      video,
      summary,
      targetPath,
    });
  }

  function renameVideoTitle(videoId: string, title: string) {
    const nextTitle = title.trim();

    if (!nextTitle) {
      throw new Error("video_title_empty");
    }

    updateLibrarySnapshot(
      (current) => ({
        ...current,
        videos: current.videos.map((video) =>
          video.id === videoId ? { ...video, title: nextTitle } : video,
        ),
      }),
      true,
    );
  }

  function deleteVideo(videoId: string) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        videos: current.videos.filter((video) => video.id !== videoId),
        playlists: current.playlists.map((playlist) => ({
          ...playlist,
          videoIds: playlist.videoIds.filter((candidate) => candidate !== videoId),
        })),
        transcriptJobs: current.transcriptJobs.filter(
          (job) => job.videoId !== videoId,
        ),
        transcriptsByVideoId: omitRecordKey(current.transcriptsByVideoId, videoId),
        transcriptVariantsByVideoId: omitRecordKey(
          current.transcriptVariantsByVideoId,
          videoId,
        ),
        summariesByVideoId: omitRecordKey(current.summariesByVideoId, videoId),
        summaryHistoryByVideoId: omitRecordKey(
          current.summaryHistoryByVideoId,
          videoId,
        ),
        chatMessagesByVideoId: omitRecordKey(
          current.chatMessagesByVideoId,
          videoId,
        ),
        podcastsByVideoId: omitRecordKey(current.podcastsByVideoId, videoId),
        podcastHistoryByVideoId: omitRecordKey(
          current.podcastHistoryByVideoId,
          videoId,
        ),
      }),
      true,
    );
    clearSummaryJob(videoId);
    clearChatJob(videoId);
    clearPodcastJob(videoId);
    setSelectedVideoId((current) => {
      if (current !== videoId) return current;

      return librarySnapshotRef.current.videos[0]?.id;
    });
  }

  function updateTranscriptSegment(
    videoId: string,
    segmentId: string,
    text: string,
  ) {
    const nextText = text.trim();

    if (!nextText) {
      throw new Error("transcript_segment_text_empty");
    }

    updateLibrarySnapshot(
      (current) => {
        const transcript = current.transcriptsByVideoId[videoId] ?? [];

        return {
          ...current,
          transcriptsByVideoId: {
            ...current.transcriptsByVideoId,
            [videoId]: transcript.map((segment) =>
              segment.id === segmentId
                ? { ...segment, text: nextText }
                : segment,
            ),
          },
        };
      },
      true,
    );
  }

  function updateSummaryMarkdown(
    videoId: string,
    summaryId: string,
    markdown: string,
  ) {
    updateLibrarySnapshot(
      (current) => {
        const history = current.summaryHistoryByVideoId[videoId] ?? [];
        const updateSummary = (summary: SummaryDocument) =>
          summary.id === summaryId ? { ...summary, markdown } : summary;

        return {
          ...current,
          summariesByVideoId: {
            ...current.summariesByVideoId,
            ...(current.summariesByVideoId[videoId]?.id === summaryId
              ? { [videoId]: updateSummary(current.summariesByVideoId[videoId]) }
              : {}),
          },
          summaryHistoryByVideoId: {
            ...current.summaryHistoryByVideoId,
            [videoId]: history.map(updateSummary),
          },
        };
      },
      true,
    );
  }

  function createPlaylist(title: string) {
    const playlist = createVideoPlaylist({ title });

    updateLibrarySnapshot(
      (current) => ({
        ...current,
        playlists: [playlist, ...current.playlists],
      }),
      true,
    );

    return playlist;
  }

  function renamePlaylist(playlistId: string, title: string) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === playlistId ? renameVideoPlaylist(playlist, title) : playlist,
        ),
      }),
      true,
    );
  }

  function setPlaylistCover(playlistId: string, coverImagePath: string) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === playlistId
            ? setVideoPlaylistCover(playlist, coverImagePath)
            : playlist,
        ),
      }),
      true,
    );
  }

  function addPlaylistVideo(playlistId: string, videoId: string) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === playlistId
            ? addVideoToPlaylist(playlist, videoId)
            : playlist,
        ),
      }),
      true,
    );
  }

  function reorderPlaylistVideo(
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) {
    updateLibrarySnapshot(
      (current) => ({
        ...current,
        playlists: current.playlists.map((playlist) =>
          playlist.id === playlistId
            ? reorderPlaylistVideos(playlist, fromIndex, toIndex)
            : playlist,
        ),
      }),
      true,
    );
  }

  function applyIngestResult(result: IngestResult) {
    updateLibrarySnapshot(
      (current) => {
        const next: MediaLibrarySnapshot = {
          ...current,
          ingestJobs: upsertIngestJob(current.ingestJobs, result.job),
        };

        if (result.ok) {
          next.videos = [
            result.video,
            ...current.videos.filter((video) => video.id !== result.video.id),
          ];
        }

        return next;
      },
      true,
    );

    if (result.ok) setSelectedVideoId(result.video.id);
  }

  function applyTranscriptResult(result: TranscriptPipelineResult) {
    updateLibrarySnapshot(
      (current) => {
        const next: MediaLibrarySnapshot = {
          ...current,
          transcriptJobs: upsertTranscriptJob(current.transcriptJobs, result.job),
        };

        if (!result.ok) return next;

        const video = current.videos.find(
          (candidate) => candidate.id === result.job.videoId,
        );
        const currentSegments = current.transcriptsByVideoId[result.job.videoId] ?? [];
        const currentSourceKind = currentSegments[0]?.sourceKind;
        const resultSourceKind = result.segments[0]?.sourceKind;

        next.transcriptsByVideoId = {
          ...current.transcriptsByVideoId,
          [result.job.videoId]: result.segments,
        };

        if (
          video &&
          currentSegments.length > 0 &&
          currentSourceKind &&
          resultSourceKind &&
          currentSourceKind !== resultSourceKind
        ) {
          const existingVariants = current.transcriptVariantsByVideoId[result.job.videoId] ?? [];
          const keptVariants = existingVariants.filter(
            (variant) =>
              variant.kind !== "source" || variant.sourceKind !== resultSourceKind,
          );
          next.transcriptVariantsByVideoId = {
            ...current.transcriptVariantsByVideoId,
            [result.job.videoId]: upsertTranscriptVariant(
              keptVariants,
              createTranscriptSourceVariant({
                video,
                sourceKind: currentSourceKind,
                segments: currentSegments,
              }),
            ),
          };
        }

        return next;
      },
      result.ok,
    );
  }

  function applyTranscriptPipelineEvent(
    videoId: string,
    event: TranscriptPipelineEvent,
  ) {
    const pipelineJobId = createTranscriptJobId(videoId, "pipeline");
    const patch = transcriptJobPatchFromEvent(event);

    if (!patch) return;

    updateLibrarySnapshot((current) => ({
      ...current,
      transcriptJobs: upsertTranscriptJob(current.transcriptJobs, {
        id: pipelineJobId,
        videoId,
        status: "running",
        preferredSource: "youtube-captions",
        progressPercent: 1,
        ...patch,
      }),
    }));
  }

  function findVideo(videoId: string) {
    const video = librarySnapshotRef.current.videos.find(
      (candidate) => candidate.id === videoId,
    );

    if (!video) {
      throw new Error(`Unknown video: ${videoId}`);
    }

    return video;
  }

  return {
    state: {
      activeView,
      selectedVideoId,
      videos: librarySnapshot.videos,
      ingestJobs: librarySnapshot.ingestJobs,
      transcriptJobs: librarySnapshot.transcriptJobs,
      summaryJobsByVideoId,
      chatJobsByVideoId,
      transcriptsByVideoId: librarySnapshot.transcriptsByVideoId,
      transcriptVariantsByVideoId: librarySnapshot.transcriptVariantsByVideoId,
      summariesByVideoId: librarySnapshot.summariesByVideoId,
      summaryHistoryByVideoId: librarySnapshot.summaryHistoryByVideoId,
      chatMessagesByVideoId: librarySnapshot.chatMessagesByVideoId,
      podcastsByVideoId: librarySnapshot.podcastsByVideoId,
      podcastHistoryByVideoId: librarySnapshot.podcastHistoryByVideoId,
      podcastJobsByVideoId,
      activeChatSessionIdsByVideoId,
      playlists: librarySnapshot.playlists,
    } satisfies MediaLibraryState,
    selectedVideo,
    selectedTranscript,
    selectedTranscriptVariants,
    selectedSummary,
    selectedSummaryHistory,
    selectedSummaryJob,
    selectedChatJob,
    selectedPodcast,
    selectedPodcastHistory,
    selectedPodcastJob,
    selectedChatMessages,
    importLocalFile,
    importYoutubeUrl,
    extractTranscript,
    listCaptionLanguages,
    generateSummary,
    sendChat,
    generatePodcast,
    deletePodcast,
    resetChatSession,
    reviewTranscript,
    translateTranscript,
    createMarkdownSave,
    renameVideoTitle,
    deleteVideo,
    updateTranscriptSegment,
    updateSummaryMarkdown,
    createPlaylist,
    renamePlaylist,
    setPlaylistCover,
    addPlaylistVideo,
    reorderPlaylistVideo,
    cancelIngestJob,
    removeFailedIngestJob,
    setActiveView,
    setSelectedVideoId,
  };

  function updateLibrarySnapshot(
    update: (current: MediaLibrarySnapshot) => MediaLibrarySnapshot,
    persist = false,
  ) {
    const next = update(librarySnapshotRef.current);
    hasLocalMutationRef.current = true;
    librarySnapshotRef.current = next;
    setLibrarySnapshot(next);

    if (persist) {
      void repository.saveSnapshot(next);
    }

    return next;
  }

  function setSummaryJob(videoId: string, job: AiGenerationJob) {
    setSummaryJobsByVideoId((current) => ({ ...current, [videoId]: job }));
  }

  function clearSummaryJob(videoId: string) {
    setSummaryJobsByVideoId((current) => omitRecordKey(current, videoId));
  }

  function setChatJob(videoId: string, job: AiGenerationJob) {
    setChatJobsByVideoId((current) => ({ ...current, [videoId]: job }));
  }

  function clearChatJob(videoId: string) {
    setChatJobsByVideoId((current) => omitRecordKey(current, videoId));
  }

  function setPodcastJob(videoId: string, job: PodcastGenerationJob) {
    setPodcastJobsByVideoId((current) => ({ ...current, [videoId]: job }));
  }

  function clearPodcastJob(videoId: string) {
    setPodcastJobsByVideoId((current) => omitRecordKey(current, videoId));
  }
}

function omitRecordKey<TValue>(record: Record<string, TValue>, key: string) {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function upsertSummaryDocument(
  summaries: SummaryDocument[],
  summary: SummaryDocument,
) {
  return [
    ...summaries.filter((candidate) => candidate.id !== summary.id),
    summary,
  ].sort(compareSummaryCreatedAtDesc);
}

function upsertTranscriptVariant(
  variants: TranscriptVariant[],
  variant: TranscriptVariant,
) {
  return [
    variant,
    ...variants.filter((candidate) => candidate.id !== variant.id),
  ].sort((left, right) => {
    return (
      (Date.parse(right.createdAtIso) || 0) -
      (Date.parse(left.createdAtIso) || 0)
    );
  });
}

function upsertPodcastDocument(
  podcasts: PodcastDocument[],
  podcast: PodcastDocument,
) {
  return [
    podcast,
    ...podcasts.filter((candidate) => candidate.id !== podcast.id),
  ].sort(comparePodcastCreatedAtDesc);
}

function summaryHistoryForVideo(
  snapshot: MediaLibrarySnapshot,
  videoId: string,
) {
  const history = snapshot.summaryHistoryByVideoId[videoId] ?? [];
  const latest = snapshot.summariesByVideoId[videoId];

  if (!latest || history.some((summary) => summary.id === latest.id)) {
    return [...history].sort(compareSummaryCreatedAtDesc);
  }

  return [...history, latest].sort(compareSummaryCreatedAtDesc);
}

function latestSummaryForVideo(
  snapshot: MediaLibrarySnapshot,
  videoId: string,
) {
  return summaryHistoryForVideo(snapshot, videoId)[0];
}

function summaryById(
  snapshot: MediaLibrarySnapshot,
  videoId: string,
  summaryId?: string,
) {
  if (!summaryId) return undefined;

  return summaryHistoryForVideo(snapshot, videoId).find(
    (summary) => summary.id === summaryId,
  );
}

function compareSummaryCreatedAtDesc(
  left: SummaryDocument,
  right: SummaryDocument,
) {
  return (
    (Date.parse(right.createdAtIso) || 0) -
    (Date.parse(left.createdAtIso) || 0)
  );
}

function comparePodcastCreatedAtDesc(
  left: PodcastDocument,
  right: PodcastDocument,
) {
  return (
    (Date.parse(right.createdAtIso) || 0) -
    (Date.parse(left.createdAtIso) || 0)
  );
}

function upsertIngestJob(jobs: IngestJob[], nextJob: IngestJob) {
  const existingIndex = jobs.findIndex((job) => job.id === nextJob.id);

  if (existingIndex === -1) {
    return [nextJob, ...jobs];
  }

  return jobs.map((job) => (job.id === nextJob.id ? { ...job, ...nextJob } : job));
}

function upsertTranscriptJob(jobs: TranscriptJob[], nextJob: TranscriptJob) {
  const existingIndex = jobs.findIndex((job) => job.id === nextJob.id);

  if (existingIndex === -1) {
    return [nextJob, ...jobs];
  }

  return jobs.map((job) =>
    job.id === nextJob.id
      ? {
          ...job,
          ...nextJob,
          progressPercent:
            nextJob.status === "running"
              ? Math.max(job.progressPercent, nextJob.progressPercent)
              : nextJob.progressPercent,
        }
      : job,
  );
}

function transcriptJobPatchFromEvent(
  event: TranscriptPipelineEvent,
): Partial<TranscriptJob> | undefined {
  if (event.type === "transcript_source_selected") {
    return {
      preferredSource: event.sourceKind,
      progressPercent: event.sourceKind === "youtube-captions" ? 98 : 99,
    };
  }

  const helperEvent = event.event;
  const preferredSource =
    helperEvent.command === "extract_audio" || helperEvent.command === "transcribe_audio"
      ? "local-stt"
      : "youtube-captions";

  if (helperEvent.type === "job_failed") {
    if (helperEvent.command === "extract_captions") {
      return {
        status: "running",
        preferredSource: "local-stt",
        progressPercent: transcriptProgressRange("extract_captions").end,
        errorMessage: undefined,
      };
    }

    return {
      status: "failed",
      preferredSource,
      progressPercent: 0,
      errorMessage: helperEvent.message,
    };
  }

  if (helperEvent.type === "job_cancelled") {
    return {
      status: "failed",
      progressPercent: 0,
      errorMessage: "transcript_job_cancelled",
    };
  }

  if (helperEvent.type === "job_started") {
    return {
      status: "running",
      preferredSource,
      progressPercent: transcriptProgressForCommand(helperEvent.command, 0),
    };
  }

  if (helperEvent.type === "job_progress") {
    return {
      status: "running",
      preferredSource,
      progressPercent: transcriptProgressForCommand(
        helperEvent.command,
        helperEvent.progressPercent,
      ),
    };
  }

  if (helperEvent.type === "job_completed") {
    return {
      status: "running",
      preferredSource,
      progressPercent: transcriptProgressForCommand(helperEvent.command, 100),
    };
  }

  return undefined;
}

function transcriptProgressForCommand(
  command: HelperCommandName,
  commandProgressPercent: number,
) {
  const progress = Math.max(0, Math.min(commandProgressPercent, 100)) / 100;
  const range = transcriptProgressRange(command);

  return Math.round(range.start + (range.end - range.start) * progress);
}

function transcriptProgressRange(command: HelperCommandName) {
  switch (command) {
    case "extract_captions":
      return { start: 2, end: 35 };
    case "extract_audio":
      return { start: 40, end: 55 };
    case "transcribe_audio":
      return { start: 60, end: 99 };
    default:
      return { start: 1, end: 5 };
  }
}

function shouldAttemptCaptionTranscript(video: VideoAsset) {
  return (
    mediaSourceTypeForAsset(video) === "video" &&
    video.sourceKind !== "local-file" &&
    Boolean(video.originalUri)
  );
}

function updateIngestJob(
  jobs: IngestJob[],
  jobId: string,
  patch: Partial<IngestJob>,
) {
  return jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job));
}

function createDefaultIngestService() {
  const helperClient = createDefaultHelperClient();

  return canUseTauriRuntime()
    ? createTauriIngestService(helperClient)
    : createMockIngestService(helperClient);
}

function createDefaultTranscriptService() {
  return createHelperTranscriptService(createDefaultHelperClient());
}

function createDefaultHelperClient(): HelperClient {
  return canUseTauriRuntime() ? new TauriHelperClient() : new FakeHelperClient();
}
