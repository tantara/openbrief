import type { ChatContextMode } from "@/domain/chat";
import type {
  ChatMessage,
  ProviderKind,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type {
  PodcastDocument,
  PodcastGenerationJob,
  PodcastLengthMode,
  PodcastOutputMode,
  PodcastSourceKind,
  PodcastSpeakerConfig,
} from "@/domain/podcast";
import type {
  SummaryLengthMode,
  SummaryOutputLanguageOption,
  VideoSummaryTemplateId,
} from "@/domain/summary";
import type {
  TranscriptLanguageOption,
  TranscriptVariant,
} from "@/domain/transcript-actions";
import type { AiGenerationJob } from "@/hooks/useMediaLibrary";
import type { VideoPlaybackState } from "@/hooks/useVideoPlayback";
import type { TranslationKey } from "@/i18n";
import type { AiWorkflowProviderConfig } from "@/services/aiProviderPreferencesService";
import type { SupertonicChatTtsArtifact } from "@/services/supertonicService";
import type {
  PodcastTtsSettings,
  TtsLanguageCode,
} from "@/services/ttsSettingsService";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyActionButton } from "@/components/CopyAction";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { MarkdownSummaryEditor } from "@/components/markdown/MarkdownSummaryEditor";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { PdfViewer } from "@/components/media/PdfViewer";
import { ProviderIcon } from "@/components/provider/ProviderIcon";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import {
  defaultProviderModels,
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import {
  summaryLengthModeLabels,
  summaryOutputLanguageOptions,
  videoSummaryTemplates,
} from "@/domain/summary";
import {
  transcriptSourceKindLabel,
  transcriptTranslationLanguages,
} from "@/domain/transcript-actions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useI18n } from "@/i18n";
import {
  loadPodcastTtsSettings,
  savePodcastTtsSettings,
  supertonicPresetVoiceStyleLabel,
  supertonicPresetVoiceStyles,
} from "@/services/ttsSettingsService";
import {
  Bot,
  Check,
  Download,
  Eye,
  FileText,
  Info,
  Languages,
  Loader2,
  MessageSquareText,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Subtitles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";

import { cn } from "@acme/ui";
import { badgeVariants } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@acme/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import { Input } from "@acme/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@acme/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Textarea } from "@acme/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";

type BriefMode = "summary" | "podcast";

type WorkbenchViewProps = {
  video?: VideoAsset;
  openVideos?: VideoAsset[];
  activeVideoId?: string;
  transcript: TranscriptSegment[];
  transcriptVariants?: TranscriptVariant[];
  activeTranscriptVariantId?: string;
  transcriptJob?: TranscriptJob;
  summary?: SummaryDocument;
  summaries?: SummaryDocument[];
  activeSummaryId?: string;
  summaryJob?: AiGenerationJob;
  chatJob?: AiGenerationJob;
  podcast?: PodcastDocument;
  podcastHistory?: PodcastDocument[];
  podcastJob?: PodcastGenerationJob;
  podcastAudioUrl?: string;
  chatMessages: ChatMessage[];
  onAddVideo?(): void;
  onSelectVideoTab?(videoId: string): void;
  onCloseVideoTab?(videoId: string): void;
  onSelectSummaryTab?(summaryId: string): void;
  onExtractTranscript(): Promise<unknown>;
  onSelectTranscriptVariant?(variantId: string): void;
  onReviewTranscript(provider: ProviderKind, model: string): Promise<unknown>;
  onTranslateTranscript(
    provider: ProviderKind,
    model: string,
    language: TranscriptLanguageOption,
  ): Promise<unknown>;
  onOpenTranscriptOverlay?(): void;
  onGenerateSummary(
    provider: ProviderKind,
    model: string,
    templateId: VideoSummaryTemplateId,
    lengthMode: SummaryLengthMode,
    outputLanguage: string | undefined,
    streamingMode: boolean,
    transcript: TranscriptSegment[],
  ): Promise<unknown>;
  onSendChat(request: {
    question: string;
    contextMode: ChatContextMode;
    provider: ProviderKind;
    model: string;
    summaryId?: string;
    streamingMode: boolean;
  }): Promise<unknown>;
  onReadChatMessage?(
    message: ChatMessage,
    renderedText: string,
  ): Promise<unknown>;
  onGeneratePodcast?(request: {
    mode: PodcastOutputMode;
    sourceKind: PodcastSourceKind;
    lengthMode: PodcastLengthMode;
    outputLanguage?: string;
    speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig];
    languageCode: TtsLanguageCode;
  }): Promise<unknown>;
  onPlayPodcast?(podcast: PodcastDocument): Promise<unknown> | unknown;
  onDownloadPodcastAudio?(podcast: PodcastDocument): Promise<unknown> | unknown;
  onDownloadPodcastScript?(
    podcast: PodcastDocument,
  ): Promise<unknown> | unknown;
  onDeletePodcast?(podcast: PodcastDocument): Promise<unknown> | unknown;
  isVoiceCloneModeEnabled?: boolean;
  chatTtsAudioByMessageId?: Record<
    string,
    SupertonicChatTtsArtifact | undefined
  >;
  generatingChatTtsMessageId?: string;
  playingChatTtsMessageId?: string;
  onDownloadChatTtsAudio?(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ): Promise<unknown> | unknown;
  onPlayChatTtsAudio?(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ): Promise<unknown> | unknown;
  onPauseChatTtsAudio?(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ): Promise<unknown> | unknown;
  onResetChat?(): void;
  summaryProvider?: ProviderKind;
  summaryProviderModel?: string;
  summaryStreamingMode?: boolean;
  chatProvider?: ProviderKind;
  chatProviderModel?: string;
  chatStreamingMode?: boolean;
  onSummaryProviderPreferenceChange?(config: AiWorkflowProviderConfig): void;
  onChatProviderPreferenceChange?(config: AiWorkflowProviderConfig): void;
  onSaveMarkdown(summaryId?: string): unknown;
  onUpdateSummaryMarkdown?(summaryId: string, markdown: string): void;
  onUpdateTranscriptSegment?(segmentId: string, text: string): void;
  playbackState: VideoPlaybackState;
  isInlinePlayerSuppressed?: boolean;
  onPlayVideo(videoId: string): void;
  onPauseVideo(videoId: string): void;
  onVideoTimeUpdate(videoId: string, currentTimeSeconds: number): void;
  onVideoEnded(videoId: string): void;
  onOpenPictureInPicture(videoId: string): void;
};

export function WorkbenchView({
  video,
  openVideos = [],
  activeVideoId,
  transcript,
  transcriptVariants = [],
  activeTranscriptVariantId = "original",
  transcriptJob,
  summary,
  summaries,
  activeSummaryId,
  summaryJob,
  chatJob,
  podcast,
  podcastHistory = [],
  podcastJob,
  podcastAudioUrl,
  chatMessages,
  onAddVideo,
  onSelectVideoTab,
  onCloseVideoTab,
  onSelectSummaryTab,
  onExtractTranscript,
  onSelectTranscriptVariant,
  onReviewTranscript,
  onTranslateTranscript,
  onOpenTranscriptOverlay,
  onGenerateSummary,
  onSendChat,
  onReadChatMessage,
  onGeneratePodcast,
  onPlayPodcast,
  onDownloadPodcastAudio,
  onDownloadPodcastScript,
  onDeletePodcast,
  isVoiceCloneModeEnabled = false,
  chatTtsAudioByMessageId = {},
  generatingChatTtsMessageId,
  playingChatTtsMessageId,
  onDownloadChatTtsAudio,
  onPlayChatTtsAudio,
  onPauseChatTtsAudio,
  onResetChat,
  summaryProvider = "openai",
  summaryProviderModel = defaultProviderModels[summaryProvider],
  summaryStreamingMode = false,
  chatProvider = "openai",
  chatProviderModel = defaultProviderModels[chatProvider],
  chatStreamingMode = false,
  onSummaryProviderPreferenceChange,
  onChatProviderPreferenceChange,
  onSaveMarkdown,
  onUpdateSummaryMarkdown,
  onUpdateTranscriptSegment,
  playbackState,
  isInlinePlayerSuppressed = false,
  onPlayVideo,
  onPauseVideo,
  onVideoTimeUpdate,
  onVideoEnded,
  onOpenPictureInPicture,
}: WorkbenchViewProps) {
  const { t } = useI18n();
  const [summaryTemplateId, setSummaryTemplateId] =
    useState<VideoSummaryTemplateId>("youtube-blog");
  const [summaryLengthMode, setSummaryLengthMode] =
    useState<SummaryLengthMode>("default");
  const [summaryLanguage, setSummaryLanguage] =
    useState<SummaryOutputLanguageOption>(summaryOutputLanguageOptions[0]);
  const [podcastSettings, setPodcastSettings] = useState(() =>
    loadPodcastTtsSettings(),
  );
  const [podcastSourceKind, setPodcastSourceKind] =
    useState<PodcastSourceKind>("current-summary");
  const [isSummaryGenerateDialogOpen, setIsSummaryGenerateDialogOpen] =
    useState(false);
  const [isPodcastGenerateDialogOpen, setIsPodcastGenerateDialogOpen] =
    useState(false);
  const [briefMode, setBriefMode] = useState<BriefMode>("summary");
  const [contextMode, setContextMode] = useState<ChatContextMode>("summary");
  const [localSummaryProviderConfig, setLocalSummaryProviderConfig] =
    useState<AiWorkflowProviderConfig>({
      provider: summaryProvider,
      model: summaryProviderModel,
      streamingMode: summaryStreamingMode,
    });
  const [localChatProviderConfig, setLocalChatProviderConfig] =
    useState<AiWorkflowProviderConfig>({
      provider: chatProvider,
      model: chatProviderModel,
      streamingMode: chatStreamingMode,
    });
  const [pendingChatMessage, setPendingChatMessage] = useState<ChatMessage>();
  const [readingChatMessageId, setReadingChatMessageId] = useState<string>();
  const [downloadingChatTtsMessageId, setDownloadingChatTtsMessageId] =
    useState<string>();
  const [startingChatTtsMessageId, setStartingChatTtsMessageId] =
    useState<string>();
  const [isExtractingTranscript, setIsExtractingTranscript] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [isTranslatingTranscript, setIsTranslatingTranscript] = useState(false);
  const [isTranslateDialogOpen, setIsTranslateDialogOpen] = useState(false);
  const [targetTranslationLanguage, setTargetTranslationLanguage] =
    useState<TranscriptLanguageOption>(transcriptTranslationLanguages[0]);
  const [editingTranscriptSegmentId, setEditingTranscriptSegmentId] =
    useState<string>();
  const [focusedTranscriptSegmentId, setFocusedTranscriptSegmentId] =
    useState<string>();
  const [hoveredTranscriptSegmentId, setHoveredTranscriptSegmentId] =
    useState<string>();
  const [voiceCloneTranscriptSegmentIds, setVoiceCloneTranscriptSegmentIds] =
    useState<string[]>([]);
  const transcriptItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const transcriptListRef = useRef<HTMLOListElement | null>(null);
  const isTranscribing = transcriptJob?.status === "running";
  const isSummarizing = summaryJob?.status === "running";
  const isSendingChat = chatJob?.status === "running";
  const isGeneratingPodcast = podcastJob?.status === "running";
  const summaryProviderConfig = onSummaryProviderPreferenceChange
    ? {
        provider: summaryProvider,
        model: summaryProviderModel,
        streamingMode: summaryStreamingMode,
      }
    : localSummaryProviderConfig;
  const chatProviderConfig = onChatProviderPreferenceChange
    ? {
        provider: chatProvider,
        model: chatProviderModel,
        streamingMode: chatStreamingMode,
      }
    : localChatProviderConfig;
  const videoTabs = normalizeVideoTabs(openVideos, video);
  const activeWorkbenchVideoId = activeVideoId ?? video?.id ?? "";
  const chatContextOptions = [
    { value: "summary" as const, label: t("workbench.chat.summary") },
    { value: "transcript" as const, label: t("workbench.chat.transcript") },
  ];
  const briefModeOptions = [
    { value: "summary" as const, label: t("workbench.brief.summary") },
    { value: "podcast" as const, label: t("workbench.brief.podcast") },
  ];

  useEffect(() => {
    if (!isVoiceCloneModeEnabled) {
      setVoiceCloneTranscriptSegmentIds([]);
    }
  }, [isVoiceCloneModeEnabled]);

  const displayedChatMessages = useMemo(() => {
    if (!pendingChatMessage) return chatMessages;

    const pendingMessageIsPersisted = chatMessages.some(
      (message) =>
        message.role === "user" &&
        message.videoId === pendingChatMessage.videoId &&
        message.contextMode === pendingChatMessage.contextMode &&
        message.content === pendingChatMessage.content,
    );

    return pendingMessageIsPersisted
      ? chatMessages
      : [...chatMessages, pendingChatMessage];
  }, [chatMessages, pendingChatMessage]);
  const summaryTabs = normalizeSummaryTabs(summaries, summary);
  const activeTranscriptVariant = transcriptVariants.find(
    (variant) => variant.id === activeTranscriptVariantId,
  );
  const renderedTranscript = activeTranscriptVariant?.segments ?? transcript;
  const sourceTranscriptBySegmentId = useMemo(
    () => new Map(transcript.map((segment) => [segment.id, segment])),
    [transcript],
  );
  const baseTranscriptSourceKind = transcript[0]?.sourceKind;
  const activeTranslationVariant =
    activeTranscriptVariant?.kind === "translation"
      ? activeTranscriptVariant
      : undefined;
  const isViewingTranscriptVariant = Boolean(activeTranscriptVariant);
  const duplicateTranslation = transcriptVariants.find(
    (variant) =>
      variant.kind === "translation" &&
      variant.languageCode === targetTranslationLanguage.code,
  );
  const activeSummary =
    summaryTabs.find((candidate) => candidate.id === activeSummaryId) ??
    summaryTabs[0] ??
    summary;
  const summaryMarkdown = summaryJob?.draftText ?? activeSummary?.markdown;
  const sourceType = video ? mediaSourceTypeForAsset(video) : "video";
  const activeTranscriptSegmentId = useMemo(() => {
    if (
      !video ||
      sourceType === "pdf" ||
      playbackState.activeVideoId !== video.id ||
      playbackState.status === "idle"
    ) {
      return undefined;
    }

    return findActiveTranscriptSegment(
      renderedTranscript,
      playbackState.currentTimeSeconds,
    )?.id;
  }, [
    playbackState.activeVideoId,
    playbackState.currentTimeSeconds,
    playbackState.status,
    renderedTranscript,
    sourceType,
    video,
  ]);

  useEffect(() => {
    if (!activeTranscriptSegmentId) return;

    transcriptItemRefs.current[activeTranscriptSegmentId]?.scrollIntoView?.({
      block: "nearest",
    });
  }, [activeTranscriptSegmentId]);

  useEffect(() => {
    setVoiceCloneTranscriptSegmentIds((current) =>
      current.filter((segmentId) =>
        renderedTranscript.some((segment) => segment.id === segmentId),
      ),
    );
  }, [renderedTranscript]);

  useEffect(() => {
    if (!focusedTranscriptSegmentId) return;

    function clearFocusedTranscriptSegment(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        transcriptListRef.current?.contains(target)
      ) {
        return;
      }

      setFocusedTranscriptSegmentId(undefined);
      setHoveredTranscriptSegmentId(undefined);
    }

    window.addEventListener("pointerdown", clearFocusedTranscriptSegment, true);
    return () =>
      window.removeEventListener(
        "pointerdown",
        clearFocusedTranscriptSegment,
        true,
      );
  }, [focusedTranscriptSegmentId]);

  useEffect(() => {
    if (
      !video ||
      !activeWorkbenchVideoId ||
      videoTabs.length < 2 ||
      !onSelectVideoTab
    ) {
      return;
    }

    const selectVideoTab = onSelectVideoTab;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (!event.shiftKey || event.altKey) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const direction = workbenchTabShortcutDirection(event);
      if (direction === 0) return;

      const activeIndex = videoTabs.findIndex(
        (tabVideo) => tabVideo.id === activeWorkbenchVideoId,
      );
      if (activeIndex < 0) return;

      event.preventDefault();
      const nextIndex =
        (activeIndex + direction + videoTabs.length) % videoTabs.length;
      selectVideoTab(videoTabs[nextIndex].id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWorkbenchVideoId, onSelectVideoTab, video, videoTabs]);

  if (!video) {
    return (
      <div className="border-border bg-card flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">{t("workbench.empty")}</p>
        {onAddVideo ? (
          <Button type="button" variant="outline" onClick={onAddVideo}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("workbench.tabs.addVideo")}
          </Button>
        ) : null}
      </div>
    );
  }

  async function runAction(action: () => Promise<unknown>) {
    setIsExtractingTranscript(true);
    try {
      await action();
    } finally {
      setIsExtractingTranscript(false);
    }
  }

  function updateSummaryProviderPreference(config: AiWorkflowProviderConfig) {
    if (onSummaryProviderPreferenceChange) {
      onSummaryProviderPreferenceChange(config);
      return;
    }

    setLocalSummaryProviderConfig(config);
  }

  function updateChatProviderPreference(config: AiWorkflowProviderConfig) {
    if (onChatProviderPreferenceChange) {
      onChatProviderPreferenceChange(config);
      return;
    }

    setLocalChatProviderConfig(config);
  }

  async function runTranscriptReview() {
    if (isReviewingTranscript) return;

    setIsReviewingTranscript(true);
    try {
      await onReviewTranscript(
        summaryProviderConfig.provider,
        summaryProviderConfig.model,
      );
    } finally {
      setIsReviewingTranscript(false);
    }
  }

  async function runTranscriptTranslation(
    language = targetTranslationLanguage,
  ) {
    if (isTranslatingTranscript) return;

    setIsTranslatingTranscript(true);
    setIsTranslateDialogOpen(false);
    try {
      await onTranslateTranscript(
        summaryProviderConfig.provider,
        summaryProviderConfig.model,
        language,
      );
    } finally {
      setIsTranslatingTranscript(false);
    }
  }

  async function submitChat(submittedQuestion: string) {
    if (!submittedQuestion || isSendingChat) return;
    const pendingMessage: ChatMessage | undefined = video
      ? {
          id: `chat-pending-${video.id}-${Date.now().toString(36)}`,
          videoId: video.id,
          role: "user",
          content: submittedQuestion,
          contextMode,
          createdAtIso: new Date().toISOString(),
        }
      : undefined;

    if (pendingMessage) {
      setPendingChatMessage(pendingMessage);
    }
    try {
      await onSendChat({
        question: submittedQuestion,
        contextMode,
        provider: chatProviderConfig.provider,
        model: chatProviderConfig.model,
        summaryId: activeSummary?.id,
        streamingMode: chatProviderConfig.streamingMode,
      });
    } catch {
      // The library hook records failed chat jobs for the Workbench status panel.
    } finally {
      if (pendingMessage) {
        setPendingChatMessage((current) =>
          current?.id === pendingMessage.id ? undefined : current,
        );
      }
    }
  }

  async function readChatMessage(message: ChatMessage, renderedText: string) {
    if (!onReadChatMessage || readingChatMessageId) return;

    setReadingChatMessageId(message.id);
    try {
      await onReadChatMessage(message, renderedText);
    } finally {
      setReadingChatMessageId(undefined);
    }
  }

  async function generatePodcast() {
    if (!onGeneratePodcast || isGeneratingPodcast) return;

    const nextSettings = savePodcastTtsSettings(podcastSettings);
    setPodcastSettings(nextSettings);
    const speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig] = [
      {
        id: "A",
        label: supertonicPresetVoiceStyleLabel(
          nextSettings.speakerAVoiceStyleId,
        ),
        voiceStyleId: nextSettings.speakerAVoiceStyleId,
      },
      {
        id: "B",
        label: supertonicPresetVoiceStyleLabel(
          nextSettings.speakerBVoiceStyleId,
        ),
        voiceStyleId: nextSettings.speakerBVoiceStyleId,
      },
    ];

    await onGeneratePodcast({
      mode: nextSettings.mode,
      sourceKind: podcastSourceKind,
      lengthMode: nextSettings.lengthMode,
      outputLanguage: summaryLanguage.outputLanguage,
      speakers,
      languageCode: nextSettings.languageCode,
    });
  }

  function generateSummary() {
    if (isSummarizing || renderedTranscript.length === 0) return;

    setIsSummaryGenerateDialogOpen(false);
    void onGenerateSummary(
      summaryProviderConfig.provider,
      summaryProviderConfig.model,
      summaryTemplateId,
      summaryLengthMode,
      summaryLanguage.outputLanguage ??
        (activeTranscriptVariant?.kind === "translation"
          ? activeTranscriptVariant.languageLabel
          : undefined),
      summaryProviderConfig.streamingMode,
      renderedTranscript,
    ).catch(() => {});
  }

  function submitPodcastGeneration() {
    setIsPodcastGenerateDialogOpen(false);
    void generatePodcast().catch(() => {});
  }

  async function downloadChatTtsAudio(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ) {
    if (!onDownloadChatTtsAudio || downloadingChatTtsMessageId) return;

    setDownloadingChatTtsMessageId(message.id);
    try {
      await onDownloadChatTtsAudio(message, audio);
    } finally {
      setDownloadingChatTtsMessageId(undefined);
    }
  }

  async function playChatTtsAudio(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ) {
    if (!onPlayChatTtsAudio || startingChatTtsMessageId) return;

    setStartingChatTtsMessageId(message.id);
    try {
      await onPlayChatTtsAudio(message, audio);
    } finally {
      setStartingChatTtsMessageId(undefined);
    }
  }

  async function pauseChatTtsAudio(
    message: ChatMessage,
    audio: SupertonicChatTtsArtifact,
  ) {
    await onPauseChatTtsAudio?.(message, audio);
  }

  function seekToSegment(segment: TranscriptSegment) {
    if (!video) return;

    onPlayVideo(video.id);
    onVideoTimeUpdate(video.id, segment.startSeconds);
  }

  function startTranscriptEdit(segment: TranscriptSegment) {
    setEditingTranscriptSegmentId(segment.id);
  }

  function hideTranscriptEditAction() {
    setFocusedTranscriptSegmentId(undefined);
    setHoveredTranscriptSegmentId(undefined);
  }

  function cancelTranscriptEdit() {
    setEditingTranscriptSegmentId(undefined);
    hideTranscriptEditAction();
  }

  function saveTranscriptEdit(segment: TranscriptSegment, text: string) {
    const nextText = text.trim();
    if (!nextText) return;

    onUpdateTranscriptSegment?.(segment.id, nextText);
    cancelTranscriptEdit();
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-3">
      <VideoTabStrip
        videos={videoTabs}
        activeVideoId={activeWorkbenchVideoId}
        onSelectVideoTab={onSelectVideoTab}
        onCloseVideoTab={onCloseVideoTab}
        onAddVideo={onAddVideo}
      />
      <ResizablePanelGroup
        id="workbench-columns"
        direction="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="workbench-transcript"
          defaultSize="30%"
          minSize="240px"
        >
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              {isInlinePlayerSuppressed ? (
                <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center rounded-md text-sm">
                  {t("workbench.playingInPictureInPicture")}
                </div>
              ) : sourceType === "video" ? (
                <VideoPlayer
                  video={video}
                  activeVideoId={playbackState.activeVideoId}
                  isPlaying={playbackState.status === "playing"}
                  currentTimeSeconds={playbackState.currentTimeSeconds}
                  onPlay={onPlayVideo}
                  onPause={onPauseVideo}
                  onTimeUpdate={onVideoTimeUpdate}
                  onEnded={onVideoEnded}
                  onOpenPictureInPicture={onOpenPictureInPicture}
                />
              ) : sourceType === "audio" ? (
                <AudioPlayer
                  media={video}
                  activeMediaId={playbackState.activeVideoId}
                  isPlaying={playbackState.status === "playing"}
                  currentTimeSeconds={playbackState.currentTimeSeconds}
                  onPlay={onPlayVideo}
                  onPause={onPauseVideo}
                  onTimeUpdate={onVideoTimeUpdate}
                  onEnded={onVideoEnded}
                  onOpenPictureInPicture={onOpenPictureInPicture}
                />
              ) : (
                <PdfViewer media={video} />
              )}
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isExtractingTranscript || isTranscribing}
                  onClick={() => void runAction(onExtractTranscript)}
                >
                  <Subtitles className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isTranscribing
                    ? t("workbench.extractingTranscript")
                    : t("workbench.extractTranscript")}
                </Button>
              </div>
              {transcriptJob ? (
                <TranscriptProgressCard transcriptJob={transcriptJob} />
              ) : null}
              {transcript.length > 0 ? (
                <TranscriptActionPanel
                  variants={transcriptVariants}
                  activeVariantId={activeTranscriptVariantId}
                  baseTranscriptLabel={
                    baseTranscriptSourceKind
                      ? transcriptSourceKindLabel(baseTranscriptSourceKind)
                      : t("workbench.transcript.variant.original")
                  }
                  targetLanguage={targetTranslationLanguage}
                  duplicateTranslation={duplicateTranslation}
                  isReviewing={isReviewingTranscript}
                  isTranslating={isTranslatingTranscript}
                  translateDialogOpen={isTranslateDialogOpen}
                  onVariantChange={(variantId) =>
                    onSelectTranscriptVariant?.(variantId)
                  }
                  onTargetLanguageChange={setTargetTranslationLanguage}
                  onReview={() => void runTranscriptReview()}
                  onTranslate={() => setIsTranslateDialogOpen(true)}
                  onTranslateDialogOpenChange={setIsTranslateDialogOpen}
                  onConfirmTranslate={() => void runTranscriptTranslation()}
                  onOverlay={onOpenTranscriptOverlay}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {renderedTranscript.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                      {isTranscribing
                        ? t("workbench.transcript.running")
                        : t("workbench.transcript.empty")}
                    </p>
                    {!isTranscribing ? (
                      <div
                        aria-label={t("workbench.transcript.exampleLabel")}
                        className="bg-muted/50 space-y-2 rounded-md p-3 text-sm"
                      >
                        <span className={badgeVariants({ variant: "outline" })}>
                          {t("workbench.transcript.exampleBadge")}
                        </span>
                        <div className="flex gap-3">
                          <span className="text-muted-foreground shrink-0 font-mono text-xs">
                            00:12
                          </span>
                          <span>{t("workbench.transcript.example.one")}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-muted-foreground shrink-0 font-mono text-xs">
                            00:47
                          </span>
                          <span>{t("workbench.transcript.example.two")}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-muted-foreground shrink-0 font-mono text-xs">
                            01:18
                          </span>
                          <span>{t("workbench.transcript.example.three")}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {isVoiceCloneModeEnabled ? (
                      <div className="border-border text-muted-foreground mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs">
                        <span>
                          {t("workbench.transcript.voiceCloneSelection", {
                            count: voiceCloneTranscriptSegmentIds.length,
                          })}
                        </span>
                        {voiceCloneTranscriptSegmentIds.length > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() =>
                              setVoiceCloneTranscriptSegmentIds([])
                            }
                          >
                            {t("workbench.transcript.voiceCloneClear")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <ol ref={transcriptListRef} className="space-y-3">
                      {renderedTranscript.map((segment) => {
                        const sourceSegment = activeTranslationVariant
                          ? sourceTranscriptBySegmentId.get(segment.id)
                          : undefined;
                        const isActive =
                          segment.id === activeTranscriptSegmentId;
                        const isEditing =
                          segment.id === editingTranscriptSegmentId;
                        const isSelectedForVoiceClone =
                          voiceCloneTranscriptSegmentIds.includes(segment.id);
                        const showActiveEditButton =
                          focusedTranscriptSegmentId === segment.id ||
                          hoveredTranscriptSegmentId === segment.id;

                        return (
                          <li
                            key={segment.id}
                            ref={(element) => {
                              transcriptItemRefs.current[segment.id] = element;
                            }}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "group rounded-md px-2 py-1.5 text-sm transition-colors",
                              isActive &&
                                "bg-primary/10 text-foreground shadow-sm",
                            )}
                            onFocusCapture={() =>
                              setFocusedTranscriptSegmentId(segment.id)
                            }
                            onPointerEnter={() =>
                              setHoveredTranscriptSegmentId(segment.id)
                            }
                            onPointerLeave={() =>
                              setHoveredTranscriptSegmentId((current) =>
                                current === segment.id ? undefined : current,
                              )
                            }
                            onBlurCapture={(event) => {
                              const nextTarget = event.relatedTarget;
                              if (
                                nextTarget instanceof Node &&
                                event.currentTarget.contains(nextTarget)
                              ) {
                                return;
                              }

                              setFocusedTranscriptSegmentId((current) =>
                                current === segment.id ? undefined : current,
                              );
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                className={cn(
                                  "text-muted-foreground hover:text-foreground focus:ring-ring mt-1 rounded-sm font-mono text-xs focus:ring-2 focus:outline-none",
                                  isActive && "text-primary",
                                )}
                                onClick={() => seekToSegment(segment)}
                                aria-label={t("workbench.transcript.jumpTo", {
                                  time: formatTime(segment.startSeconds),
                                })}
                              >
                                {formatTime(segment.startSeconds)}
                              </button>
                              {isVoiceCloneModeEnabled ? (
                                <label className="text-muted-foreground hover:text-foreground mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={isSelectedForVoiceClone}
                                    aria-label={t(
                                      "workbench.transcript.voiceCloneToggle",
                                      {
                                        time: formatTime(segment.startSeconds),
                                      },
                                    )}
                                    onChange={() =>
                                      setVoiceCloneTranscriptSegmentIds(
                                        (current) =>
                                          nextVoiceCloneTranscriptSegmentSelection(
                                            renderedTranscript,
                                            current,
                                            segment.id,
                                          ),
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                              {isEditing ? (
                                <TranscriptSegmentEditForm
                                  segment={segment}
                                  onCancel={cancelTranscriptEdit}
                                  onSave={(text) =>
                                    saveTranscriptEdit(segment, text)
                                  }
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="hover:text-foreground focus:ring-ring min-w-0 flex-1 rounded-sm bg-transparent p-0 text-left leading-relaxed text-inherit focus:ring-2 focus:outline-none"
                                    onClick={() => seekToSegment(segment)}
                                    aria-label={t(
                                      "workbench.transcript.jumpTextTo",
                                      {
                                        time: formatTime(segment.startSeconds),
                                      },
                                    )}
                                  >
                                    {sourceSegment ? (
                                      <span className="grid gap-1.5">
                                        <span className="text-muted-foreground">
                                          {sourceSegment.text}
                                        </span>
                                        <span className="border-primary/40 text-foreground border-l-2 pl-3">
                                          {segment.text}
                                        </span>
                                      </span>
                                    ) : (
                                      segment.text
                                    )}
                                  </button>
                                  {onUpdateTranscriptSegment &&
                                  !isViewingTranscriptVariant ? (
                                    <span className="h-7 w-7 shrink-0">
                                      {showActiveEditButton ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          aria-label={t(
                                            "workbench.transcript.edit",
                                            {
                                              time: formatTime(
                                                segment.startSeconds,
                                              ),
                                            },
                                          )}
                                          onClick={() =>
                                            startTranscriptEdit(segment)
                                          }
                                        >
                                          <Pencil
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      ) : null}
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-2" />

        <ResizablePanel
          id="workbench-summary"
          defaultSize="40%"
          minSize="320px"
        >
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <CardHeader className="space-y-3">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t("workbench.brief.title")}</span>
                  </span>
                  <BriefModeControl
                    value={briefMode}
                    options={briefModeOptions}
                    onChange={setBriefMode}
                  />
                </span>
                <SummaryProviderDialog
                  provider={summaryProviderConfig.provider}
                  model={summaryProviderConfig.model}
                  streamingMode={summaryProviderConfig.streamingMode}
                  onProviderChange={(nextProvider) => {
                    updateSummaryProviderPreference({
                      provider: nextProvider,
                      model: defaultProviderModels[nextProvider],
                      streamingMode: summaryProviderConfig.streamingMode,
                    });
                  }}
                  onModelChange={(model) =>
                    updateSummaryProviderPreference({
                      provider: summaryProviderConfig.provider,
                      model,
                      streamingMode: summaryProviderConfig.streamingMode,
                    })
                  }
                  onStreamingModeChange={(streamingMode) =>
                    updateSummaryProviderPreference({
                      provider: summaryProviderConfig.provider,
                      model: summaryProviderConfig.model,
                      streamingMode,
                    })
                  }
                />
              </CardTitle>
              <div className="flex min-h-9 flex-wrap items-center gap-2">
                {briefMode === "summary" && summaryMarkdown ? (
                  <SummaryGenerateDialog
                    open={isSummaryGenerateDialogOpen}
                    templateId={summaryTemplateId}
                    lengthMode={summaryLengthMode}
                    languageCode={summaryLanguage.code}
                    isGenerating={isSummarizing}
                    disabled={renderedTranscript.length === 0}
                    triggerVariant="outline"
                    onOpenChange={setIsSummaryGenerateDialogOpen}
                    onTemplateChange={setSummaryTemplateId}
                    onLengthChange={setSummaryLengthMode}
                    onLanguageChange={setSummaryLanguage}
                    onGenerate={generateSummary}
                  />
                ) : null}
                {briefMode === "podcast" && podcast ? (
                  <PodcastHeaderActions
                    podcast={podcast}
                    generateAction={
                      <PodcastGenerateDialog
                        open={isPodcastGenerateDialogOpen}
                        podcastHistoryCount={podcastHistory.length}
                        settings={podcastSettings}
                        sourceKind={podcastSourceKind}
                        canGenerate={Boolean(onGeneratePodcast && video)}
                        hasSummary={Boolean(activeSummary)}
                        hasTranscript={transcript.length > 0}
                        isGenerating={isGeneratingPodcast}
                        triggerVariant="outline"
                        onOpenChange={setIsPodcastGenerateDialogOpen}
                        onSettingsChange={setPodcastSettings}
                        onSourceKindChange={setPodcastSourceKind}
                        onGenerate={submitPodcastGeneration}
                      />
                    }
                    onPlayPodcast={onPlayPodcast}
                    onDownloadPodcastAudio={onDownloadPodcastAudio}
                    onDownloadPodcastScript={onDownloadPodcastScript}
                    onDeletePodcast={onDeletePodcast}
                  />
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              {briefMode === "summary" && transcript.length === 0 ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  <span>{t("workbench.summary.transcriptRequired")}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isExtractingTranscript || isTranscribing}
                    onClick={() => void runAction(onExtractTranscript)}
                  >
                    <Subtitles className="h-4 w-4" aria-hidden="true" />
                    {t("workbench.summary.transcribe")}
                  </Button>
                </div>
              ) : null}
              {briefMode === "summary" ? (
                <>
                  <SummaryTabStrip
                    summaries={summaryTabs}
                    activeSummaryId={activeSummary?.id}
                    onSelectSummaryTab={onSelectSummaryTab}
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {summaryJob ? (
                      <AiGenerationStatus
                        job={summaryJob}
                        runningLabel={t("workbench.summary.generating")}
                        failedLabel={t("workbench.summary.failed")}
                      />
                    ) : null}
                    {summaryMarkdown ? (
                      <SummaryMarkdownPanel
                        summaryId={activeSummary?.id}
                        markdown={summaryMarkdown}
                        editable={Boolean(
                          activeSummary && onUpdateSummaryMarkdown,
                        )}
                        ariaLabel={t("workbench.summary.editor")}
                        onCommitMarkdown={onUpdateSummaryMarkdown}
                        saveLabel={t("workbench.summary.save")}
                        saveDisabled={isSummarizing}
                        onSaveMarkdown={
                          activeSummary
                            ? () => onSaveMarkdown(activeSummary.id)
                            : undefined
                        }
                      />
                    ) : !summaryJob ? (
                      <BriefEmptyState
                        action={
                          <SummaryGenerateDialog
                            open={isSummaryGenerateDialogOpen}
                            templateId={summaryTemplateId}
                            lengthMode={summaryLengthMode}
                            languageCode={summaryLanguage.code}
                            isGenerating={isSummarizing}
                            disabled={renderedTranscript.length === 0}
                            onOpenChange={setIsSummaryGenerateDialogOpen}
                            onTemplateChange={setSummaryTemplateId}
                            onLengthChange={setSummaryLengthMode}
                            onLanguageChange={setSummaryLanguage}
                            onGenerate={generateSummary}
                          />
                        }
                        description={t("workbench.summary.empty")}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <PodcastBriefPanel
                  podcast={podcast}
                  podcastHistory={podcastHistory}
                  podcastJob={podcastJob}
                  podcastAudioUrl={podcastAudioUrl}
                  sourceKind={podcastSourceKind}
                  hasSummary={Boolean(activeSummary)}
                  hasTranscript={transcript.length > 0}
                  generateAction={
                    <PodcastGenerateDialog
                      open={isPodcastGenerateDialogOpen}
                      podcastHistoryCount={podcastHistory.length}
                      settings={podcastSettings}
                      sourceKind={podcastSourceKind}
                      canGenerate={Boolean(onGeneratePodcast && video)}
                      hasSummary={Boolean(activeSummary)}
                      hasTranscript={transcript.length > 0}
                      isGenerating={isGeneratingPodcast}
                      onOpenChange={setIsPodcastGenerateDialogOpen}
                      onSettingsChange={setPodcastSettings}
                      onSourceKindChange={setPodcastSourceKind}
                      onGenerate={submitPodcastGeneration}
                    />
                  }
                  onAudioPlay={
                    podcast
                      ? () => onPauseVideo(podcast.sourceAssetId)
                      : undefined
                  }
                />
              )}
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle className="mx-2" />

        <ResizablePanel id="workbench-chat" defaultSize="30%" minSize="240px">
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <MessageSquareText
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{t("workbench.chat.title")}</span>
                    <span className="text-muted-foreground">
                      {t("workbench.chat.with")}
                    </span>
                  </span>
                  <ChatContextControl
                    value={contextMode}
                    options={chatContextOptions}
                    onChange={setContextMode}
                  />
                </span>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isSendingChat}
                        aria-label={t("workbench.chat.newChat")}
                        onClick={() => {
                          setPendingChatMessage(undefined);
                          onResetChat?.();
                        }}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t("workbench.chat.newChat")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-y-auto py-2 text-sm">
                {displayedChatMessages.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("workbench.chat.empty")}
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {displayedChatMessages.map((message, index) => {
                      const ttsAudio = chatTtsAudioForMessage(
                        chatTtsAudioByMessageId[message.id],
                        message,
                      );
                      const isGeneratingTts =
                        generatingChatTtsMessageId === message.id;

                      return (
                        <ChatBubble
                          key={message.id}
                          message={message}
                          isLast={index === displayedChatMessages.length - 1}
                          isReading={
                            readingChatMessageId === message.id ||
                            isGeneratingTts
                          }
                          ttsAudio={ttsAudio}
                          isPlayingTts={
                            Boolean(ttsAudio) &&
                            playingChatTtsMessageId === message.id
                          }
                          isStartingTts={
                            startingChatTtsMessageId === message.id
                          }
                          isDownloadingTts={
                            downloadingChatTtsMessageId === message.id
                          }
                          onRead={
                            onReadChatMessage && message.role !== "user"
                              ? (renderedText) =>
                                  void readChatMessage(message, renderedText)
                              : undefined
                          }
                          onPlayTtsAudio={
                            onPlayChatTtsAudio
                              ? (audio) => void playChatTtsAudio(message, audio)
                              : undefined
                          }
                          onPauseTtsAudio={
                            onPauseChatTtsAudio
                              ? (audio) =>
                                  void pauseChatTtsAudio(message, audio)
                              : undefined
                          }
                          onDownloadTtsAudio={
                            onDownloadChatTtsAudio
                              ? (audio) =>
                                  void downloadChatTtsAudio(message, audio)
                              : undefined
                          }
                        />
                      );
                    })}
                  </ol>
                )}
                {chatJob ? (
                  <AiGenerationStatus
                    job={chatJob}
                    runningLabel={t("workbench.chat.sending")}
                    failedLabel={t("workbench.chat.failed")}
                  />
                ) : null}
                {chatJob?.status === "running" &&
                chatJob.streamingMode &&
                chatJob.draftText ? (
                  <StreamingChatDraft draftText={chatJob.draftText} />
                ) : null}
              </div>
              <div className="mt-auto grid gap-2">
                <ChatProviderDialog
                  provider={chatProviderConfig.provider}
                  model={chatProviderConfig.model}
                  streamingMode={chatProviderConfig.streamingMode}
                  onProviderChange={(nextProvider) => {
                    updateChatProviderPreference({
                      provider: nextProvider,
                      model: defaultProviderModels[nextProvider],
                      streamingMode: chatProviderConfig.streamingMode,
                    });
                  }}
                  onModelChange={(model) =>
                    updateChatProviderPreference({
                      provider: chatProviderConfig.provider,
                      model,
                      streamingMode: chatProviderConfig.streamingMode,
                    })
                  }
                  onStreamingModeChange={(streamingMode) =>
                    updateChatProviderPreference({
                      provider: chatProviderConfig.provider,
                      model: chatProviderConfig.model,
                      streamingMode,
                    })
                  }
                />
                <ChatQuestionForm
                  isSending={isSendingChat}
                  onSubmitQuestion={(submittedQuestion) =>
                    void submitChat(submittedQuestion)
                  }
                />
              </div>
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function TranscriptSegmentEditForm({
  segment,
  onCancel,
  onSave,
}: {
  segment: TranscriptSegment;
  onCancel(): void;
  onSave(text: string): void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(segment.text);
  const trimmedDraft = draft.trim();

  return (
    <form
      className="min-w-0 flex-1 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmedDraft) return;

        onSave(trimmedDraft);
      }}
    >
      <Textarea
        autoFocus
        value={draft}
        aria-label={t("workbench.transcript.editLabel", {
          time: formatTime(segment.startSeconds),
        })}
        className="bg-background min-h-20 resize-y text-sm"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("workbench.transcript.cancelEdit")}
        </Button>
        <Button type="submit" size="sm" disabled={!trimmedDraft}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("workbench.transcript.saveEdit")}
        </Button>
      </div>
    </form>
  );
}

function BriefEmptyState({
  action,
  description,
}: {
  action: ReactNode;
  description: string;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {action}
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
    </div>
  );
}

function PodcastHeaderActions({
  podcast,
  generateAction,
  onPlayPodcast,
  onDownloadPodcastAudio,
  onDownloadPodcastScript,
  onDeletePodcast,
}: {
  podcast: PodcastDocument;
  generateAction: ReactNode;
  onPlayPodcast?(podcast: PodcastDocument): Promise<unknown> | unknown;
  onDownloadPodcastAudio?(podcast: PodcastDocument): Promise<unknown> | unknown;
  onDownloadPodcastScript?(
    podcast: PodcastDocument,
  ): Promise<unknown> | unknown;
  onDeletePodcast?(podcast: PodcastDocument): Promise<unknown> | unknown;
}) {
  const { t } = useI18n();
  const hasDownloadAction = Boolean(
    onDownloadPodcastAudio || onDownloadPodcastScript,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        {generateAction}
        {onPlayPodcast ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onPlayPodcast(podcast)}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("workbench.podcast.play")}
          </Button>
        ) : null}
        {hasDownloadAction ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={t("workbench.podcast.download")}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("workbench.podcast.download")}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" align="end" className="w-44">
              {onDownloadPodcastAudio ? (
                <DropdownMenuItem
                  onClick={() => void onDownloadPodcastAudio(podcast)}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("workbench.podcast.downloadAudio")}
                </DropdownMenuItem>
              ) : null}
              {onDownloadPodcastScript ? (
                <DropdownMenuItem
                  onClick={() => void onDownloadPodcastScript(podcast)}
                >
                  <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("workbench.podcast.downloadScript")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onDeletePodcast ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                aria-label={t("workbench.podcast.delete")}
                onClick={() => void onDeletePodcast(podcast)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("workbench.podcast.delete")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function PodcastBriefPanel({
  podcast,
  podcastHistory,
  podcastJob,
  podcastAudioUrl,
  sourceKind,
  hasSummary,
  hasTranscript,
  generateAction,
  onAudioPlay,
}: {
  podcast?: PodcastDocument;
  podcastHistory: PodcastDocument[];
  podcastJob?: PodcastGenerationJob;
  podcastAudioUrl?: string;
  sourceKind: PodcastSourceKind;
  hasSummary: boolean;
  hasTranscript: boolean;
  generateAction: ReactNode;
  onAudioPlay?(): void;
}) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const sourceAvailable =
    sourceKind === "current-summary" ? hasSummary : hasTranscript;
  const turnTimingsById = useMemo(
    () =>
      new Map(
        (podcast?.turnTimings ?? []).map((timing) => [timing.turnId, timing]),
      ),
    [podcast?.turnTimings],
  );
  const activeTurnId = useMemo(() => {
    for (const timing of turnTimingsById.values()) {
      if (
        currentAudioTime >= timing.startSeconds &&
        currentAudioTime < timing.endSeconds
      ) {
        return timing.turnId;
      }
    }

    return undefined;
  }, [currentAudioTime, turnTimingsById]);

  useEffect(() => {
    setCurrentAudioTime(0);
  }, [podcast?.id, podcastAudioUrl]);

  function seekToTurn(turnId: string) {
    const timing = turnTimingsById.get(turnId);
    const audio = audioRef.current;
    if (!timing || !audio) return;

    audio.currentTime = timing.startSeconds;
    setCurrentAudioTime(timing.startSeconds);
  }

  if (!podcast && !podcastJob) {
    return (
      <BriefEmptyState
        action={generateAction}
        description={
          !sourceAvailable
            ? sourceKind === "current-summary"
              ? t("workbench.podcast.summaryRequired")
              : t("workbench.podcast.transcriptRequired")
            : t("workbench.podcast.empty")
        }
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{t("workbench.podcast.title")}</span>
            {podcastHistory.length > 1 ? (
              <span className="text-muted-foreground text-xs">
                {t("workbench.podcast.history", {
                  count: podcastHistory.length,
                })}
              </span>
            ) : null}
          </div>
          {podcastJob ? (
            <span className="text-muted-foreground text-xs">
              {podcastJob.status === "running"
                ? t(podcastStageLabelKey(podcastJob.stage))
                : t("workbench.podcast.failed")}
            </span>
          ) : null}
        </div>
        {podcast && podcastAudioUrl ? (
          <audio
            ref={audioRef}
            className="w-full"
            controls
            preload="metadata"
            src={podcastAudioUrl}
            onPlay={onAudioPlay}
            onTimeUpdate={(event) =>
              setCurrentAudioTime(event.currentTarget.currentTime)
            }
            onSeeked={(event) =>
              setCurrentAudioTime(event.currentTarget.currentTime)
            }
          />
        ) : null}
        {podcast ? (
          <ol className="grid gap-3">
            {podcast.script.turns.map((turn) => {
              const timing = turnTimingsById.get(turn.id);
              const isActive = activeTurnId === turn.id;

              return (
                <li key={turn.id}>
                  <button
                    type="button"
                    disabled={!timing}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "bg-muted/20 w-full rounded-md border px-3 py-2 text-left text-sm transition",
                      timing && "hover:bg-muted/60",
                      isActive && "border-primary bg-primary/10",
                      !timing && "cursor-default",
                    )}
                    onClick={() => seekToTurn(turn.id)}
                  >
                    <span className="mb-1 flex items-center justify-between gap-3 font-medium">
                      <span>{turn.speakerLabel}</span>
                      {timing ? (
                        <span className="text-muted-foreground shrink-0 text-xs font-normal">
                          {formatPodcastTimestamp(timing.startSeconds)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-foreground/90 block leading-relaxed">
                      {turn.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
        {podcastJob && !sourceAvailable ? (
          <p className="text-muted-foreground text-xs">
            {sourceKind === "current-summary"
              ? t("workbench.podcast.summaryRequired")
              : t("workbench.podcast.transcriptRequired")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SummaryGenerateDialog({
  open,
  templateId,
  lengthMode,
  languageCode,
  isGenerating,
  disabled,
  triggerVariant = "default",
  onOpenChange,
  onTemplateChange,
  onLengthChange,
  onLanguageChange,
  onGenerate,
}: {
  open: boolean;
  templateId: VideoSummaryTemplateId;
  lengthMode: SummaryLengthMode;
  languageCode: string;
  isGenerating: boolean;
  disabled: boolean;
  triggerVariant?: "default" | "outline" | "ghost";
  onOpenChange(open: boolean): void;
  onTemplateChange(value: VideoSummaryTemplateId): void;
  onLengthChange(value: SummaryLengthMode): void;
  onLanguageChange(value: SummaryOutputLanguageOption): void;
  onGenerate(): void;
}) {
  const { t } = useI18n();
  const submitDisabled = disabled || isGenerating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          disabled={submitDisabled}
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isGenerating
            ? t("workbench.summary.generating")
            : t("workbench.summary.action")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workbench.summary.action")}</DialogTitle>
          <DialogDescription>
            {t("workbench.summary.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitDisabled) return;
            onGenerate();
          }}
        >
          <div className="grid gap-2 text-sm">
            <span className="font-medium">
              {t("workbench.summary.template")}
            </span>
            <SummaryTemplateSelect
              value={templateId}
              triggerClassName="w-full"
              onChange={onTemplateChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("workbench.summary.length")}</span>
            <SummaryLengthSelect
              value={lengthMode}
              triggerClassName="w-full"
              onChange={onLengthChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">
              {t("workbench.summary.language")}
            </span>
            <SummaryLanguageSelect
              value={languageCode}
              triggerClassName="w-full"
              onChange={onLanguageChange}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("workbench.summary.action")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PodcastGenerateDialog({
  open,
  podcastHistoryCount,
  settings,
  sourceKind,
  canGenerate,
  hasSummary,
  hasTranscript,
  isGenerating,
  triggerVariant = "outline",
  onOpenChange,
  onSettingsChange,
  onSourceKindChange,
  onGenerate,
}: {
  open: boolean;
  podcastHistoryCount: number;
  settings: PodcastTtsSettings;
  sourceKind: PodcastSourceKind;
  canGenerate: boolean;
  hasSummary: boolean;
  hasTranscript: boolean;
  isGenerating: boolean;
  triggerVariant?: "default" | "outline" | "ghost";
  onOpenChange(open: boolean): void;
  onSettingsChange(settings: PodcastTtsSettings): void;
  onSourceKindChange(sourceKind: PodcastSourceKind): void;
  onGenerate(): void;
}) {
  const { t } = useI18n();
  const sourceAvailable =
    sourceKind === "current-summary" ? hasSummary : hasTranscript;
  const hasDistinctSpeakers =
    settings.speakerAVoiceStyleId !== settings.speakerBVoiceStyleId;
  const submitDisabled =
    !canGenerate || !sourceAvailable || !hasDistinctSpeakers || isGenerating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          disabled={!canGenerate || isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isGenerating
            ? t("workbench.podcast.generating")
            : t("workbench.podcast.generate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("workbench.podcast.generate")}</DialogTitle>
          <DialogDescription>
            {t("workbench.podcast.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitDisabled) return;
            onGenerate();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <PodcastSelect
              label={t("workbench.podcast.mode")}
              value={settings.mode}
              options={[
                {
                  value: "podcast-summary",
                  label: t("workbench.podcast.mode.summary"),
                },
                {
                  value: "audiobook-brief",
                  label: t("workbench.podcast.mode.audiobook"),
                },
              ]}
              onChange={(mode) =>
                onSettingsChange({
                  ...settings,
                  mode: mode as PodcastOutputMode,
                })
              }
            />
            <PodcastSelect
              label={t("workbench.podcast.source")}
              value={sourceKind}
              options={[
                {
                  value: "current-summary",
                  label: t("workbench.podcast.source.summary"),
                },
                {
                  value: "transcript",
                  label: t("workbench.podcast.source.transcript"),
                },
                {
                  value: "active-transcript-translation",
                  label: t("workbench.podcast.source.translation"),
                },
              ]}
              onChange={(value) =>
                onSourceKindChange(value as PodcastSourceKind)
              }
            />
            <PodcastSelect
              label={t("workbench.podcast.length")}
              value={settings.lengthMode}
              options={[
                { value: "short", label: t("workbench.podcast.length.short") },
                {
                  value: "default",
                  label: t("workbench.podcast.length.default"),
                },
                { value: "long", label: t("workbench.podcast.length.long") },
              ]}
              onChange={(lengthMode) =>
                onSettingsChange({
                  ...settings,
                  lengthMode: lengthMode as PodcastLengthMode,
                })
              }
            />
            <PodcastSelect
              label={t("workbench.podcast.language")}
              value={settings.languageCode}
              options={[
                { value: "en", label: "English" },
                { value: "ko", label: "Korean" },
                { value: "ja", label: "Japanese" },
                { value: "es", label: "Spanish" },
                { value: "fr", label: "French" },
                { value: "de", label: "German" },
              ]}
              onChange={(languageCode) =>
                onSettingsChange({
                  ...settings,
                  languageCode: languageCode as TtsLanguageCode,
                })
              }
            />
            <PodcastSelect
              label={t("workbench.podcast.speakerA")}
              value={settings.speakerAVoiceStyleId}
              options={supertonicPresetVoiceStyles.map((voice) => ({
                value: voice.id,
                label: voice.label,
              }))}
              onChange={(speakerAVoiceStyleId) =>
                onSettingsChange({
                  ...settings,
                  speakerAVoiceStyleId:
                    speakerAVoiceStyleId as PodcastTtsSettings["speakerAVoiceStyleId"],
                })
              }
            />
            <PodcastSelect
              label={t("workbench.podcast.speakerB")}
              value={settings.speakerBVoiceStyleId}
              options={supertonicPresetVoiceStyles.map((voice) => ({
                value: voice.id,
                label: voice.label,
              }))}
              onChange={(speakerBVoiceStyleId) =>
                onSettingsChange({
                  ...settings,
                  speakerBVoiceStyleId:
                    speakerBVoiceStyleId as PodcastTtsSettings["speakerBVoiceStyleId"],
                })
              }
            />
          </div>
          {!sourceAvailable ? (
            <p className="text-muted-foreground text-xs">
              {sourceKind === "current-summary"
                ? t("workbench.podcast.summaryRequired")
                : t("workbench.podcast.transcriptRequired")}
            </p>
          ) : null}
          {sourceAvailable && !hasDistinctSpeakers ? (
            <p className="text-muted-foreground text-xs">
              {t("workbench.podcast.distinctVoicesRequired")}
            </p>
          ) : null}
          {podcastHistoryCount > 1 ? (
            <p className="text-muted-foreground text-xs">
              {t("workbench.podcast.history", { count: podcastHistoryCount })}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("workbench.podcast.generate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PodcastSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  return (
    <label className="text-muted-foreground grid gap-1 text-xs">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function podcastStageLabelKey(
  stage: PodcastGenerationJob["stage"],
): TranslationKey {
  switch (stage) {
    case "script":
      return "workbench.podcast.stage.script";
    case "tts":
      return "workbench.podcast.stage.tts";
    case "complete":
      return "workbench.podcast.stage.complete";
  }
}

function SummaryMarkdownPanel({
  summaryId,
  markdown,
  editable,
  ariaLabel,
  onCommitMarkdown,
  saveLabel,
  saveDisabled = false,
  onSaveMarkdown,
}: {
  summaryId?: string;
  markdown: string;
  editable: boolean;
  ariaLabel: string;
  onCommitMarkdown?(summaryId: string, markdown: string): void;
  saveLabel: string;
  saveDisabled?: boolean;
  onSaveMarkdown?(): void;
}) {
  const [draftMarkdown, setDraftMarkdown] = useState(markdown);
  const debouncedDraftMarkdown = useDebouncedValue(draftMarkdown, 250);
  const lastCommittedRef = useRef({ summaryId, markdown });

  useEffect(() => {
    setDraftMarkdown((current) => {
      const lastCommitted = lastCommittedRef.current;
      const isLocalCommitEcho =
        lastCommitted.summaryId === summaryId &&
        lastCommitted.markdown === markdown;

      return isLocalCommitEcho ? current : markdown;
    });
    lastCommittedRef.current = { summaryId, markdown };
  }, [markdown, summaryId]);

  const commitMarkdown = useCallback(
    (nextMarkdown: string) => {
      if (!editable || !summaryId || !onCommitMarkdown) return;
      const lastCommitted = lastCommittedRef.current;
      if (
        lastCommitted.summaryId === summaryId &&
        lastCommitted.markdown === nextMarkdown
      ) {
        return;
      }

      lastCommittedRef.current = { summaryId, markdown: nextMarkdown };
      onCommitMarkdown(summaryId, nextMarkdown);
    },
    [editable, onCommitMarkdown, summaryId],
  );

  useEffect(() => {
    commitMarkdown(debouncedDraftMarkdown);
  }, [commitMarkdown, debouncedDraftMarkdown]);

  return (
    <div
      className="min-h-full"
      onBlur={(event) => {
        const nextFocusTarget = event.relatedTarget;
        if (
          nextFocusTarget instanceof Node &&
          event.currentTarget.contains(nextFocusTarget)
        ) {
          return;
        }

        commitMarkdown(draftMarkdown);
      }}
    >
      <MarkdownSummaryEditor
        markdown={draftMarkdown}
        editable={editable}
        ariaLabel={ariaLabel}
        toolbarActions={
          onSaveMarkdown ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={saveDisabled}
                    aria-label={saveLabel}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onSaveMarkdown}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{saveLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : undefined
        }
        onMarkdownChange={setDraftMarkdown}
      />
    </div>
  );
}

function ChatQuestionForm({
  isSending,
  onSubmitQuestion,
}: {
  isSending: boolean;
  onSubmitQuestion(question: string): void;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const trimmedQuestion = question.trim();

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmedQuestion || isSending) return;

        onSubmitQuestion(trimmedQuestion);
        setQuestion("");
      }}
    >
      <label className="sr-only" htmlFor="chat-question">
        {t("workbench.chat.question")}
      </label>
      <Input
        id="chat-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={t("workbench.chat.placeholder")}
        className="min-w-0 flex-1"
      />
      <Button type="submit" disabled={isSending || !trimmedQuestion}>
        {isSending ? t("workbench.chat.sending") : t("workbench.chat.send")}
      </Button>
    </form>
  );
}

function ChatBubble({
  message,
  isLast,
  isReading = false,
  isPlayingTts = false,
  isStartingTts = false,
  isDownloadingTts = false,
  ttsAudio,
  onRead,
  onPlayTtsAudio,
  onPauseTtsAudio,
  onDownloadTtsAudio,
}: {
  message: ChatMessage;
  isLast: boolean;
  isReading?: boolean;
  isPlayingTts?: boolean;
  isStartingTts?: boolean;
  isDownloadingTts?: boolean;
  ttsAudio?: SupertonicChatTtsArtifact;
  onRead?(renderedText: string): void;
  onPlayTtsAudio?(audio: SupertonicChatTtsArtifact): void;
  onPauseTtsAudio?(audio: SupertonicChatTtsArtifact): void;
  onDownloadTtsAudio?(audio: SupertonicChatTtsArtifact): void;
}) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isActionRegionFocused, setIsActionRegionFocused] = useState(false);
  const [isActionRegionHovered, setIsActionRegionHovered] = useState(false);
  const hasUsage = Boolean(message.tokenUsage);
  const showActions = isLast || isActionRegionFocused || isActionRegionHovered;
  const renderedText = () =>
    renderedChatTextFromElement(contentRef.current, message.content);

  return (
    <li
      tabIndex={isLast ? undefined : 0}
      className={cn(
        "focus-visible:ring-ring flex flex-col rounded-md focus:outline-none focus-visible:ring-2",
        message.role === "user" ? "items-end" : "items-start",
      )}
      onFocusCapture={() => setIsActionRegionFocused(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }

        setIsActionRegionFocused(false);
      }}
      onPointerEnter={() => setIsActionRegionHovered(true)}
      onPointerLeave={() => setIsActionRegionHovered(false)}
    >
      <div
        ref={contentRef}
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <MarkdownRenderer markdown={message.content} />
      </div>
      <div className="mt-1 flex h-7 items-center gap-1">
        {showActions ? (
          <>
            <CopyActionButton
              value={message.content}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              ariaLabel={t("workbench.chat.copyMessage")}
            />
            {ttsAudio && onPlayTtsAudio ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isStartingTts}
                      aria-label={t(
                        isPlayingTts
                          ? "workbench.chat.pauseVoiceMessage"
                          : "workbench.chat.playVoiceMessage",
                      )}
                      onClick={() =>
                        isPlayingTts
                          ? onPauseTtsAudio?.(ttsAudio)
                          : onPlayTtsAudio(ttsAudio)
                      }
                    >
                      {isStartingTts ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : isPlayingTts ? (
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(
                      isPlayingTts
                        ? "workbench.chat.pauseVoiceMessage"
                        : "workbench.chat.playVoiceMessage",
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {onRead ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isReading}
                      aria-label={t(
                        ttsAudio
                          ? "workbench.chat.regenerateVoiceMessage"
                          : "workbench.chat.readMessage",
                      )}
                      onClick={() => onRead(renderedText())}
                    >
                      {isReading ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : ttsAudio ? (
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(
                      ttsAudio
                        ? "workbench.chat.regenerateVoiceMessage"
                        : "workbench.chat.readMessage",
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {ttsAudio && onDownloadTtsAudio ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isDownloadingTts}
                      aria-label={t("workbench.chat.downloadVoiceMessage")}
                      onClick={() => onDownloadTtsAudio(ttsAudio)}
                    >
                      {isDownloadingTts ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("workbench.chat.downloadVoiceMessage")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {hasUsage ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("workbench.chat.tokenUsage")}
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-sm" align="end">
                  <div className="mb-2 font-medium">
                    {t("workbench.chat.tokenUsage")}
                  </div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">
                      {t("workbench.chat.tokens.input")}
                    </dt>
                    <dd className="font-mono">
                      {formatTokenCount(message.tokenUsage?.inputTokens)}
                    </dd>
                    <dt className="text-muted-foreground">
                      {t("workbench.chat.tokens.cached")}
                    </dt>
                    <dd className="font-mono">
                      {formatTokenCount(message.tokenUsage?.cachedInputTokens)}
                    </dd>
                    <dt className="text-muted-foreground">
                      {t("workbench.chat.tokens.output")}
                    </dt>
                    <dd className="font-mono">
                      {formatTokenCount(message.tokenUsage?.outputTokens)}
                    </dd>
                    <dt className="text-muted-foreground">
                      {t("workbench.chat.tokens.total")}
                    </dt>
                    <dd className="font-mono">
                      {formatTokenCount(message.tokenUsage?.totalTokens)}
                    </dd>
                  </dl>
                </PopoverContent>
              </Popover>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

function renderedChatTextFromElement(
  element: HTMLElement | null,
  fallbackText: string,
) {
  if (!element) return normalizeRenderedChatText(fallbackText);

  return normalizeRenderedChatText(extractRenderedText(element));
}

function extractRenderedText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(extractRenderedText).join(" ");
  }

  if (node.tagName === "BR") return "\n";

  const text = Array.from(node.childNodes).map(extractRenderedText).join(" ");
  return isRenderedTextBlock(node.tagName) ? `\n${text}\n` : text;
}

function isRenderedTextBlock(tagName: string) {
  return [
    "BLOCKQUOTE",
    "DIV",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "OL",
    "P",
    "PRE",
    "TABLE",
    "TD",
    "TH",
    "TR",
    "UL",
  ].includes(tagName);
}

function normalizeRenderedChatText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function chatTtsAudioForMessage(
  audio: SupertonicChatTtsArtifact | undefined,
  message: Pick<ChatMessage, "id">,
) {
  if (!audio) return undefined;
  return chatTtsAudioBelongsToMessage(audio, message) ? audio : undefined;
}

function chatTtsAudioBelongsToMessage(
  audio: Pick<SupertonicChatTtsArtifact, "audioPath">,
  message: Pick<ChatMessage, "id">,
) {
  const normalizedAudioPath = audio.audioPath.replace(/\\/g, "/");
  const expectedDirectory = `/chat/tts/${sanitizeChatTtsMessagePathSegment(message.id)}/`;

  return (
    normalizedAudioPath.includes(expectedDirectory) ||
    normalizedAudioPath.startsWith(expectedDirectory.slice(1))
  );
}

function sanitizeChatTtsMessagePathSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 96);

  return sanitized || "item";
}

function StreamingChatDraft({ draftText }: { draftText: string }) {
  return (
    <div className="flex items-start">
      <div className="bg-muted text-foreground max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed">
        <MarkdownRenderer markdown={draftText} />
      </div>
    </div>
  );
}

function ChatProviderDialog({
  provider,
  model,
  streamingMode,
  onProviderChange,
  onModelChange,
  onStreamingModeChange,
}: {
  provider: ProviderKind;
  model: string;
  streamingMode: boolean;
  onProviderChange(provider: ProviderKind): void;
  onModelChange(model: string): void;
  onStreamingModeChange(streamingMode: boolean): void;
}) {
  const { t } = useI18n();
  const label = `${t("workbench.chat.provider")} / ${t("workbench.summary.model")}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-fit max-w-full justify-start gap-2 px-3 text-left"
          aria-label={label}
        >
          <ProviderIcon provider={provider} size={16} decorative />
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {providerLabels[provider]} · {shortProviderModelName(model)}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {t("setup.provider.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.provider")}</span>
            <ProviderSelect
              value={provider}
              triggerClassName="w-full"
              onChange={onProviderChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.model")}</span>
            <ProviderModelSelect
              provider={provider}
              value={model}
              triggerClassName="w-full"
              onChange={onModelChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("workbench.chat.streaming")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={streamingMode}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                streamingMode
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => onStreamingModeChange(!streamingMode)}
            >
              <span>{t("workbench.chat.streamingMode")}</span>
              <span className="text-xs">
                {streamingMode
                  ? t("workbench.chat.streamingOn")
                  : t("workbench.chat.streamingOff")}
              </span>
            </button>
            <p className="text-muted-foreground text-xs">
              {t("workbench.chat.streamingDescription")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VideoTabStrip({
  videos,
  activeVideoId,
  onSelectVideoTab,
  onCloseVideoTab,
  onAddVideo,
}: {
  videos: VideoAsset[];
  activeVideoId: string;
  onSelectVideoTab?(videoId: string): void;
  onCloseVideoTab?(videoId: string): void;
  onAddVideo?(): void;
}) {
  const { t } = useI18n();

  if (videos.length === 0 && !onAddVideo) return null;

  return (
    <div
      role="tablist"
      aria-label={t("workbench.tabs.videos")}
      className="flex min-h-10 items-center gap-2 overflow-x-auto pb-2"
    >
      {videos.map((tabVideo) => {
        const isActive = tabVideo.id === activeVideoId;

        return (
          <div
            key={tabVideo.id}
            className={`flex max-w-72 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm ${
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground"
            } group`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className="min-w-0 truncate px-1 py-1 text-left"
              onClick={() => onSelectVideoTab?.(tabVideo.id)}
            >
              {tabVideo.title}
            </button>
            {videos.length > 1 ? (
              <button
                type="button"
                aria-label={t("workbench.tabs.closeVideo", {
                  title: tabVideo.title,
                })}
                className={`rounded p-1 ${
                  isActive ? "hover:bg-primary-foreground/20" : "hover:bg-muted"
                } opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100`}
                onClick={() => onCloseVideoTab?.(tabVideo.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
      {onAddVideo ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 self-center"
                aria-label={t("workbench.tabs.addVideo")}
                onClick={onAddVideo}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("workbench.tabs.addVideo")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

function SummaryProviderDialog({
  provider,
  model,
  streamingMode,
  onProviderChange,
  onModelChange,
  onStreamingModeChange,
}: {
  provider: ProviderKind;
  model: string;
  streamingMode: boolean;
  onProviderChange(provider: ProviderKind): void;
  onModelChange(model: string): void;
  onStreamingModeChange(streamingMode: boolean): void;
}) {
  const { t } = useI18n();
  const label = `${t("workbench.summary.provider")} / ${t("workbench.summary.model")}`;
  const shortModelName = shortProviderModelName(model);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 max-w-[12rem] shrink-0 justify-start gap-2 px-2.5 text-left"
          aria-label={`${label}: ${providerLabels[provider]} ${shortModelName}`}
        >
          <ProviderIcon provider={provider} size={16} decorative />
          <span
            className="text-muted-foreground min-w-0 truncate text-xs"
            aria-hidden="true"
          >
            {providerLabels[provider]} · {shortModelName}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {t("setup.provider.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.provider")}</span>
            <ProviderSelect
              value={provider}
              triggerClassName="w-full"
              onChange={onProviderChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.model")}</span>
            <ProviderModelSelect
              provider={provider}
              value={model}
              triggerClassName="w-full"
              onChange={onModelChange}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">
              {t("workbench.summary.streaming")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={streamingMode}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                streamingMode
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => onStreamingModeChange(!streamingMode)}
            >
              <span>{t("workbench.summary.streamingMode")}</span>
              <span className="text-xs">
                {streamingMode
                  ? t("workbench.summary.streamingOn")
                  : t("workbench.summary.streamingOff")}
              </span>
            </button>
            <p className="text-muted-foreground text-xs">
              {t("workbench.summary.streamingDescription")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TranscriptActionPanel({
  variants,
  activeVariantId,
  baseTranscriptLabel,
  targetLanguage,
  duplicateTranslation,
  isReviewing,
  isTranslating,
  translateDialogOpen,
  onVariantChange,
  onTargetLanguageChange,
  onReview,
  onTranslate,
  onTranslateDialogOpenChange,
  onConfirmTranslate,
  onOverlay,
}: {
  variants: TranscriptVariant[];
  activeVariantId: string;
  baseTranscriptLabel: string;
  targetLanguage: TranscriptLanguageOption;
  duplicateTranslation?: TranscriptVariant;
  isReviewing: boolean;
  isTranslating: boolean;
  translateDialogOpen: boolean;
  onVariantChange(variantId: string): void;
  onTargetLanguageChange(language: TranscriptLanguageOption): void;
  onReview(): void;
  onTranslate(): void;
  onTranslateDialogOpenChange(open: boolean): void;
  onConfirmTranslate(): void;
  onOverlay?(): void;
}) {
  const { t } = useI18n();

  return (
    <div className="border-border grid gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Select value={activeVariantId} onValueChange={onVariantChange}>
          <SelectTrigger
            className="h-9 min-w-0 flex-1"
            aria-label={t("workbench.transcript.variant.select")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">{baseTranscriptLabel}</SelectItem>
            {variants.map((variant) => (
              <SelectItem key={variant.id} value={variant.id}>
                {variant.languageLabel ??
                  t("workbench.transcript.variant.reviewed")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TooltipProvider delayDuration={150}>
        <div className="openbrief-transcript-actions grid grid-cols-3 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="openbrief-transcript-action-button min-w-0 gap-1.5"
                disabled={isReviewing}
                aria-label={
                  isReviewing
                    ? t("workbench.transcript.review.running")
                    : t("workbench.transcript.review")
                }
                onClick={onReview}
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="openbrief-transcript-action-label truncate">
                  {isReviewing
                    ? t("workbench.transcript.review.running")
                    : t("workbench.transcript.review")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isReviewing
                ? t("workbench.transcript.review.running")
                : t("workbench.transcript.review")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="openbrief-transcript-action-button min-w-0 gap-1.5"
                disabled={isTranslating}
                aria-label={
                  isTranslating
                    ? t("workbench.transcript.translate.running")
                    : t("workbench.transcript.translate")
                }
                onClick={onTranslate}
              >
                <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="openbrief-transcript-action-label truncate">
                  {isTranslating
                    ? t("workbench.transcript.translate.running")
                    : t("workbench.transcript.translate")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isTranslating
                ? t("workbench.transcript.translate.running")
                : t("workbench.transcript.translate")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="openbrief-transcript-action-button min-w-0 gap-1.5"
                aria-label={t("workbench.transcript.overlay")}
                onClick={onOverlay}
              >
                <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="openbrief-transcript-action-label truncate">
                  {t("workbench.transcript.overlay")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("workbench.transcript.overlay")}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <Dialog
        open={translateDialogOpen}
        onOpenChange={onTranslateDialogOpenChange}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("workbench.transcript.translate.title")}
            </DialogTitle>
            <DialogDescription>
              {t("workbench.transcript.translate.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Select
              value={targetLanguage.code}
              onValueChange={(languageCode) => {
                const language =
                  transcriptTranslationLanguages.find(
                    (candidate) => candidate.code === languageCode,
                  ) ?? transcriptTranslationLanguages[0];
                onTargetLanguageChange(language);
              }}
            >
              <SelectTrigger
                aria-label={t("workbench.transcript.translate.language")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transcriptTranslationLanguages.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {duplicateTranslation ? (
              <div
                role="alert"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
              >
                {t("workbench.transcript.translate.duplicate", {
                  language: targetLanguage.label,
                })}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onTranslateDialogOpenChange(false)}
            >
              {t("workbench.transcript.translate.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isTranslating}
              onClick={onConfirmTranslate}
            >
              {isTranslating
                ? t("workbench.transcript.translate.running")
                : t("workbench.transcript.translate.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTabStrip({
  summaries,
  activeSummaryId,
  onSelectSummaryTab,
}: {
  summaries: SummaryDocument[];
  activeSummaryId?: string;
  onSelectSummaryTab?(summaryId: string): void;
}) {
  const { t } = useI18n();

  if (summaries.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t("workbench.tabs.summaries")}
      className="flex gap-2 overflow-x-auto"
    >
      {summaries.map((tabSummary, index) => {
        const isActive = tabSummary.id === activeSummaryId;

        return (
          <button
            key={tabSummary.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium ${
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:bg-muted"
            }`}
            onClick={() => onSelectSummaryTab?.(tabSummary.id)}
          >
            {t("workbench.tabs.summary", {
              index: summaries.length - index,
              provider: tabSummary.provider,
            })}
          </button>
        );
      })}
    </div>
  );
}

function BriefModeControl({
  value,
  options,
  onChange,
}: {
  value: BriefMode;
  options: Array<{ value: BriefMode; label: string }>;
  onChange(value: BriefMode): void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            badgeVariants({
              variant: value === option.value ? "default" : "outline",
            }),
            "cursor-pointer",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChatContextControl({
  value,
  options,
  onChange,
}: {
  value: ChatContextMode;
  options: Array<{ value: ChatContextMode; label: string }>;
  onChange(value: ChatContextMode): void;
}) {
  const { t } = useI18n();

  if (options.length <= 2) {
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn(
              badgeVariants({
                variant: value === option.value ? "default" : "outline",
              }),
              "cursor-pointer",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.chat.context")}
      value={value}
      triggerClassName="h-8 w-36"
      onValueChange={(nextValue) => onChange(nextValue as ChatContextMode)}
      options={options}
    />
  );
}

function normalizeVideoTabs(
  openVideos: VideoAsset[],
  activeVideo?: VideoAsset,
) {
  if (!activeVideo) return openVideos;

  if (openVideos.some((video) => video.id === activeVideo.id)) {
    return openVideos;
  }

  return [activeVideo, ...openVideos];
}

function normalizeSummaryTabs(
  summaries: SummaryDocument[] | undefined,
  latestSummary: SummaryDocument | undefined,
) {
  const tabs = [...(summaries ?? [])];

  if (
    latestSummary &&
    !tabs.some((summary) => summary.id === latestSummary.id)
  ) {
    tabs.unshift(latestSummary);
  }

  return tabs.sort((left, right) => {
    return (
      (Date.parse(right.createdAtIso) || 0) -
      (Date.parse(left.createdAtIso) || 0)
    );
  });
}

function findActiveTranscriptSegment(
  transcript: TranscriptSegment[],
  currentTimeSeconds: number,
) {
  if (transcript.length === 0) return undefined;

  return transcript.find((segment, index) => {
    const nextSegment = transcript[index + 1];
    const endSeconds = segment.endSeconds ?? nextSegment?.startSeconds;

    if (endSeconds === undefined) {
      return currentTimeSeconds >= segment.startSeconds;
    }

    return (
      currentTimeSeconds >= segment.startSeconds &&
      currentTimeSeconds < endSeconds
    );
  });
}

export function nextVoiceCloneTranscriptSegmentSelection(
  transcript: TranscriptSegment[],
  selectedIds: string[],
  toggledId: string,
) {
  const toggledIndex = transcript.findIndex(
    (segment) => segment.id === toggledId,
  );
  if (toggledIndex < 0) return selectedIds;

  const selectedIndexes = selectedIds
    .map((segmentId) =>
      transcript.findIndex((segment) => segment.id === segmentId),
    )
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const alreadySelected = selectedIndexes.includes(toggledIndex);

  const nextIndexes = alreadySelected
    ? selectedIndexes.filter((index) => index !== toggledIndex)
    : [...selectedIndexes, toggledIndex].sort((a, b) => a - b);

  if (nextIndexes.length === 0) return [];
  if (nextIndexes.length > 3) return [transcript[toggledIndex].id];

  const isContiguous = nextIndexes.every(
    (index, offset) => offset === 0 || index === nextIndexes[offset - 1] + 1,
  );
  if (!isContiguous) return [transcript[toggledIndex].id];

  return nextIndexes.map((index) => transcript[index].id);
}

function TranscriptProgressCard({
  transcriptJob,
}: {
  transcriptJob: TranscriptJob;
}) {
  const { t } = useI18n();
  const progressPercent = Math.round(
    Math.max(0, Math.min(transcriptJob.progressPercent, 100)),
  );
  const sourceLabel =
    transcriptJob.preferredSource === "local-stt"
      ? t("workbench.transcript.localStt")
      : t("workbench.transcript.captions");
  const statusLabel =
    transcriptJob.status === "running" &&
    transcriptJob.preferredSource === "local-stt" &&
    progressPercent < 60
      ? t("workbench.transcript.preparingTranscription")
      : sourceLabel;

  if (transcriptJob.status === "completed") {
    return null;
  }

  return (
    <div
      role={transcriptJob.status === "failed" ? "alert" : "status"}
      className="border-border bg-muted/40 rounded-md border p-3 text-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">
          {transcriptJob.status === "failed"
            ? t("workbench.transcript.failed")
            : statusLabel}
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          {progressPercent}%
        </span>
      </div>
      <div
        className="bg-background h-2 overflow-hidden rounded-full"
        aria-label={t("workbench.transcript.progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        role="progressbar"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {transcriptJob.errorMessage ? (
        <p className="text-destructive mt-2 text-xs">
          {transcriptJob.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function AiGenerationStatus({
  job,
  runningLabel,
  failedLabel,
}: {
  job: AiGenerationJob;
  runningLabel: string;
  failedLabel: string;
}) {
  return (
    <div
      role={job.status === "failed" ? "alert" : "status"}
      className="border-border bg-muted/40 mb-3 rounded-md border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {job.status === "failed" ? failedLabel : runningLabel}
        </span>
        <span className="text-muted-foreground text-xs">
          {job.provider}
          {job.model ? ` · ${shortProviderModelName(job.model)}` : ""}
        </span>
      </div>
      {job.errorMessage ? (
        <p className="text-destructive mt-1 text-xs">{job.errorMessage}</p>
      ) : null}
    </div>
  );
}

function ProviderSelect({
  value,
  triggerClassName,
  onChange,
}: {
  value: ProviderKind;
  triggerClassName?: string;
  onChange(value: ProviderKind): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.provider")}
      value={value}
      triggerClassName={triggerClassName}
      onValueChange={(nextValue) => onChange(nextValue as ProviderKind)}
      options={providerOptions.map((provider) => ({
        value: provider,
        label: providerLabels[provider],
        icon: <ProviderIcon provider={provider} size={18} decorative />,
      }))}
    />
  );
}

function ProviderModelSelect({
  provider,
  value,
  triggerClassName,
  onChange,
}: {
  provider: ProviderKind;
  value: string;
  triggerClassName?: string;
  onChange(value: string): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.model")}
      value={value}
      triggerClassName={triggerClassName}
      onValueChange={onChange}
      options={providerModelOptions[provider].map((model) => ({
        value: model,
        label: model,
      }))}
    />
  );
}

function SummaryTemplateSelect({
  value,
  triggerClassName,
  onChange,
}: {
  value: VideoSummaryTemplateId;
  triggerClassName?: string;
  onChange(value: VideoSummaryTemplateId): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.template")}
      value={value}
      triggerClassName={triggerClassName}
      onValueChange={(nextValue) =>
        onChange(nextValue as VideoSummaryTemplateId)
      }
      options={videoSummaryTemplates.map((template) => ({
        value: template.id,
        label: template.label,
      }))}
    />
  );
}

function SummaryLengthSelect({
  value,
  triggerClassName,
  onChange,
}: {
  value: SummaryLengthMode;
  triggerClassName?: string;
  onChange(value: SummaryLengthMode): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.length")}
      value={value}
      triggerClassName={triggerClassName}
      onValueChange={(nextValue) => onChange(nextValue as SummaryLengthMode)}
      options={(
        Object.keys(summaryLengthModeLabels) as SummaryLengthMode[]
      ).map((mode) => ({
        value: mode,
        label: summaryLengthModeLabels[mode],
      }))}
    />
  );
}

function SummaryLanguageSelect({
  value,
  triggerClassName,
  onChange,
}: {
  value: string;
  triggerClassName?: string;
  onChange(value: SummaryOutputLanguageOption): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.language")}
      value={value}
      triggerClassName={cn("w-44", triggerClassName)}
      onValueChange={(nextValue) => {
        const option =
          summaryOutputLanguageOptions.find(
            (candidate) => candidate.code === nextValue,
          ) ?? summaryOutputLanguageOptions[0];
        onChange(option);
      }}
      options={summaryOutputLanguageOptions.map((option) => ({
        value: option.code,
        label: option.label,
      }))}
    />
  );
}

function WorkbenchSelect({
  ariaLabel,
  value,
  triggerClassName,
  onValueChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  triggerClassName?: string;
  onValueChange(value: string): void;
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("h-10 w-52", triggerClassName)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedOption?.icon ? (
            <span className="shrink-0">{selectedOption.icon}</span>
          ) : null}
          <span className="min-w-0 truncate">
            {selectedOption?.label ?? value}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            textValue={option.label}
          >
            <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
              {option.icon ? (
                <span className="shrink-0">{option.icon}</span>
              ) : null}
              <span className="min-w-0 truncate">{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function workbenchTabShortcutDirection(event: KeyboardEvent) {
  if (event.code === "BracketLeft" || event.key === "[") {
    return -1;
  }

  if (event.code === "BracketRight" || event.key === "]") {
    return 1;
  }

  return 0;
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatPodcastTimestamp(totalSeconds: number) {
  return formatTime(Math.max(0, totalSeconds));
}

function formatTokenCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

export function shortProviderModelName(model: string) {
  const chunks = model.split(/[/:]/).filter(Boolean);
  return chunks[chunks.length - 1] ?? model;
}
