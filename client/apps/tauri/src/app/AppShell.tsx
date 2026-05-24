import {
  sanitizeChatMessageTtsPathSegment,
  type ChatContextMode,
} from "@/domain/chat";
import type { DownloadRecoveryActionKind } from "@/domain/download-error";
import type { CaptionLanguage } from "@/domain/helper-protocol";
import type {
  ChatMessage,
  IngestJob,
  MediaSourceType,
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
  VideoLibraryQuery,
} from "@/domain/media-library";
import type {
  SettingsSnapshot,
  VideoDownloadAccessAction,
} from "@/domain/settings";
import type {
  SummaryLengthMode,
  VideoSummaryTemplateId,
} from "@/domain/summary";
import type {
  PodcastDocument,
  PodcastLengthMode,
  PodcastOutputMode,
  PodcastSourceKind,
  PodcastSpeakerConfig,
} from "@/domain/podcast";
import type { TranscriptLanguageOption } from "@/domain/transcript-actions";
import type { SetupDialogMode } from "@/features/setup/SetupDialog";
import type { TranslationKey } from "@/i18n";
import type {
  AiProviderPreferences,
  AiWorkflowProviderConfig,
} from "@/services/aiProviderPreferencesService";
import type { VideoArtifactDownloadKind } from "@/services/artifactExportService";
import type { SupertonicChatTtsArtifact } from "@/services/supertonicService";
import type { SystemPromptSettings } from "@/services/systemPromptSettingsService";
import type { AppColorSeed, AppTheme } from "@/services/themeSettingsService";
import type {
  QwenPresetVoiceId,
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
  TtsSettings,
} from "@/services/ttsSettingsService";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/app/AppLayout";
import { CopyDropdownMenuItem } from "@/components/CopyAction";
import { FloatingMiniPlayer } from "@/components/video/FloatingMiniPlayer";
import { VideoDownloadMenuButton } from "@/components/video/VideoDownloadMenu";
import {
  isSupportedLocalMediaFile,
  mediaSourceTypeFromFileName,
} from "@/domain/ingest";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { defaultProviderModels } from "@/domain/provider";
import { selectPreferredSttModel } from "@/domain/settings";
import { formatTimestamp } from "@/domain/summary";
import { FaqView } from "@/features/faq/FaqView";
import { AddVideoDialog } from "@/features/finder/AddVideoDialog";
import { FinderView } from "@/features/finder/FinderView";
import { OnboardingView } from "@/features/onboarding/OnboardingView";
import { PlaylistView } from "@/features/playlists/PlaylistView";
import { SettingsView } from "@/features/settings/SettingsView";
import { SetupDialog } from "@/features/setup/SetupDialog";
import { TutorialView } from "@/features/tutorial/TutorialView";
import { VoicesView } from "@/features/voices/VoicesView";
import { WorkbenchView } from "@/features/workbench/WorkbenchView";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useSettingsSnapshot } from "@/hooks/useSettingsSnapshot";
import { useTauriFileDrop } from "@/hooks/useTauriFileDrop";
import {
  shouldShowMiniPlayer,
  useVideoPlayback,
} from "@/hooks/useVideoPlayback";
import { useI18n } from "@/i18n";
import {
  loadAiProviderPreferences,
  saveAiProviderPreferences,
} from "@/services/aiProviderPreferencesService";
import { createArtifactExportService } from "@/services/artifactExportService";
import {
  isOpenableWebUrl,
  openExternalWebUrl,
  providerLabelForWebUrl,
} from "@/services/externalUrlService";
import { revealExportedFile } from "@/services/fileRevealService";
import { createPlaylistCoverService } from "@/services/playlistCoverService";
import {
  createPodcastDownloadFileName,
  deletePodcastTts,
  resolvePodcastAudioUrl,
} from "@/services/podcastService";
import {
  setYtDlpAutoUpdatePolicy,
  updateAppNow,
  updateYtDlpNow,
} from "@/services/settingsService";
import { createSetupService, whisperModelPath } from "@/services/setupService";
import {
  createVoiceMessageDownloadFileName,
  findLatestChatBubbleSupertonicAudio,
  readChatBubbleWithSupertonic,
  resolveChatBubbleSupertonicAudioUrl,
} from "@/services/supertonicService";
import {
  loadSystemPromptSettings,
  resetSystemPromptSettings,
  saveSystemPromptSettings,
} from "@/services/systemPromptSettingsService";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import {
  applyAppTheme,
  loadAppColorSeed,
  loadAppTheme,
  saveAppColorSeed,
  saveAppTheme,
} from "@/services/themeSettingsService";
import {
  defaultLanguageForModel,
  loadTtsSettings,
  qwenPresetVoices,
  saveTtsSettings,
  supertonicPresetVoiceStyles,
  supertonicPresetVoiceStyleLabel,
  ttsEngineForModel,
} from "@/services/ttsSettingsService";
import {
  createTranscriptOverlayPayload,
  showTranscriptOverlay,
  transcriptOverlayHiddenEvent,
} from "@/services/transcriptOverlayService";
import { describeVideoDownloadAccessAction } from "@/services/videoDownloadAccessNoticeService";
import { listen } from "@tauri-apps/api/event";
import { ExternalLink, Info, Loader2, Search, Volume2 } from "lucide-react";

import type { TranscriptionLanguageCode } from "@acme/model-card";
import {
  isSynthesisLanguageSupportedByModel,
  localTtsModelCards,
  synthesisLanguagesForModel,
  transcriptionLanguagesForModel,
} from "@acme/model-card";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Input } from "@acme/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";

type PendingAction =
  | { mode: "transcription"; videoId: string }
  | { mode: "provider"; provider: ProviderKind; model: string }
  | {
      mode: "summary";
      videoId: string;
      provider: ProviderKind;
      model: string;
      templateId: VideoSummaryTemplateId;
      lengthMode: SummaryLengthMode;
      outputLanguage?: string;
      streamingMode: boolean;
      transcript?: TranscriptSegment[];
    }
  | {
      mode: "chat";
      videoId: string;
      question: string;
      contextMode: ChatContextMode;
      provider: ProviderKind;
      model: string;
      summaryId?: string;
      sessionId?: string;
      streamingMode?: boolean;
    }
  | {
      mode: "transcript-review";
      videoId: string;
      provider: ProviderKind;
      model: string;
    }
  | {
      mode: "transcript-translation";
      videoId: string;
      provider: ProviderKind;
      model: string;
      language: TranscriptLanguageOption;
    };

type AppNotice =
  | string
  | {
      message: string;
      action?: {
        label: string;
        onClick(): void | Promise<void>;
      };
    };

type VideoPlaybackMenuCommand = "play" | "pause";

type CaptionLanguageDialogState = {
  videoId: string;
  languages: CaptionLanguage[];
  captionStatus: "loading" | "ready" | "failed";
  providerLabel: string;
  whisperStatus?: "idle" | "downloading" | "preparing" | "failed";
  whisperDownloadProgressPercent?: number;
  whisperErrorMessage?: string;
  whisperModelId?: string;
  whisperModelName?: string;
  whisperModelPath?: string;
};

type PendingTtsRead = {
  video: VideoAsset;
  message: ChatMessage;
  renderedText: string;
};

type ChatTtsAudioByMessageId = Record<
  string,
  SupertonicChatTtsArtifact | undefined
>;

type ChatTtsGeneration = {
  videoId: string;
  messageId: string;
};

const onboardingStorageKey = "openbrief.onboarding-complete";
const videoPlaybackMenuEvent = "openbrief://video-playback-command";

function chatTtsVoiceName(
  modelId: TtsModelId,
  voiceStyleId: SupertonicVoiceStyleId,
  qwenPresetVoiceId: QwenPresetVoiceId,
) {
  if (ttsEngineForModel(modelId) === "qwen") {
    return (
      qwenPresetVoices.find((voice) => voice.id === qwenPresetVoiceId)?.label ??
      qwenPresetVoiceId
    );
  }

  return supertonicPresetVoiceStyleLabel(voiceStyleId);
}

export function AppShell() {
  const { t } = useI18n();
  const {
    state,
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
    cancelIngestJob,
    removeFailedIngestJob,
    listCaptionLanguages,
    extractTranscript,
    generateSummary,
    generatePodcast,
    deletePodcast,
    sendChat,
    resetChatSession,
    updateChatMessageVoiceMessage,
    reviewTranscript,
    translateTranscript,
    renameVideoTitle,
    deleteVideo,
    updateTranscriptSegment,
    updateSummaryMarkdown,
    createPlaylist,
    renamePlaylist,
    setPlaylistCover,
    addPlaylistVideo,
    reorderPlaylistVideo,
    setActiveView,
    setSelectedVideoId,
  } = useMediaLibrary();
  const {
    playbackState,
    playVideo,
    pauseVideo,
    stopVideo,
    updateVideoTime,
    openPictureInPicture,
    playActiveOrSelectedVideo,
    pauseActiveVideo,
    moveMiniPlayer,
  } = useVideoPlayback();
  const {
    settings,
    errorMessage: settingsErrorMessage,
    refreshSettings,
  } = useSettingsSnapshot();
  const setupService = useMemo(() => createSetupService(), []);
  const artifactExportService = useMemo(
    () => createArtifactExportService(),
    [],
  );
  const activeViewRef = useRef(state.activeView);
  const chatTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatTtsGenerationRef = useRef<ChatTtsGeneration | undefined>(
    undefined,
  );
  const podcastAudioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedPodcastAudioUrl, setSelectedPodcastAudioUrl] = useState<string>();
  const playlistCoverService = useMemo(() => createPlaylistCoverService(), []);
  const [selectedWhisperModelId, setSelectedWhisperModelId] = useState(
    "parakeet-tdt-0.6b-v3",
  );
  const [setupProvider, setSetupProvider] = useState<ProviderKind>("openai");
  const [setupProviderModel, setSetupProviderModel] = useState(
    defaultProviderModels.openai,
  );
  const [pendingAction, setPendingAction] = useState<
    PendingAction | undefined
  >();
  const [downloadedWhisperModelIds, setDownloadedWhisperModelIds] = useState<
    string[]
  >([]);
  const [configuredProviderIds, setConfiguredProviderIds] = useState<
    ProviderKind[]
  >([]);
  const [systemPromptSettings, setSystemPromptSettings] = useState(() =>
    loadSystemPromptSettings(),
  );
  const [aiProviderPreferences, setAiProviderPreferences] = useState(() =>
    loadAiProviderPreferences(),
  );
  const [ttsSettings, setTtsSettings] = useState(() => loadTtsSettings());
  const [pendingTtsRead, setPendingTtsRead] = useState<
    PendingTtsRead | undefined
  >();
  const [chatTtsAudioByMessageId, setChatTtsAudioByMessageId] =
    useState<ChatTtsAudioByMessageId>({});
  const [chatTtsGeneration, setChatTtsGeneration] =
    useState<ChatTtsGeneration>();
  const [playingChatTtsMessageId, setPlayingChatTtsMessageId] =
    useState<string>();
  const [isVoiceCloneModeEnabled, setIsVoiceCloneModeEnabled] = useState(false);
  const [ttsModelDraft, setTtsModelDraft] = useState<TtsModelId>(
    () => ttsSettings.modelId,
  );
  const [ttsVoiceDraft, setTtsVoiceDraft] = useState<SupertonicVoiceStyleId>(
    () => ttsSettings.voiceStyleId,
  );
  const [ttsQwenPresetVoiceDraft, setTtsQwenPresetVoiceDraft] =
    useState<QwenPresetVoiceId>(() => ttsSettings.qwenPresetVoiceId);
  const [ttsLanguageDraft, setTtsLanguageDraft] = useState<TtsLanguageCode>(
    () => ttsSettings.languageCode,
  );
  const [appTheme, setAppTheme] = useState<AppTheme>(() => loadAppTheme());
  const [appColorSeed, setAppColorSeed] = useState<AppColorSeed>(() =>
    loadAppColorSeed(),
  );
  const [appNotice, setAppNotice] = useState<AppNotice | undefined>();
  const [isAddVideoDialogOpen, setIsAddVideoDialogOpen] = useState(false);
  const [addVideoPlaylistId, setAddVideoPlaylistId] = useState<
    string | undefined
  >();
  const [captionLanguageDialog, setCaptionLanguageDialog] = useState<
    CaptionLanguageDialogState | undefined
  >();
  const [finderQuery, setFinderQuery] = useState<VideoLibraryQuery>({
    sourceKind: "all",
    transcriptStatus: "all",
    summaryStatus: "all",
    sortBy: "created_at",
    page: 1,
  });
  const [openWorkbenchVideoIds, setOpenWorkbenchVideoIds] = useState<string[]>(
    [],
  );
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    readOnboardingComplete(),
  );
  const [activeSummaryIdsByVideoId, setActiveSummaryIdsByVideoId] = useState<
    Record<string, string>
  >({});
  const [
    activeTranscriptVariantIdsByVideoId,
    setActiveTranscriptVariantIdsByVideoId,
  ] = useState<Record<string, string>>({});
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<
    string | undefined
  >();
  const [transcriptOverlayVideoId, setTranscriptOverlayVideoId] = useState<
    string | undefined
  >();
  const [playlistImportJobTargets, setPlaylistImportJobTargets] = useState<
    Record<string, string>
  >({});
  const ingestJobStatusesRef = useRef(new Map<string, IngestJob["status"]>());
  const onboardingCompleteRef = useRef(onboardingComplete);
  const lastOverlaySegmentKeyRef = useRef<string | undefined>(undefined);
  activeViewRef.current = state.activeView;
  const { isDraggingFiles } = useTauriFileDrop({
    disabled: !onboardingComplete,
    onDrop: importDroppedFiles,
  });

  useEffect(() => {
    applyAppTheme(appTheme, appColorSeed);
  }, [appColorSeed, appTheme]);

  useEffect(() => {
    if (!canUseTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<VideoPlaybackMenuCommand>(videoPlaybackMenuEvent, (event) => {
      if (event.payload === "play") {
        playActiveOrSelectedVideo(selectedVideo?.id);
        return;
      }

      if (event.payload === "pause") {
        pauseActiveVideo();
      }
    }).then((callback) => {
      if (disposed) {
        callback();
        return;
      }

      unlisten = callback;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [pauseActiveVideo, playActiveOrSelectedVideo, selectedVideo?.id]);

  useEffect(() => {
    if (!canUseTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen(transcriptOverlayHiddenEvent, () => {
      setTranscriptOverlayVideoId(undefined);
      lastOverlaySegmentKeyRef.current = undefined;
    }).then((callback) => {
      if (disposed) {
        callback();
        return;
      }

      unlisten = callback;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const effectiveSettings = useMemo(() => {
    if (!settings) return settings;

    return {
      ...settings,
      stt: {
        ...settings.stt,
        models: settings.stt.models.map((model) => ({
          ...model,
          downloaded:
            model.downloaded || downloadedWhisperModelIds.includes(model.id),
        })),
      },
      llm: {
        ...settings.llm,
        accounts: settings.llm.accounts.map((account) => ({
          ...account,
          configured:
            account.configured ||
            configuredProviderIds.includes(account.provider),
        })),
      },
    };
  }, [configuredProviderIds, downloadedWhisperModelIds, settings]);

  const sttModels = effectiveSettings?.stt.models ?? [];
  const selectedWhisperModel = selectPreferredSttModel(
    sttModels,
    selectedWhisperModelId,
  );
  useEffect(() => {
    if (
      !effectiveSettings ||
      sttModels.length === 0 ||
      selectedWhisperModel?.id === selectedWhisperModelId
    ) {
      return;
    }

    setSelectedWhisperModelId(selectedWhisperModel?.id ?? "whisper-small");
  }, [
    effectiveSettings,
    selectedWhisperModel,
    selectedWhisperModelId,
    sttModels.length,
  ]);
  const setupMode: SetupDialogMode =
    pendingAction?.mode === "transcript-review" ||
    pendingAction?.mode === "transcript-translation"
      ? "summary"
      : (pendingAction?.mode ?? "transcription");
  const activePlaybackMedia = playbackState.activeVideoId
    ? state.videos.find((video) => video.id === playbackState.activeVideoId)
    : undefined;
  const activePlaybackSourceType = activePlaybackMedia
    ? mediaSourceTypeForAsset(activePlaybackMedia)
    : undefined;
  const miniPlayerVisible =
    Boolean(activePlaybackMedia && activePlaybackSourceType !== "pdf") &&
    shouldShowMiniPlayer(playbackState, state.activeView);
  const selectedTranscriptJob = selectedVideo
    ? state.transcriptJobs.find(
        (job) => job.videoId === selectedVideo.id && job.status !== "completed",
      )
    : undefined;
  const openWorkbenchVideos = useMemo(
    () =>
      openWorkbenchVideoIds
        .map((videoId) => state.videos.find((video) => video.id === videoId))
        .filter((video): video is VideoAsset => Boolean(video)),
    [openWorkbenchVideoIds, state.videos],
  );
  const activeSummaryId = selectedVideo
    ? activeSummaryIdsByVideoId[selectedVideo.id]
    : undefined;
  const activeSummary =
    findActiveSummary(selectedSummaryHistory, activeSummaryId) ??
    selectedSummary;
  const activeTranscriptVariantId = selectedVideo
    ? (activeTranscriptVariantIdsByVideoId[selectedVideo.id] ?? "original")
    : "original";
  const selectedChatTtsLookupKey = selectedChatMessages
    .map(
      (message) =>
        [
          message.id,
          sanitizeChatMessageTtsPathSegment(message.id),
          message.voiceMessage?.audioPath ?? "",
          message.voiceMessage?.generationId ?? "",
        ].join(":"),
    )
    .join("\n");

  useEffect(() => {
    if (!selectedVideo || selectedChatMessages.length === 0) {
      setChatTtsAudioByMessageId({});
      return;
    }

    let disposed = false;
    const video = selectedVideo;
    const messages = selectedChatMessages;
    const ttsPathKeyCounts = messages.reduce((counts, message) => {
      const key = sanitizeChatMessageTtsPathSegment(message.id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    void Promise.all(
      messages.map(async (message) => {
        if (message.voiceMessage) {
          return [message.id, message.voiceMessage] as const;
        }

        const ttsPathKey = sanitizeChatMessageTtsPathSegment(message.id);
        if ((ttsPathKeyCounts.get(ttsPathKey) ?? 0) > 1) {
          return [message.id, undefined] as const;
        }

        try {
          const artifact = await findLatestChatBubbleSupertonicAudio({
            video,
            message,
          });
          return [message.id, artifact] as const;
        } catch {
          return [message.id, undefined] as const;
        }
      }),
    ).then((entries) => {
      if (disposed) return;
      setChatTtsAudioByMessageId(Object.fromEntries(entries));
    });

    return () => {
      disposed = true;
    };
  }, [selectedChatTtsLookupKey, selectedVideo?.libraryPath]);

  useEffect(() => {
    if (!selectedPodcast) {
      setSelectedPodcastAudioUrl(undefined);
      return;
    }

    let disposed = false;
    void resolvePodcastAudioUrl(selectedPodcast)
      .then((audioUrl) => {
        if (!disposed) setSelectedPodcastAudioUrl(audioUrl);
      })
      .catch(() => {
        if (!disposed) setSelectedPodcastAudioUrl(undefined);
      });

    return () => {
      disposed = true;
    };
  }, [selectedPodcast?.id, selectedPodcast?.artifacts.podcastAudioPath]);

  const pageTitle = pageTitleForView(
    state.activeView,
    selectedVideo?.title,
    t("page.video"),
    t("page.playlists"),
    t("page.settings"),
    t("page.voices"),
    t("page.tutorial"),
    t("page.faq"),
    t("page.onboarding"),
  );
  const updateFinderSearchText = useCallback(
    (searchText: string | undefined) =>
      setFinderQuery((current) => {
        if (current.searchText === searchText) return current;

        return {
          ...current,
          searchText,
          page: 1,
        };
      }),
    [],
  );
  const headerContent =
    state.activeView === "finder" ? (
      <div className="flex w-full min-w-0 items-center justify-between gap-3">
        {state.videos.length > 0 ? (
          <div className="relative w-full max-w-xl">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="video-library-search">
              {t("finder.search.label")}
            </label>
            <FinderSearchInput
              searchText={finderQuery.searchText}
              onSearchTextChange={updateFinderSearchText}
            />
          </div>
        ) : (
          <div />
        )}
        <LibraryInfoMenu
          onOpenTutorial={() => showView("tutorial")}
          onOpenFaq={() => showView("faq")}
        />
      </div>
    ) : state.activeView === "workbench" && selectedVideo ? (
      <div className="ml-auto flex items-center gap-2">
        {isOpenableWebUrl(selectedVideo.originalUri) ? (
          <OriginalVideoLinkMenu video={selectedVideo} />
        ) : null}
        <VideoDownloadMenuButton
          video={selectedVideo}
          hasTranscript={selectedTranscript.length > 0}
          hasSummary={Boolean(activeSummary)}
          side="bottom"
          align="end"
          onDownloadArtifact={(kind) => {
            void downloadVideoArtifact(
              selectedVideo,
              kind,
              undefined,
              selectedTranscript,
            );
          }}
        />
      </div>
    ) : state.activeView === "voices" ? (
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant={isVoiceCloneModeEnabled ? "default" : "outline"}
          aria-pressed={isVoiceCloneModeEnabled}
          onClick={() =>
            setIsVoiceCloneModeEnabled((currentEnabled) => !currentEnabled)
          }
        >
          <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("voices.cloneVoice")}
        </Button>
      </div>
    ) : undefined;

  useEffect(() => {
    const previousStatuses = ingestJobStatusesRef.current;
    const completedJob = state.ingestJobs.find((job) => {
      const previousStatus = previousStatuses.get(job.id);

      return (
        job.status === "completed" &&
        (previousStatus === "queued" || previousStatus === "running")
      );
    });

    ingestJobStatusesRef.current = new Map(
      state.ingestJobs.map((job) => [job.id, job.status]),
    );

    if (completedJob) {
      setAppNotice(
        t("finder.job.completedToast", {
          title:
            completedJob.title ??
            completedJob.originalUri ??
            completedJob.sourceKind,
        }),
      );
    }
  }, [state.ingestJobs, t]);

  useEffect(() => {
    if (state.activeView === "settings") {
      void refreshSettings({ checkAppUpdate: true });
    }
  }, [refreshSettings, state.activeView]);

  useEffect(() => {
    onboardingCompleteRef.current = onboardingComplete;
  }, [onboardingComplete]);

  useEffect(() => {
    applyRouteView();

    function handlePopState() {
      applyRouteView();
    }

    function applyRouteView() {
      const nextRouteView = viewForPath(window.location.pathname);

      if (!onboardingCompleteRef.current && nextRouteView !== "onboarding") {
        setActiveView("onboarding");
        syncPathForView("onboarding", "replace");
        return;
      }

      setActiveView(nextRouteView);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setActiveView]);

  useEffect(() => {
    const existingVideoIds = new Set(state.videos.map((video) => video.id));

    setOpenWorkbenchVideoIds((current) =>
      current.filter((videoId) => existingVideoIds.has(videoId)),
    );
    setActiveSummaryIdsByVideoId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([videoId]) =>
          existingVideoIds.has(videoId),
        ),
      ),
    );
    setActiveTranscriptVariantIdsByVideoId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([videoId]) =>
          existingVideoIds.has(videoId),
        ),
      ),
    );
    setSelectedPlaylistId((current) =>
      current && state.playlists.some((playlist) => playlist.id === current)
        ? current
        : undefined,
    );
  }, [state.playlists, state.videos]);

  useEffect(() => {
    const completedTargets = Object.entries(playlistImportJobTargets).filter(
      ([jobId]) => {
        const job = state.ingestJobs.find(
          (candidate) => candidate.id === jobId,
        );
        return job?.status === "completed" && Boolean(job.videoId);
      },
    );

    if (completedTargets.length === 0) return;

    for (const [jobId, playlistId] of completedTargets) {
      const job = state.ingestJobs.find((candidate) => candidate.id === jobId);
      if (job?.videoId) {
        addPlaylistVideo(playlistId, job.videoId);
      }
    }

    setPlaylistImportJobTargets((current) => {
      const next = { ...current };
      for (const [jobId] of completedTargets) {
        delete next[jobId];
      }
      return next;
    });
  }, [addPlaylistVideo, playlistImportJobTargets, state.ingestJobs]);

  useEffect(() => {
    if (state.activeView !== "workbench" || !selectedVideo) return;

    setOpenWorkbenchVideoIds((current) =>
      current.includes(selectedVideo.id)
        ? current
        : [...current, selectedVideo.id],
    );
  }, [selectedVideo, state.activeView]);

  useEffect(() => {
    if (!selectedVideo || selectedSummaryHistory.length === 0) return;

    setActiveSummaryIdsByVideoId((current) => {
      const activeSummaryIdForVideo = current[selectedVideo.id];

      if (
        activeSummaryIdForVideo &&
        selectedSummaryHistory.some(
          (summary) => summary.id === activeSummaryIdForVideo,
        )
      ) {
        return current;
      }

      return {
        ...current,
        [selectedVideo.id]: selectedSummaryHistory[0].id,
      };
    });
  }, [selectedSummaryHistory, selectedVideo]);

  useEffect(() => {
    if (!transcriptOverlayVideoId || !selectedVideo) return;
    if (transcriptOverlayVideoId !== selectedVideo.id) return;

    const activeVariant = selectedTranscriptVariants.find(
      (variant) => variant.id === activeTranscriptVariantId,
    );
    const renderedTranscript = activeVariant?.segments ?? selectedTranscript;
    const segment = findSegmentForTime(
      renderedTranscript,
      playbackState.currentTimeSeconds,
    );
    const overlayKey = `${selectedVideo.id}:${activeTranscriptVariantId}:${segment?.id ?? "none"}:${Math.floor(playbackState.currentTimeSeconds)}`;
    if (lastOverlaySegmentKeyRef.current === overlayKey) return;

    lastOverlaySegmentKeyRef.current = overlayKey;
    void showTranscriptOverlay(
      createTranscriptOverlayPayload({
        video: selectedVideo,
        segment,
        timestamp: formatTimestamp(playbackState.currentTimeSeconds),
      }),
    );
  }, [
    activeTranscriptVariantId,
    playbackState.currentTimeSeconds,
    selectedTranscript,
    selectedTranscriptVariants,
    selectedVideo,
    transcriptOverlayVideoId,
  ]);

  function providerConfigured(provider: ProviderKind) {
    return Boolean(
      effectiveSettings?.llm.accounts.some(
        (account) => account.provider === provider && account.configured,
      ),
    );
  }

  function configureProvider(provider: ProviderKind) {
    const model =
      effectiveSettings?.llm.defaultModels[provider] ??
      defaultProviderModels[provider];
    setSetupProvider(provider);
    setSetupProviderModel(model);
    setPendingAction({ mode: "provider", provider, model });
  }

  function changeAppTheme(theme: AppTheme) {
    setAppTheme(saveAppTheme(theme));
  }

  function changeAppColorSeed(colorSeed: AppColorSeed) {
    setAppColorSeed(saveAppColorSeed(colorSeed));
  }

  async function extractTranscriptWithSetup(videoId: string) {
    const targetVideo = state.videos.find((video) => video.id === videoId);
    const shouldCheckCaptions =
      targetVideo !== undefined &&
      mediaSourceTypeForAsset(targetVideo) === "video" &&
      targetVideo.sourceKind !== "local-file";

    if (shouldCheckCaptions) {
      setCaptionLanguageDialog({
        videoId,
        languages: [],
        captionStatus: "loading",
        providerLabel:
          providerLabelForWebUrl(targetVideo.originalUri) ?? "Provider",
        whisperModelId: selectedWhisperModel?.id,
        whisperModelName: selectedWhisperModel?.name,
        ...(selectedWhisperModel?.downloaded
          ? { whisperModelPath: whisperModelPath(selectedWhisperModel) }
          : {}),
      });

      listCaptionLanguages(videoId)
        .then((languages) => {
          setCaptionLanguageDialog((current) =>
            current?.videoId === videoId
              ? { ...current, languages, captionStatus: "ready" }
              : current,
          );
        })
        .catch(() => {
          setCaptionLanguageDialog((current) =>
            current?.videoId === videoId
              ? { ...current, languages: [], captionStatus: "failed" }
              : current,
          );
        });

      return;
    }

    if (!selectedWhisperModel?.downloaded) {
      setPendingAction({ mode: "transcription", videoId });
      return;
    }

    return extractTranscript(videoId, {
      whisperModelPath: whisperModelPath(selectedWhisperModel),
      sourcePreference: "local-stt",
    });
  }

  async function extractTranscriptWithWhisper(language: string) {
    if (!captionLanguageDialog) return;

    const dialog = captionLanguageDialog;
    const dialogModel = selectPreferredSttModel(
      sttModels,
      dialog.whisperModelId ?? selectedWhisperModel?.id,
    );
    const dialogModelId = dialog.whisperModelId ?? dialogModel?.id;
    const dialogModelPath =
      dialog.whisperModelPath ??
      (dialogModel?.downloaded ? whisperModelPath(dialogModel) : undefined);
    const whisperLanguage = language === "auto" ? undefined : language;
    const updateWhisperDialog = (
      patch: Partial<CaptionLanguageDialogState>,
    ) => {
      setCaptionLanguageDialog((current) =>
        current?.videoId === dialog.videoId
          ? { ...current, ...patch }
          : current,
      );
    };

    if (!dialogModelPath && !dialogModelId) {
      setCaptionLanguageDialog(undefined);
      setPendingAction({ mode: "transcription", videoId: dialog.videoId });
      return;
    }

    try {
      if (!dialogModelPath && dialogModelId) {
        const modelId = dialogModelId;
        const isFluidAudioModel = dialogModel?.engine === "fluidaudio";
        updateWhisperDialog({
          whisperStatus: "downloading",
          whisperDownloadProgressPercent: isFluidAudioModel ? 5 : 0,
          whisperErrorMessage: undefined,
        });
        const result = await setupService.downloadWhisperModel(modelId, {
          onProgress(progress) {
            updateWhisperDialog({
              whisperStatus: "downloading",
              whisperDownloadProgressPercent: Math.max(
                isFluidAudioModel ? 5 : 0,
                progress.progressPercent,
              ),
            });
          },
        });
        setDownloadedWhisperModelIds((current) =>
          current.includes(modelId) ? current : [...current, modelId],
        );
        await refreshSettings();
        updateWhisperDialog({
          whisperStatus: "preparing",
          whisperDownloadProgressPercent: 100,
        });
        setCaptionLanguageDialog(undefined);
        await extractTranscript(dialog.videoId, {
          whisperModelPath: `models/${result.fileName}`,
          ...(whisperLanguage ? { whisperLanguage } : {}),
          sourcePreference: "local-stt",
        });
        setActiveTranscriptVariantIdsByVideoId((current) => ({
          ...current,
          [dialog.videoId]: "original",
        }));
        return;
      }

      setCaptionLanguageDialog(undefined);
      await extractTranscript(dialog.videoId, {
        whisperModelPath: dialogModelPath,
        ...(whisperLanguage ? { whisperLanguage } : {}),
        sourcePreference: "local-stt",
      });
      setActiveTranscriptVariantIdsByVideoId((current) => ({
        ...current,
        [dialog.videoId]: "original",
      }));
    } catch (error) {
      updateWhisperDialog({
        whisperStatus: "failed",
        whisperErrorMessage:
          error instanceof Error ? error.message : "transcription_failed",
      });
    }
  }

  async function extractTranscriptWithCaptionLanguage(
    language: CaptionLanguage,
  ) {
    if (!captionLanguageDialog) return;

    const dialog = captionLanguageDialog;
    setCaptionLanguageDialog(undefined);
    await extractTranscript(dialog.videoId, {
      languages: [language.code],
      sourcePreference: "youtube-captions",
      ...(dialog.whisperModelPath
        ? { whisperModelPath: dialog.whisperModelPath }
        : {}),
    });
    setActiveTranscriptVariantIdsByVideoId((current) => ({
      ...current,
      [dialog.videoId]: "original",
    }));
  }

  async function generateSummaryWithSetup(
    videoId: string,
    provider: ProviderKind,
    model: string,
    templateId: VideoSummaryTemplateId,
    lengthMode: SummaryLengthMode,
    outputLanguage: string | undefined,
    streamingMode: boolean,
    transcript?: TranscriptSegment[],
  ) {
    if (!providerConfigured(provider)) {
      setSetupProvider(provider);
      setSetupProviderModel(model);
      setPendingAction({
        mode: "summary",
        videoId,
        provider,
        model,
        templateId,
        lengthMode,
        outputLanguage,
        streamingMode,
        transcript,
      });
      return;
    }

    const summary = await generateSummary(videoId, provider, model, {
      templateId,
      lengthMode,
      outputLanguage,
      streamingMode,
      transcript,
    });
    setActiveSummaryTab(videoId, summary.id);
    return summary;
  }

  async function sendChatWithSetup(request: {
    videoId: string;
    question: string;
    contextMode: ChatContextMode;
    provider: ProviderKind;
    model: string;
    summaryId?: string;
    sessionId?: string;
    streamingMode?: boolean;
  }) {
    if (!providerConfigured(request.provider)) {
      setSetupProvider(request.provider);
      setSetupProviderModel(request.model);
      setPendingAction({ mode: "chat", ...request });
      return [];
    }

    return sendChatAndNotify(request);
  }

  async function sendChatAndNotify(request: Parameters<typeof sendChat>[0]) {
    const messages = await sendChat(request);
    const hasAssistantResponse = messages.some(
      (message) => message.role === "assistant",
    );

    if (hasAssistantResponse && activeViewRef.current !== "workbench") {
      const video = state.videos.find(
        (candidate) => candidate.id === request.videoId,
      );
      setAppNotice({
        message: t("notice.chat.completed", {
          title: video?.title ?? t("page.video"),
        }),
        action: {
          label: t("notice.open"),
          onClick: () => {
            openVideoTab(request.videoId);
            setSelectedVideoId(request.videoId);
            setActiveView("workbench");
            syncPathForView("workbench");
            setAppNotice(undefined);
          },
        },
      });
    }

    return messages;
  }

  async function reviewTranscriptWithSetup(
    videoId: string,
    provider: ProviderKind,
    model: string,
  ) {
    if (!providerConfigured(provider)) {
      setSetupProvider(provider);
      setSetupProviderModel(model);
      setPendingAction({ mode: "transcript-review", videoId, provider, model });
      return;
    }

    return reviewTranscript(videoId, provider, model);
  }

  async function translateTranscriptWithSetup(request: {
    videoId: string;
    provider: ProviderKind;
    model: string;
    language: TranscriptLanguageOption;
  }) {
    if (!providerConfigured(request.provider)) {
      setSetupProvider(request.provider);
      setSetupProviderModel(request.model);
      setPendingAction({ mode: "transcript-translation", ...request });
      return;
    }

    const variant = await translateTranscript(request);
    setActiveTranscriptVariantIdsByVideoId((current) => ({
      ...current,
      [request.videoId]: variant.id,
    }));
    return variant;
  }

  async function continuePendingAction() {
    if (!pendingAction) return;

    const action = pendingAction;
    setPendingAction(undefined);

    if (action.mode === "transcription") {
      const model = effectiveSettings?.stt.models.find(
        (candidate) => candidate.id === selectedWhisperModelId,
      );
      await extractTranscript(action.videoId, {
        whisperModelPath: whisperModelPath(model),
        sourcePreference: "local-stt",
      });
      setActiveTranscriptVariantIdsByVideoId((current) => ({
        ...current,
        [action.videoId]: "original",
      }));
      return;
    }

    if (action.mode === "summary") {
      const summary = await generateSummary(
        action.videoId,
        setupProvider,
        setupProviderModel,
        {
          templateId: action.templateId,
          lengthMode: action.lengthMode,
          outputLanguage: action.outputLanguage,
          streamingMode: action.streamingMode,
          transcript: action.transcript,
        },
      );
      setActiveSummaryTab(action.videoId, summary.id);
      return;
    }

    if (action.mode === "provider") {
      return;
    }

    if (action.mode === "transcript-review") {
      await reviewTranscript(action.videoId, setupProvider, setupProviderModel);
      return;
    }

    if (action.mode === "transcript-translation") {
      const variant = await translateTranscript({
        videoId: action.videoId,
        provider: setupProvider,
        model: setupProviderModel,
        language: action.language,
      });
      setActiveTranscriptVariantIdsByVideoId((current) => ({
        ...current,
        [action.videoId]: variant.id,
      }));
      return;
    }

    await sendChatAndNotify({
      videoId: action.videoId,
      question: action.question,
      contextMode: action.contextMode,
      provider: setupProvider,
      model: setupProviderModel,
      summaryId: action.summaryId,
      sessionId: action.sessionId,
      streamingMode: action.streamingMode,
    });
  }

  async function setYtDlpAutoUpdate(enabled: boolean) {
    const status = await setYtDlpAutoUpdatePolicy(enabled, 30);
    await refreshSettings();
    setAppNotice(
      enabled
        ? status.lastUpdateError
          ? t("notice.ytdlp.autoUpdate.onFailed")
          : t("notice.ytdlp.autoUpdate.on")
        : t("notice.ytdlp.autoUpdate.off"),
    );
  }

  async function updateYtDlpFromSettings() {
    const status = await updateYtDlpNow();
    await refreshSettings();
    setAppNotice(
      status.lastUpdateError
        ? t("notice.ytdlp.update.failed")
        : t("notice.ytdlp.update.success", {
            version: status.version ? ` to ${status.version}` : "",
          }),
    );
  }

  async function updateAppFromSettings() {
    const result = await updateAppNow();
    await refreshSettings({ checkAppUpdate: true });
    setAppNotice(
      result.installed
        ? t("notice.app.update.installed", { version: result.version })
        : t("notice.app.update.notAvailable"),
    );
  }

  function saveSystemPrompts(settings: SystemPromptSettings) {
    const saved = saveSystemPromptSettings(settings);
    setSystemPromptSettings(saved);
  }

  function saveAiProviderWorkflowPreference(
    workflow: keyof AiProviderPreferences,
    config: AiWorkflowProviderConfig,
  ) {
    setAiProviderPreferences((current) =>
      saveAiProviderPreferences({
        ...current,
        [workflow]: config,
      }),
    );
  }

  function saveAiProviderPreferencesFromSettings(
    preferences: AiProviderPreferences,
  ) {
    setAiProviderPreferences(saveAiProviderPreferences(preferences));
  }

  function saveTtsSettingsFromSettings(settings: TtsSettings) {
    const saved = saveTtsSettings(settings);
    setTtsSettings(saved);
    setTtsModelDraft(saved.modelId);
    setTtsVoiceDraft(saved.voiceStyleId);
    setTtsQwenPresetVoiceDraft(saved.qwenPresetVoiceId);
    setTtsLanguageDraft(saved.languageCode);
  }

  function resetSystemPrompts() {
    const reset = resetSystemPromptSettings();
    setSystemPromptSettings(reset);
    return reset;
  }

  function handleDownloadRecoveryAction(
    job: IngestJob,
    actionKind: DownloadRecoveryActionKind,
  ) {
    if (actionKind === "update-yt-dlp") {
      void updateYtDlpFromSettings();
      return;
    }

    const target = job.originalUri ?? job.title ?? job.sourceKind;

    switch (actionKind) {
      case "provide-cookies":
        setAppNotice(t("notice.downloadRecovery.cookies", { target }));
        return;
      case "open-webview-cookies":
        setAppNotice(t("notice.downloadRecovery.webviewCookies", { target }));
        return;
      case "provide-credentials":
        setAppNotice(t("notice.downloadRecovery.credentials", { target }));
        return;
      case "provide-video-password":
        setAppNotice(t("notice.downloadRecovery.videoPassword", { target }));
        return;
      case "retry-later":
        setAppNotice(t("notice.downloadRecovery.retryLater"));
        return;
      case "change-network":
        setAppNotice(t("notice.downloadRecovery.changeNetwork"));
        return;
      case "check-url":
        setAppNotice(t("notice.downloadRecovery.checkUrl"));
        return;
      case "restart-helper":
        setAppNotice(t("notice.downloadRecovery.restartHelper"));
        return;
    }
  }

  function handleVideoDownloadAccessAction(action: VideoDownloadAccessAction) {
    const notice = describeVideoDownloadAccessAction(action);
    setAppNotice(t(notice.noticeKey, notice.values));
  }

  async function downloadVideoArtifact(
    video: VideoAsset,
    kind: VideoArtifactDownloadKind,
    summaryOverride?: SummaryDocument,
    transcriptOverride?: TranscriptSegment[],
  ) {
    const transcriptForExport =
      kind === "transcription"
        ? (transcriptOverride ??
          (video.id === selectedVideo?.id
            ? selectedTranscript
            : state.transcriptsByVideoId[video.id]))
        : undefined;
    const summaryForExport =
      kind === "summary"
        ? (summaryOverride ??
          (video.id === selectedVideo?.id
            ? activeSummary
            : state.summariesByVideoId[video.id]))
        : undefined;

    try {
      const result = await artifactExportService.exportVideoArtifact({
        video,
        kind,
        transcript: transcriptForExport,
        summary: summaryForExport,
      });

      if (result) {
        setAppNotice({
          message: t("notice.artifactExport.success", {
            path: result.targetPath,
          }),
          action: {
            label: t("notice.open"),
            onClick: async () => {
              try {
                await revealExportedFile(result.targetPath);
                setAppNotice(undefined);
              } catch (error) {
                setAppNotice(
                  t("notice.openLocation.failed", {
                    message: caughtErrorMessage(error, "file_reveal_failed"),
                  }),
                );
              }
            },
          },
        });
      }
    } catch (error) {
      setAppNotice(
        t("notice.artifactExport.failed", {
          message: caughtErrorMessage(error, "artifact_export_failed"),
        }),
      );
    }
  }

  async function readChatMessageWithSupertonic(
    message: ChatMessage,
    renderedText: string,
  ) {
    if (!selectedVideo) return;

    if (chatTtsGenerationRef.current) {
      setAppNotice(t("notice.supertonic.busy"));
      return;
    }

    if (!ttsSettings.hasSelectedVoice) {
      setTtsModelDraft(ttsSettings.modelId);
      setTtsVoiceDraft(ttsSettings.voiceStyleId);
      setTtsQwenPresetVoiceDraft(ttsSettings.qwenPresetVoiceId);
      setTtsLanguageDraft(
        preferredTtsLanguageCode(
          ttsSettings.modelId,
          selectedVideo.language,
          ttsSettings.languageCode,
        ),
      );
      setPendingTtsRead({ video: selectedVideo, message, renderedText });
      return;
    }

    await generateAndPlayChatTts(
      selectedVideo,
      message,
      renderedText,
      ttsSettings.modelId,
      ttsSettings.languageCode,
      ttsSettings.voiceStyleId,
      ttsSettings.qwenPresetVoiceId,
    );
  }

  async function confirmTtsVoiceAndReadMessage() {
    if (!pendingTtsRead) return;

    const readRequest = pendingTtsRead;
    setPendingTtsRead(undefined);

    const saved = saveTtsSettings({
      ...ttsSettings,
      engine: ttsEngineForModel(ttsModelDraft),
      modelId: ttsModelDraft,
      voiceStyleId: ttsVoiceDraft,
      qwenPresetVoiceId: ttsQwenPresetVoiceDraft,
      languageCode: ttsLanguageDraft,
      hasSelectedVoice: true,
    });
    setTtsSettings(saved);

    await generateAndPlayChatTts(
      readRequest.video,
      readRequest.message,
      readRequest.renderedText,
      saved.modelId,
      saved.languageCode,
      saved.voiceStyleId,
      saved.qwenPresetVoiceId,
    );
  }

  async function generateAndPlayChatTts(
    video: VideoAsset,
    message: ChatMessage,
    renderedText: string,
    modelId: TtsModelId,
    languageCode: TtsLanguageCode,
    voiceStyleId: SupertonicVoiceStyleId,
    qwenPresetVoiceId: QwenPresetVoiceId,
  ) {
    if (chatTtsGenerationRef.current) {
      setAppNotice(t("notice.supertonic.busy"));
      return;
    }

    const generation = { videoId: video.id, messageId: message.id };
    chatTtsGenerationRef.current = generation;
    setChatTtsGeneration(generation);

    try {
      const result = await readChatBubbleWithSupertonic({
        video,
        message,
        text: renderedText,
        modelId,
        language: languageCode,
        voiceStyleId,
        qwenPresetVoiceId,
      });
      const voiceMessage = {
        audioPath: result.audioPath,
        generationId: result.generationId,
        voiceName: chatTtsVoiceName(modelId, voiceStyleId, qwenPresetVoiceId),
        sizeBytes: result.sizeBytes,
        createdAtIso: new Date().toISOString(),
      };
      setChatTtsAudioByMessageId((current) => ({
        ...current,
        [message.id]: voiceMessage,
      }));
      updateChatMessageVoiceMessage(video.id, message.id, voiceMessage);
      await playChatTtsAudioUrl(message.id, result.audioUrl);
    } catch (error) {
      setAppNotice(
        t("notice.supertonic.failed", {
          message: caughtErrorMessage(error, "supertonic_tts_failed"),
        }),
      );
    } finally {
      if (chatTtsGenerationRef.current === generation) {
        chatTtsGenerationRef.current = undefined;
        setChatTtsGeneration(undefined);
      }
    }
  }

  async function playChatTtsAudio(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ) {
    try {
      const audioUrl = await resolveChatBubbleSupertonicAudioUrl(audio);
      await playChatTtsAudioUrl(message.id, audioUrl);
    } catch (error) {
      setAppNotice(
        t("notice.supertonic.failed", {
          message: caughtErrorMessage(error, "supertonic_tts_failed"),
        }),
      );
    }
  }

  async function playChatTtsAudioUrl(messageId: string, audioUrl: string) {
    const previous = chatTtsAudioRef.current;
    chatTtsAudioRef.current = null;
    previous?.pause();

    const player = new Audio(audioUrl);
    chatTtsAudioRef.current = player;
    setPlayingChatTtsMessageId(messageId);

    const clearPlaybackState = () => {
      if (chatTtsAudioRef.current === player) {
        setPlayingChatTtsMessageId(undefined);
      }
    };
    player.addEventListener("pause", clearPlaybackState);
    player.addEventListener("ended", clearPlaybackState);

    try {
      await player.play();
    } catch (error) {
      clearPlaybackState();
      throw error;
    }
  }

  function pauseChatTtsAudio() {
    chatTtsAudioRef.current?.pause();
  }

  async function downloadChatTtsAudio(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ) {
    try {
      const result = await artifactExportService.exportLibraryArtifact({
        sourceRelativePath: audio.audioPath,
        defaultFileName: createVoiceMessageDownloadFileName(audio, {
          text: message.content,
          voiceName: audio.voiceName,
        }),
        label: "voice message",
        filters: [{ name: "Audio", extensions: ["wav"] }],
      });
      if (result) {
        setAppNotice({
          message: t("notice.artifactExport.success", {
            path: result.targetPath,
          }),
          action: {
            label: t("notice.open"),
            onClick: async () => {
              try {
                await revealExportedFile(result.targetPath);
                setAppNotice(undefined);
              } catch (error) {
                setAppNotice(
                  t("notice.openLocation.failed", {
                    message: caughtErrorMessage(error, "file_reveal_failed"),
                  }),
                );
              }
            },
          },
        });
      }
    } catch (error) {
      setAppNotice(
        t("notice.artifactExport.failed", {
          message: caughtErrorMessage(error, "artifact_export_failed"),
        }),
      );
    }
  }

  async function generatePodcastFromWorkbench(request: {
    mode: PodcastOutputMode;
    sourceKind: PodcastSourceKind;
    lengthMode: PodcastLengthMode;
    outputLanguage?: string;
    speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig];
    languageCode: TtsLanguageCode;
  }) {
    if (!selectedVideo) return;

    try {
      const podcast = await generatePodcast({
        videoId: selectedVideo.id,
        provider: aiProviderPreferences.summary.provider,
        model: aiProviderPreferences.summary.model,
        mode: request.mode,
        sourceKind: request.sourceKind,
        lengthMode: request.lengthMode,
        outputLanguage: request.outputLanguage,
        speakers: request.speakers,
        tts: {
          modelId: "Supertone/supertonic-3",
          languageCode: request.languageCode,
          speakers: request.speakers,
        },
        transcript: renderedTranscriptForSelectedVideo(),
        transcriptVariantId:
          activeTranscriptVariantId === "original"
            ? undefined
            : activeTranscriptVariantId,
        summaryId: activeSummary?.id,
      });
      await playPodcast(podcast);
    } catch (error) {
      setAppNotice(
        t("notice.supertonic.failed", {
          message: caughtErrorMessage(error, "podcast_generation_failed"),
        }),
      );
    }
  }

  function renderedTranscriptForSelectedVideo() {
    const activeVariant = selectedTranscriptVariants.find(
      (variant) => variant.id === activeTranscriptVariantId,
    );
    return activeVariant?.segments ?? selectedTranscript;
  }

  async function playPodcast(podcast: PodcastDocument) {
    try {
      pauseVideo(podcast.sourceAssetId);
      const previous = podcastAudioRef.current;
      podcastAudioRef.current = null;
      previous?.pause();

      const audioUrl = await resolvePodcastAudioUrl(podcast);
      const player = new Audio(audioUrl);
      podcastAudioRef.current = player;
      await player.play();
    } catch (error) {
      setAppNotice(
        t("notice.supertonic.failed", {
          message: caughtErrorMessage(error, "podcast_playback_failed"),
        }),
      );
    }
  }

  async function downloadPodcastAudio(podcast: PodcastDocument) {
    await exportPodcastArtifact({
      sourceRelativePath: podcast.artifacts.podcastAudioPath,
      defaultFileName: createPodcastDownloadFileName(podcast),
      label: "podcast audio",
      filters: [{ name: "Audio", extensions: ["wav"] }],
    });
  }

  async function downloadPodcastScript(podcast: PodcastDocument) {
    await exportPodcastArtifact({
      sourceRelativePath: podcast.artifacts.scriptPath,
      defaultFileName: `${podcast.id}.md`,
      label: "podcast script",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
  }

  async function exportPodcastArtifact(request: {
    sourceRelativePath: string;
    defaultFileName: string;
    label: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }) {
    try {
      const result = await artifactExportService.exportLibraryArtifact(request);
      if (result) {
        setAppNotice({
          message: t("notice.artifactExport.success", {
            path: result.targetPath,
          }),
          action: {
            label: t("notice.open"),
            onClick: async () => {
              await revealExportedFile(result.targetPath);
              setAppNotice(undefined);
            },
          },
        });
      }
    } catch (error) {
      setAppNotice(
        t("notice.artifactExport.failed", {
          message: caughtErrorMessage(error, "artifact_export_failed"),
        }),
      );
    }
  }

  async function removePodcast(podcast: PodcastDocument) {
    if (!selectedVideo) return;

    try {
      await deletePodcastTts(selectedVideo, podcast.id);
      deletePodcast(selectedVideo.id, podcast.id);
    } catch (error) {
      setAppNotice(
        t("notice.supertonic.failed", {
          message: caughtErrorMessage(error, "podcast_delete_failed"),
        }),
      );
    }
  }

  function showView(nextView: typeof state.activeView) {
    if (!onboardingComplete && nextView !== "onboarding") {
      setActiveView("onboarding");
      syncPathForView("onboarding");
      return;
    }

    if (nextView === "workbench" && selectedVideo) {
      openVideoTab(selectedVideo.id);
    }

    if (
      nextView === "workbench" &&
      state.activeView !== "workbench" &&
      playbackState.activeVideoId &&
      playbackState.status !== "idle"
    ) {
      openPictureInPicture(playbackState.activeVideoId, {
        preserveStatus: true,
      });
    }

    setActiveView(nextView);
    syncPathForView(nextView);
  }

  function showOnboarding() {
    setActiveView("onboarding");
    syncPathForView("onboarding");
  }

  function finishOnboarding() {
    writeOnboardingComplete(true);
    setOnboardingComplete(true);
    setActiveView("finder");
    syncPathForView("finder", "replace");
  }

  function openVideoDetail(videoId: string) {
    openVideoTab(videoId);
    setSelectedVideoId(videoId);

    if (
      playbackState.activeVideoId === videoId &&
      playbackState.status !== "idle"
    ) {
      openPictureInPicture(videoId, { preserveStatus: true });
    }

    setActiveView("workbench");
    syncPathForView("workbench");
  }

  function openVideoTab(videoId: string) {
    setOpenWorkbenchVideoIds((current) =>
      current.includes(videoId) ? current : [...current, videoId],
    );
  }

  function closeVideoTab(videoId: string) {
    const nextTabs = openWorkbenchVideoIds.filter(
      (candidate) => candidate !== videoId,
    );
    setOpenWorkbenchVideoIds(nextTabs);

    if (state.selectedVideoId === videoId) {
      const nextSelectedVideoId =
        nextTabs[nextTabs.length - 1] ??
        state.videos.find((video) => video.id !== videoId)?.id;
      setSelectedVideoId(nextSelectedVideoId);
    }
  }

  function setActiveSummaryTab(videoId: string, summaryId: string) {
    setActiveSummaryIdsByVideoId((current) => ({
      ...current,
      [videoId]: summaryId,
    }));
  }

  function setActiveTranscriptVariant(videoId: string, variantId: string) {
    setActiveTranscriptVariantIdsByVideoId((current) => ({
      ...current,
      [videoId]: variantId,
    }));
  }

  function openTranscriptOverlayForSelectedVideo() {
    if (!selectedVideo) return;

    const activeVariant = selectedTranscriptVariants.find(
      (variant) => variant.id === activeTranscriptVariantId,
    );
    const renderedTranscript = activeVariant?.segments ?? selectedTranscript;
    const segment = findSegmentForTime(
      renderedTranscript,
      playbackState.currentTimeSeconds,
    );

    setTranscriptOverlayVideoId(selectedVideo.id);
    lastOverlaySegmentKeyRef.current = undefined;
    void showTranscriptOverlay(
      createTranscriptOverlayPayload({
        video: selectedVideo,
        segment,
        timestamp: formatTimestamp(playbackState.currentTimeSeconds),
      }),
    );
  }

  function focusFinderSearch() {
    if (!onboardingComplete) {
      setActiveView("onboarding");
      syncPathForView("onboarding");
      return;
    }

    setActiveView("finder");
    syncPathForView("finder");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById("video-library-search")?.focus();
      });
    });
  }

  function openAddVideoDialog() {
    setAddVideoPlaylistId(
      state.activeView === "playlists" ? selectedPlaylistId : undefined,
    );
    setIsAddVideoDialogOpen(true);
  }

  async function importLocalFileFromAddDialog(sourcePath: string) {
    const result = await importLocalFile({ sourcePath });
    attachImportResultToPlaylist(result);
    return result;
  }

  async function importDroppedFiles(paths: string[]) {
    const filePaths = paths.filter(Boolean);
    if (filePaths.length === 0) return;

    const supported = filePaths
      .filter((path) => isSupportedLocalMediaFile(fileNameFromPath(path)))
      .map((path) => ({
        path,
        sourceType: mediaSourceTypeFromFileName(fileNameFromPath(path)),
      }));
    const unsupportedCount = filePaths.length - supported.length;

    if (unsupportedCount > 0) {
      setAppNotice(
        t("notice.drop.unsupported", {
          count: unsupportedCount,
        }),
      );
    }

    if (supported.length === 0) return;

    for (const file of supported) {
      await importLocalFile({
        sourcePath: file.path,
        sourceType: file.sourceType,
      });
    }

    setActiveView("finder");
    syncPathForView("finder");

    const importedNonVideo = supported.find(
      (file) => file.sourceType === "audio" || file.sourceType === "pdf",
    );
    if (importedNonVideo) {
      setAppNotice(
        t("notice.drop.importedNonVideo", {
          kind: mediaSourceTypeLabel(importedNonVideo.sourceType, t),
        }),
      );
    }
  }

  async function importYoutubeUrlFromAddDialog(url: string) {
    const result = await importYoutubeUrl({ url });
    attachImportResultToPlaylist(result);
    return result;
  }

  async function changePlaylistCover(playlistId: string, sourcePath: string) {
    try {
      const result = await playlistCoverService.importCover(
        playlistId,
        sourcePath,
      );
      setPlaylistCover(playlistId, result.libraryRelativePath);
    } catch (error) {
      setAppNotice({
        message: `${t("playlist.cover.failed")} ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      throw error;
    }
  }

  function attachImportResultToPlaylist(result: unknown) {
    if (!addVideoPlaylistId) return;

    const importedVideoId = videoIdFromImportResult(result);
    if (importedVideoId) {
      addPlaylistVideo(addVideoPlaylistId, importedVideoId);
      return;
    }

    const jobId = jobIdFromImportResult(result);
    if (jobId) {
      setPlaylistImportJobTargets((current) => ({
        ...current,
        [jobId]: addVideoPlaylistId,
      }));
    }
  }

  const captionDialogWhisperModel = selectPreferredSttModel(
    sttModels,
    captionLanguageDialog?.whisperModelId ?? selectedWhisperModel?.id,
  );

  return (
    <AppLayout
      activeView={state.activeView}
      pageTitle={pageTitle}
      headerContent={headerContent}
      onActiveViewChange={showView}
      onSearchShortcut={focusFinderSearch}
      onAddVideoShortcut={openAddVideoDialog}
    >
      <div
        className={cn(
          "h-full",
          state.activeView === "finder" ? "block" : "hidden",
        )}
      >
        <FinderView
          videos={state.videos}
          ingestJobs={state.ingestJobs}
          transcriptsByVideoId={state.transcriptsByVideoId}
          summariesByVideoId={state.summariesByVideoId}
          selectedVideoId={state.selectedVideoId}
          query={finderQuery}
          onQueryChange={setFinderQuery}
          onImportLocalFile={(sourcePath) => importLocalFile({ sourcePath })}
          onImportYoutubeUrl={(url) => importYoutubeUrl({ url })}
          onCancelIngestJob={cancelIngestJob}
          onRemoveFailedIngestJob={removeFailedIngestJob}
          onDownloadRecoveryAction={handleDownloadRecoveryAction}
          onRenameVideoTitle={renameVideoTitle}
          onDeleteVideo={deleteVideo}
          onDownloadArtifact={(video, kind, transcript) => {
            void downloadVideoArtifact(video, kind, undefined, transcript);
          }}
          onOpenTutorial={() => showView("tutorial")}
          onAddVideo={openAddVideoDialog}
          onPlayVideo={(videoId) => {
            setSelectedVideoId(videoId);
            playVideo(videoId);
          }}
          onOpenVideo={openVideoDetail}
        />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "workbench" ? "block" : "hidden",
        )}
      >
        <WorkbenchView
          video={selectedVideo}
          openVideos={openWorkbenchVideos}
          activeVideoId={state.selectedVideoId}
          transcript={selectedTranscript}
          transcriptVariants={selectedTranscriptVariants}
          activeTranscriptVariantId={activeTranscriptVariantId}
          transcriptJob={selectedTranscriptJob}
          summary={activeSummary}
          summaries={selectedSummaryHistory}
          activeSummaryId={activeSummary?.id}
          summaryJob={selectedSummaryJob}
          chatJob={selectedChatJob}
          podcast={selectedPodcast}
          podcastHistory={selectedPodcastHistory}
          podcastJob={selectedPodcastJob}
          podcastAudioUrl={selectedPodcastAudioUrl}
          chatMessages={selectedChatMessages}
          onAddVideo={openAddVideoDialog}
          onSelectVideoTab={setSelectedVideoId}
          onCloseVideoTab={closeVideoTab}
          onSelectSummaryTab={(summaryId) =>
            selectedVideo
              ? setActiveSummaryTab(selectedVideo.id, summaryId)
              : undefined
          }
          playbackState={playbackState}
          isInlinePlayerSuppressed={miniPlayerVisible}
          onPlayVideo={playVideo}
          onPauseVideo={pauseVideo}
          onVideoTimeUpdate={updateVideoTime}
          onVideoEnded={stopVideo}
          onOpenPictureInPicture={openPictureInPicture}
          onExtractTranscript={() =>
            selectedVideo
              ? extractTranscriptWithSetup(selectedVideo.id)
              : Promise.resolve()
          }
          onSelectTranscriptVariant={(variantId) => {
            if (!selectedVideo) return;
            setActiveTranscriptVariant(selectedVideo.id, variantId);
          }}
          onReviewTranscript={(provider, model) =>
            selectedVideo
              ? reviewTranscriptWithSetup(selectedVideo.id, provider, model)
              : Promise.resolve()
          }
          onTranslateTranscript={(provider, model, language) =>
            selectedVideo
              ? translateTranscriptWithSetup({
                  videoId: selectedVideo.id,
                  provider,
                  model,
                  language,
                })
              : Promise.resolve()
          }
          onOpenTranscriptOverlay={openTranscriptOverlayForSelectedVideo}
          onGenerateSummary={(
            provider,
            model,
            templateId,
            lengthMode,
            outputLanguage,
            streamingMode,
            transcript,
          ) =>
            selectedVideo
              ? generateSummaryWithSetup(
                  selectedVideo.id,
                  provider,
                  model,
                  templateId,
                  lengthMode,
                  outputLanguage,
                  streamingMode,
                  transcript,
                )
              : Promise.resolve()
          }
          onSendChat={(request) =>
            selectedVideo
              ? sendChatWithSetup({
                  videoId: selectedVideo.id,
                  ...request,
                })
              : Promise.resolve([])
          }
          onReadChatMessage={readChatMessageWithSupertonic}
          onGeneratePodcast={generatePodcastFromWorkbench}
          onPlayPodcast={playPodcast}
          onDownloadPodcastAudio={downloadPodcastAudio}
          onDownloadPodcastScript={downloadPodcastScript}
          onDeletePodcast={removePodcast}
          isVoiceCloneModeEnabled={isVoiceCloneModeEnabled}
          chatTtsAudioByMessageId={chatTtsAudioByMessageId}
          generatingChatTtsMessageId={
            chatTtsGeneration && chatTtsGeneration.videoId === selectedVideo?.id
              ? chatTtsGeneration.messageId
              : undefined
          }
          playingChatTtsMessageId={playingChatTtsMessageId}
          onPlayChatTtsAudio={(message, audio) =>
            playChatTtsAudio(message, audio)
          }
          onPauseChatTtsAudio={pauseChatTtsAudio}
          onDownloadChatTtsAudio={downloadChatTtsAudio}
          onResetChat={() => {
            if (selectedVideo) resetChatSession(selectedVideo.id);
          }}
          summaryProvider={aiProviderPreferences.summary.provider}
          summaryProviderModel={aiProviderPreferences.summary.model}
          summaryStreamingMode={aiProviderPreferences.summary.streamingMode}
          chatProvider={aiProviderPreferences.chat.provider}
          chatProviderModel={aiProviderPreferences.chat.model}
          chatStreamingMode={aiProviderPreferences.chat.streamingMode}
          onSummaryProviderPreferenceChange={(config) =>
            saveAiProviderWorkflowPreference("summary", config)
          }
          onChatProviderPreferenceChange={(config) =>
            saveAiProviderWorkflowPreference("chat", config)
          }
          onSaveMarkdown={(summaryId) =>
            selectedVideo
              ? downloadVideoArtifact(
                  selectedVideo,
                  "summary",
                  findActiveSummary(
                    selectedSummaryHistory,
                    summaryId ?? activeSummary?.id,
                  ) ?? activeSummary,
                )
              : undefined
          }
          onUpdateTranscriptSegment={(segmentId, text) => {
            if (!selectedVideo) return;
            updateTranscriptSegment(selectedVideo.id, segmentId, text);
          }}
          onUpdateSummaryMarkdown={(summaryId, markdown) => {
            if (!selectedVideo) return;
            updateSummaryMarkdown(selectedVideo.id, summaryId, markdown);
          }}
        />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "playlists" ? "block" : "hidden",
        )}
      >
        <PlaylistView
          playlists={state.playlists}
          videos={state.videos}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          onBackToPlaylists={() => setSelectedPlaylistId(undefined)}
          onCreatePlaylist={createPlaylist}
          onRenamePlaylist={renamePlaylist}
          onChangePlaylistCover={changePlaylistCover}
          onAddExistingVideo={addPlaylistVideo}
          onOpenAddVideoDialog={(playlistId) => {
            setAddVideoPlaylistId(playlistId);
            setIsAddVideoDialogOpen(true);
          }}
          onImportLocalFile={importLocalFileFromAddDialog}
          onImportYoutubeUrl={importYoutubeUrlFromAddDialog}
          onReorderVideo={reorderPlaylistVideo}
          onOpenVideo={openVideoDetail}
        />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "voices" ? "block" : "hidden",
        )}
      >
        <VoicesView />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "settings" ? "block" : "hidden",
        )}
      >
        <SettingsView
          settings={effectiveSettings}
          errorMessage={settingsErrorMessage}
          onUpdateAppNow={updateAppFromSettings}
          onSetYtDlpAutoUpdate={setYtDlpAutoUpdate}
          onUpdateYtDlpNow={updateYtDlpFromSettings}
          onVideoDownloadAccessAction={handleVideoDownloadAccessAction}
          onOpenOnboarding={showOnboarding}
          onOpenTutorial={() => showView("tutorial")}
          onOpenFaq={() => showView("faq")}
          onConfigureProvider={configureProvider}
          appTheme={appTheme}
          onThemeChange={changeAppTheme}
          appColorSeed={appColorSeed}
          onColorSeedChange={changeAppColorSeed}
          aiProviderPreferences={aiProviderPreferences}
          onAiProviderPreferencesChange={saveAiProviderPreferencesFromSettings}
          ttsSettings={ttsSettings}
          onTtsSettingsChange={saveTtsSettingsFromSettings}
          systemPromptSettings={systemPromptSettings}
          onSaveSystemPrompts={saveSystemPrompts}
          onResetSystemPrompts={resetSystemPrompts}
          onRefreshStorage={async () => {
            await refreshSettings();
          }}
        />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "tutorial" ? "block" : "hidden",
        )}
      >
        <TutorialView onOpenOnboarding={showOnboarding} />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "faq" ? "block" : "hidden",
        )}
      >
        <FaqView />
      </div>
      <div
        className={cn(
          "h-full",
          state.activeView === "onboarding" ? "block" : "hidden",
        )}
      >
        <OnboardingView
          appColorSeed={appColorSeed}
          onColorSeedChange={changeAppColorSeed}
          onFinish={finishOnboarding}
        />
      </div>
      {isDraggingFiles ? (
        <div className="border-primary/70 bg-background/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 backdrop-blur-sm">
          <div className="border-border bg-card rounded-md border px-5 py-3 text-sm font-medium shadow-lg">
            {t("drop.files")}
          </div>
        </div>
      ) : null}
      {appNotice ? (
        <div
          role="status"
          className="border-border bg-card fixed top-20 right-6 z-50 max-w-sm rounded-md border px-4 py-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <span>
              {typeof appNotice === "string" ? appNotice : appNotice.message}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {typeof appNotice !== "string" && appNotice.action ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    void appNotice.action?.onClick();
                  }}
                >
                  {appNotice.action.label}
                </Button>
              ) : null}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("notice.dismiss")}
                onClick={() => setAppNotice(undefined)}
              >
                x
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {miniPlayerVisible && activePlaybackMedia ? (
        <FloatingMiniPlayer
          media={activePlaybackMedia}
          corner={playbackState.miniPlayerCorner}
          position={playbackState.miniPlayerPosition}
          activeMediaId={playbackState.activeVideoId}
          isPlaying={playbackState.status === "playing"}
          currentTimeSeconds={playbackState.currentTimeSeconds}
          onPositionChange={moveMiniPlayer}
          onPlay={playVideo}
          onPause={pauseVideo}
          onTimeUpdate={updateVideoTime}
          onEnded={stopVideo}
          onOpenWorkbench={() => {
            openVideoTab(activePlaybackMedia.id);
            setSelectedVideoId(activePlaybackMedia.id);
            setActiveView("workbench");
            syncPathForView("workbench");
          }}
          onClose={stopVideo}
        />
      ) : null}
      <Dialog
        open={Boolean(pendingTtsRead)}
        onOpenChange={(open) => {
          if (!open) setPendingTtsRead(undefined);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.tts.firstRunTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.tts.firstRunDescription")}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm" htmlFor="first-read-tts-model">
            <span className="font-medium">{t("settings.tts.model")}</span>
            <select
              id="first-read-tts-model"
              value={ttsModelDraft}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                const modelId = event.target.value as TtsModelId;
                setTtsModelDraft(modelId);
                setTtsLanguageDraft(defaultLanguageForModel(modelId));
              }}
            >
              {localTtsModelCards.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm" htmlFor="first-read-tts-voice">
            <span className="font-medium">{t("settings.tts.voice")}</span>
            <select
              id="first-read-tts-voice"
              value={
                ttsEngineForModel(ttsModelDraft) === "qwen"
                  ? ttsQwenPresetVoiceDraft
                  : ttsVoiceDraft
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                if (ttsEngineForModel(ttsModelDraft) === "qwen") {
                  setTtsQwenPresetVoiceDraft(event.target.value as QwenPresetVoiceId);
                } else {
                  setTtsVoiceDraft(event.target.value as SupertonicVoiceStyleId);
                }
              }}
            >
              {ttsEngineForModel(ttsModelDraft) === "qwen"
                ? qwenPresetVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))
                : supertonicPresetVoiceStyles.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {supertonicPresetVoiceStyleLabel(voice.id)}
                    </option>
                  ))}
            </select>
          </label>
          <label
            className="grid gap-2 text-sm"
            htmlFor="first-read-tts-language"
          >
            <span className="font-medium">{t("settings.tts.language")}</span>
            <select
              id="first-read-tts-language"
              value={ttsLanguageDraft}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                setTtsLanguageDraft(event.target.value as TtsLanguageCode)
              }
            >
              {synthesisLanguagesForModel(ttsModelDraft).map((language) => (
                <option key={language.code} value={language.code}>
                  {ttsLanguageLabel(ttsModelDraft, language.code)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingTtsRead(undefined)}
            >
              {t("settings.tts.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void confirmTtsVoiceAndReadMessage();
              }}
            >
              {t("settings.tts.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <CaptionLanguageDialog
        open={Boolean(captionLanguageDialog)}
        languages={captionLanguageDialog?.languages ?? []}
        captionStatus={captionLanguageDialog?.captionStatus ?? "loading"}
        providerLabel={captionLanguageDialog?.providerLabel ?? "Provider"}
        whisperStatus={captionLanguageDialog?.whisperStatus ?? "idle"}
        whisperDownloadProgressPercent={
          captionLanguageDialog?.whisperDownloadProgressPercent ?? 0
        }
        whisperErrorMessage={captionLanguageDialog?.whisperErrorMessage}
        whisperModels={sttModels}
        whisperModelId={captionDialogWhisperModel?.id}
        whisperModelName={
          captionDialogWhisperModel?.name ??
          captionLanguageDialog?.whisperModelName
        }
        onClose={() => setCaptionLanguageDialog(undefined)}
        onWhisperModelChange={(modelId) => {
          setSelectedWhisperModelId(modelId);
          setCaptionLanguageDialog((current) => {
            if (!current) return current;

            const model = effectiveSettings?.stt.models.find(
              (candidate) => candidate.id === modelId,
            );
            const { whisperModelPath: _previousModelPath, ...dialog } = current;

            return {
              ...dialog,
              whisperStatus: "idle",
              whisperDownloadProgressPercent: 0,
              whisperErrorMessage: undefined,
              whisperModelId: modelId,
              whisperModelName: model?.name,
              ...(model?.downloaded
                ? { whisperModelPath: whisperModelPath(model) }
                : {}),
            };
          });
        }}
        onTranscribe={(language) => {
          void extractTranscriptWithWhisper(language);
        }}
        onSelect={(language) => {
          void extractTranscriptWithCaptionLanguage(language);
        }}
      />
      <AddVideoDialog
        open={isAddVideoDialogOpen}
        onOpenChange={setIsAddVideoDialogOpen}
        playlist={state.playlists.find(
          (playlist) => playlist.id === addVideoPlaylistId,
        )}
        videos={state.videos}
        onAddExistingVideo={addPlaylistVideo}
        onImportLocalFile={importLocalFileFromAddDialog}
        onImportYoutubeUrl={importYoutubeUrlFromAddDialog}
      />
      <SetupDialog
        open={Boolean(pendingAction)}
        mode={setupMode}
        settings={effectiveSettings}
        selectedWhisperModelId={selectedWhisperModelId}
        provider={setupProvider}
        providerModel={setupProviderModel}
        onClose={() => setPendingAction(undefined)}
        onWhisperModelChange={setSelectedWhisperModelId}
        onProviderChange={(provider) => {
          setSetupProvider(provider);
          setSetupProviderModel(defaultProviderModels[provider]);
        }}
        onProviderModelChange={setSetupProviderModel}
        onDownloadWhisperModel={async (modelId, options) => {
          await setupService.downloadWhisperModel(modelId, options);
          setDownloadedWhisperModelIds((current) =>
            current.includes(modelId) ? current : [...current, modelId],
          );
          await refreshSettings();
        }}
        onSaveProviderApiKey={async (provider, apiKey) => {
          await setupService.saveProviderApiKey(provider, apiKey);
          setConfiguredProviderIds((current) =>
            current.includes(provider) ? current : [...current, provider],
          );
          await refreshSettings();
        }}
        onContinue={continuePendingAction}
      />
    </AppLayout>
  );
}

function FinderSearchInput({
  searchText,
  onSearchTextChange,
}: {
  searchText?: string;
  onSearchTextChange(searchText: string | undefined): void;
}) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState(searchText ?? "");
  const debouncedInputValue = useDebouncedValue(inputValue, 180);

  useEffect(() => {
    setInputValue((current) => {
      const nextSearchText = searchText ?? "";
      return current.trim() === nextSearchText ? current : nextSearchText;
    });
  }, [searchText]);

  useEffect(() => {
    onSearchTextChange(debouncedInputValue.trim() || undefined);
  }, [debouncedInputValue, onSearchTextChange]);

  return (
    <Input
      id="video-library-search"
      value={inputValue}
      onChange={(event) => setInputValue(event.target.value)}
      placeholder={t("finder.search.placeholder")}
      className="pl-9"
    />
  );
}

function preferredTtsLanguageCode(
  modelId: TtsModelId,
  videoLanguageCode: string | undefined,
  fallbackLanguageCode: TtsLanguageCode,
) {
  return videoLanguageCode &&
    isSynthesisLanguageSupportedByModel(modelId, videoLanguageCode)
    ? (videoLanguageCode as TtsLanguageCode)
    : fallbackLanguageCode;
}

function ttsLanguageLabel(modelId: TtsModelId, languageCode: string) {
  const language = synthesisLanguagesForModel(modelId).find(
    (candidate) => candidate.code === languageCode,
  );
  return language ? `${language.label} (${language.code})` : languageCode;
}

function pageTitleForView(
  activeView: string,
  selectedVideoTitle: string | undefined,
  videoTitle: string,
  playlistsTitle: string,
  settingsTitle: string,
  voicesTitle: string,
  tutorialTitle: string,
  faqTitle: string,
  onboardingTitle: string,
) {
  if (activeView === "onboarding") return onboardingTitle;
  if (activeView === "faq") return faqTitle;
  if (activeView === "tutorial") return tutorialTitle;
  if (activeView === "settings") return settingsTitle;
  if (activeView === "voices") return voicesTitle;
  if (activeView === "workbench") return selectedVideoTitle ?? videoTitle;
  if (activeView === "playlists") return playlistsTitle;
  return videoTitle;
}

function mediaSourceTypeLabel(
  sourceType: MediaSourceType,
  t: (key: TranslationKey) => string,
) {
  switch (sourceType) {
    case "audio":
      return t("finder.mediaType.audio");
    case "pdf":
      return t("finder.mediaType.pdf");
    case "video":
      return t("finder.mediaType.video");
  }
}

function fileNameFromPath(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function LibraryInfoMenu({
  onOpenTutorial,
  onOpenFaq,
}: {
  onOpenTutorial(): void;
  onOpenFaq(): void;
}) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("library.info.menu")}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-40">
        <DropdownMenuItem onSelect={onOpenTutorial}>
          {t("library.info.tutorial")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenFaq}>
          {t("library.info.faq")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OriginalVideoLinkMenu({ video }: { video: VideoAsset }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const providerLabel = providerLabelForWebUrl(video.originalUri);

  if (!providerLabel) return null;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("workbench.openOriginalUrl", {
            title: video.title,
          })}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => {
            setMenuOpen(false);
            void openExternalWebUrl(video.originalUri);
          }}
        >
          {t("workbench.link.openProvider", { provider: providerLabel })}
        </DropdownMenuItem>
        <CopyDropdownMenuItem
          value={video.originalUri}
          onCopied={() => setMenuOpen(false)}
        >
          {t("workbench.link.copyLink")}
        </CopyDropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CaptionLanguageDialog({
  open,
  languages,
  captionStatus,
  providerLabel,
  whisperStatus,
  whisperDownloadProgressPercent,
  whisperErrorMessage,
  whisperModels,
  whisperModelId,
  whisperModelName,
  onClose,
  onWhisperModelChange,
  onTranscribe,
  onSelect,
}: {
  open: boolean;
  languages: CaptionLanguage[];
  captionStatus: "loading" | "ready" | "failed";
  providerLabel: string;
  whisperStatus: "idle" | "downloading" | "preparing" | "failed";
  whisperDownloadProgressPercent: number;
  whisperErrorMessage?: string;
  whisperModels: SettingsSnapshot["stt"]["models"];
  whisperModelId?: string;
  whisperModelName?: string;
  onClose(): void;
  onWhisperModelChange(modelId: string): void;
  onTranscribe(language: TranscriptionLanguageCode): void;
  onSelect(language: CaptionLanguage): void;
}) {
  const { t } = useI18n();
  const [selectedLanguageKey, setSelectedLanguageKey] = useState<
    string | undefined
  >();
  const [selectedWhisperLanguage, setSelectedWhisperLanguage] =
    useState<TranscriptionLanguageCode>("auto");
  const [activeTab, setActiveTab] = useState<"transcribe" | "provider">(
    "transcribe",
  );
  const [showWhisperModelSelect, setShowWhisperModelSelect] = useState(false);
  const transcriptionLanguageOptions = useMemo(
    () => transcriptionLanguagesForModel(whisperModelId),
    [whisperModelId],
  );

  useEffect(() => {
    setSelectedLanguageKey(
      languages[0] ? languageKey(languages[0]) : undefined,
    );
  }, [languages, open]);

  useEffect(() => {
    if (open) {
      setActiveTab("transcribe");
      setShowWhisperModelSelect(false);
    }
  }, [open]);

  useEffect(() => {
    if (
      !transcriptionLanguageOptions.some(
        (language) => language.code === selectedWhisperLanguage,
      )
    ) {
      setSelectedWhisperLanguage("auto");
    }
  }, [selectedWhisperLanguage, transcriptionLanguageOptions]);

  const selectedLanguage = languages.find(
    (language) => languageKey(language) === selectedLanguageKey,
  );
  const whisperBusy =
    whisperStatus === "downloading" || whisperStatus === "preparing";
  const selectedWhisperModel = whisperModels.find(
    (model) => model.id === whisperModelId,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("transcript.languageDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("transcript.languageDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div
          role="tablist"
          aria-label={t("transcript.languageDialog.title")}
          className="bg-muted grid grid-cols-2 rounded-md p-1"
        >
          <Button
            type="button"
            variant={activeTab === "transcribe" ? "secondary" : "ghost"}
            className="h-8"
            role="tab"
            aria-selected={activeTab === "transcribe"}
            onClick={() => setActiveTab("transcribe")}
          >
            {t("transcript.languageDialog.transcribeTab")}
          </Button>
          <Button
            type="button"
            variant={activeTab === "provider" ? "secondary" : "ghost"}
            className="h-8"
            role="tab"
            aria-selected={activeTab === "provider"}
            onClick={() => setActiveTab("provider")}
          >
            {t("transcript.languageDialog.providerTab", {
              provider: providerLabel,
            })}
          </Button>
        </div>
        {activeTab === "transcribe" ? (
          <div className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  {t("transcript.languageDialog.whisperModel")}
                </div>
                <div className="text-muted-foreground mt-1 text-sm">
                  {whisperModelName ??
                    t("transcript.languageDialog.whisperUnavailable")}
                </div>
                <WhisperModelStatus
                  status={whisperStatus}
                  progressPercent={whisperDownloadProgressPercent}
                  errorMessage={whisperErrorMessage}
                  needsDownload={Boolean(
                    selectedWhisperModel && !selectedWhisperModel.downloaded,
                  )}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={whisperBusy}
                onClick={() => setShowWhisperModelSelect((current) => !current)}
              >
                {t("transcript.languageDialog.changeModel")}
              </Button>
            </div>
            {showWhisperModelSelect ? (
              <div className="mt-3">
                <Select
                  value={whisperModelId}
                  onValueChange={onWhisperModelChange}
                  disabled={whisperBusy}
                >
                  <SelectTrigger
                    aria-label={t("transcript.languageDialog.whisperModel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {whisperModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {whisperModelOptionLabel(model, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="mt-3 grid gap-1.5">
              <div className="text-sm font-medium">
                {t("transcript.languageDialog.whisperLanguage")}
              </div>
              <Select
                value={selectedWhisperLanguage}
                onValueChange={(value) =>
                  setSelectedWhisperLanguage(value as TranscriptionLanguageCode)
                }
                disabled={whisperBusy}
              >
                <SelectTrigger
                  aria-label={t("transcript.languageDialog.whisperLanguage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transcriptionLanguageOptions.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.code === "auto"
                        ? t("transcript.languageDialog.whisperAuto")
                        : language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {captionStatus === "loading" ? (
              <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("transcript.languageDialog.providerLoading")}
              </div>
            ) : null}
            {captionStatus === "failed" ? (
              <div className="text-muted-foreground rounded-md border p-3 text-sm">
                {t("transcript.languageDialog.providerFailed")}
              </div>
            ) : null}
            {captionStatus === "ready" && languages.length === 0 ? (
              <div className="text-muted-foreground rounded-md border p-3 text-sm">
                {t("transcript.languageDialog.providerEmpty")}
              </div>
            ) : null}
            {languages.length > 0 ? (
              <Select
                value={selectedLanguageKey}
                onValueChange={setSelectedLanguageKey}
              >
                <SelectTrigger
                  aria-label={t("transcript.languageDialog.providerLanguage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((language) => (
                    <SelectItem
                      key={languageKey(language)}
                      value={languageKey(language)}
                    >
                      {languageOptionLabel(language, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("transcript.languageDialog.cancel")}
          </Button>
          {activeTab === "transcribe" ? (
            <Button
              type="button"
              disabled={whisperBusy}
              onClick={() => onTranscribe(selectedWhisperLanguage)}
            >
              {t("transcript.languageDialog.transcribeTab")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!selectedLanguage}
              onClick={() => {
                if (selectedLanguage) onSelect(selectedLanguage);
              }}
            >
              {t("transcript.languageDialog.useProvider", {
                provider: providerLabel,
              })}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WhisperModelStatus({
  status,
  progressPercent,
  errorMessage,
  needsDownload,
}: {
  status: "idle" | "downloading" | "preparing" | "failed";
  progressPercent: number;
  errorMessage?: string;
  needsDownload: boolean;
}) {
  const { t } = useI18n();
  const showPercent = progressPercent > 0;
  const progressWidth = showPercent
    ? `${Math.max(2, Math.min(progressPercent, 100))}%`
    : "100%";

  if (status === "downloading") {
    return (
      <div className="text-muted-foreground mt-2 text-xs">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t("transcript.languageDialog.whisperDownloading")}
          </span>
          {showPercent ? <span>{progressPercent}%</span> : null}
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className={cn("bg-primary h-full", !showPercent && "animate-pulse")}
            style={{ width: progressWidth }}
          />
        </div>
      </div>
    );
  }

  if (status === "preparing") {
    return (
      <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t("transcript.languageDialog.whisperPreparing")}
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="text-destructive mt-2 text-xs">
        {errorMessage ?? t("transcript.languageDialog.whisperFailed")}
      </div>
    );
  }

  if (needsDownload) {
    return (
      <div className="text-muted-foreground mt-2 text-xs">
        {t("transcript.languageDialog.whisperDownloadNeeded")}
      </div>
    );
  }

  return null;
}

function languageKey(language: CaptionLanguage) {
  return `${language.kind}:${language.code}`;
}

function languageOptionLabel(
  language: CaptionLanguage,
  t: (key: TranslationKey) => string,
) {
  const kind =
    language.kind === "manual"
      ? t("transcript.languageDialog.manual")
      : t("transcript.languageDialog.automatic");

  return `${language.label} (${language.code}) - ${kind}`;
}

function whisperModelOptionLabel(
  model: SettingsSnapshot["stt"]["models"][number],
  t: (key: TranslationKey) => string,
) {
  const status = model.downloaded
    ? t("setup.whisper.downloaded")
    : t("setup.whisper.notDownloaded");

  return `${model.name} (${model.sizeMb} MB) - ${status}`;
}

function caughtErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function syncPathForView(view: string, mode: "push" | "replace" = "push") {
  const path =
    view === "tutorial"
      ? "/tutorial"
      : view === "onboarding"
        ? "/onboarding"
        : view === "faq"
          ? "/faq"
          : view === "playlists"
            ? "/playlists"
            : "/";
  if (window.location.pathname === path) return;

  if (mode === "replace") {
    window.history.replaceState({}, "", path);
    return;
  }

  window.history.pushState({}, "", path);
}

function viewForPath(path: string) {
  if (path === "/tutorial") return "tutorial";
  if (path === "/faq") return "faq";
  if (path === "/onboarding") return "onboarding";
  if (path === "/playlists") return "playlists";
  return "finder";
}

function videoIdFromImportResult(result: unknown) {
  if (!isRecord(result)) return undefined;

  const video = result.video;
  if (isRecord(video) && typeof video.id === "string") {
    return video.id;
  }

  if (typeof result.videoId === "string") {
    return result.videoId;
  }

  return undefined;
}

function jobIdFromImportResult(result: unknown) {
  if (!isRecord(result)) return undefined;

  if (isRecord(result.job) && typeof result.job.id === "string") {
    return result.job.id;
  }

  if (typeof result.id === "string" && typeof result.status === "string") {
    return result.id;
  }

  return undefined;
}

function findSegmentForTime<
  TSegment extends { startSeconds: number; endSeconds?: number },
>(segments: TSegment[], currentTimeSeconds: number) {
  return segments.find((segment, index) => {
    const nextSegment = segments[index + 1];
    const endSeconds =
      segment.endSeconds ?? nextSegment?.startSeconds ?? Infinity;

    return (
      currentTimeSeconds >= segment.startSeconds &&
      currentTimeSeconds < endSeconds
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOnboardingComplete() {
  try {
    return window.localStorage.getItem(onboardingStorageKey) === "true";
  } catch {
    return false;
  }
}

function writeOnboardingComplete(done: boolean) {
  try {
    window.localStorage.setItem(onboardingStorageKey, String(done));
  } catch {
    // Keep first-run state in memory if localStorage is unavailable.
  }
}

function findActiveSummary(
  summaries: SummaryDocument[],
  activeSummaryId?: string,
) {
  if (!activeSummaryId) return undefined;

  return summaries.find((summary) => summary.id === activeSummaryId);
}
