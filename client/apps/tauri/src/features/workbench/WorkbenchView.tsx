import {
  Bot,
  Check,
  Download,
  Eye,
  FileText,
  Info,
  Languages,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Subtitles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyActionButton } from "@/components/CopyAction";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { badgeVariants } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@acme/ui/popover";
import { Textarea } from "@acme/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";
import { MarkdownSummaryEditor } from "@/components/markdown/MarkdownSummaryEditor";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { PdfViewer } from "@/components/media/PdfViewer";
import { ProviderIcon } from "@/components/provider/ProviderIcon";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import type {
  ChatMessage,
  ProviderKind,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import type { ChatContextMode } from "@/domain/chat";
import type { AiGenerationJob } from "@/hooks/useMediaLibrary";
import type { VideoPlaybackState } from "@/hooks/useVideoPlayback";
import {
  defaultProviderModels,
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import {
  transcriptSourceKindLabel,
  transcriptTranslationLanguages,
  type TranscriptLanguageOption,
  type TranscriptVariant,
} from "@/domain/transcript-actions";
import {
  summaryLengthModeLabels,
  summaryOutputLanguageOptions,
  videoSummaryTemplates,
  type SummaryLengthMode,
  type SummaryOutputLanguageOption,
  type VideoSummaryTemplateId,
} from "@/domain/summary";
import type { AiWorkflowProviderConfig } from "@/services/aiProviderPreferencesService";
import { useI18n } from "@/i18n";
import { cn } from "@acme/ui";

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
  const [question, setQuestion] = useState("");
  const [isExtractingTranscript, setIsExtractingTranscript] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [isTranslatingTranscript, setIsTranslatingTranscript] = useState(false);
  const [isTranslateDialogOpen, setIsTranslateDialogOpen] = useState(false);
  const [targetTranslationLanguage, setTargetTranslationLanguage] =
    useState<TranscriptLanguageOption>(transcriptTranslationLanguages[0]);
  const [editingTranscriptSegmentId, setEditingTranscriptSegmentId] =
    useState<string>();
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [focusedTranscriptSegmentId, setFocusedTranscriptSegmentId] =
    useState<string>();
  const [hoveredTranscriptSegmentId, setHoveredTranscriptSegmentId] =
    useState<string>();
  const transcriptItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const transcriptListRef = useRef<HTMLOListElement | null>(null);
  const isTranscribing = transcriptJob?.status === "running";
  const isSummarizing = summaryJob?.status === "running";
  const isSendingChat = chatJob?.status === "running";
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
  const summaryMarkdown =
    summaryJob?.draftText ?? activeSummary?.markdown;
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
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t("workbench.empty")}
        </p>
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

  async function runTranscriptTranslation(language = targetTranslationLanguage) {
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

  async function submitChat() {
    const submittedQuestion = question.trim();
    if (!submittedQuestion || isSendingChat) return;

    setQuestion("");
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
    }
  }

  function seekToSegment(segment: TranscriptSegment) {
    if (!video) return;

    onPlayVideo(video.id);
    onVideoTimeUpdate(video.id, segment.startSeconds);
  }

  function startTranscriptEdit(segment: TranscriptSegment) {
    setEditingTranscriptSegmentId(segment.id);
    setTranscriptDraft(segment.text);
  }

  function hideTranscriptEditAction() {
    setFocusedTranscriptSegmentId(undefined);
    setHoveredTranscriptSegmentId(undefined);
  }

  function cancelTranscriptEdit() {
    setEditingTranscriptSegmentId(undefined);
    setTranscriptDraft("");
    hideTranscriptEditAction();
  }

  function saveTranscriptEdit(segment: TranscriptSegment) {
    const nextText = transcriptDraft.trim();
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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.95fr)_minmax(320px,1.1fr)_minmax(280px,0.95fr)] gap-4">
      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {isInlinePlayerSuppressed ? (
            <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
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
              onVariantChange={(variantId) => onSelectTranscriptVariant?.(variantId)}
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
                <p className="text-sm text-muted-foreground">
                  {isTranscribing
                    ? t("workbench.transcript.running")
                    : t("workbench.transcript.empty")}
                </p>
                {!isTranscribing ? (
                  <div
                    aria-label={t("workbench.transcript.exampleLabel")}
                    className="space-y-2 rounded-md bg-muted/50 p-3 text-sm"
                  >
                    <span className={badgeVariants({ variant: "outline" })}>
                      {t("workbench.transcript.exampleBadge")}
                    </span>
                    <div className="flex gap-3">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        00:12
                      </span>
                      <span>{t("workbench.transcript.example.one")}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        00:47
                      </span>
                      <span>{t("workbench.transcript.example.two")}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        01:18
                      </span>
                      <span>{t("workbench.transcript.example.three")}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <ol ref={transcriptListRef} className="space-y-3">
                {renderedTranscript.map((segment) => {
                  const sourceSegment = activeTranslationVariant
                    ? sourceTranscriptBySegmentId.get(segment.id)
                    : undefined;
                  const isActive = segment.id === activeTranscriptSegmentId;
                  const isEditing = segment.id === editingTranscriptSegmentId;
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
                            "mt-1 rounded-sm font-mono text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                            isActive && "text-primary",
                          )}
                          onClick={() => seekToSegment(segment)}
                          aria-label={t("workbench.transcript.jumpTo", {
                            time: formatTime(segment.startSeconds),
                          })}
                        >
                          {formatTime(segment.startSeconds)}
                        </button>
                        {isEditing ? (
                          <form
                            className="min-w-0 flex-1 space-y-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveTranscriptEdit(segment);
                            }}
                          >
                            <Textarea
                              autoFocus
                              value={transcriptDraft}
                              aria-label={t("workbench.transcript.editLabel", {
                                time: formatTime(segment.startSeconds),
                              })}
                              className="min-h-20 resize-y bg-background text-sm"
                              onChange={(event) =>
                                setTranscriptDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelTranscriptEdit();
                                }
                              }}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={cancelTranscriptEdit}
                              >
                                {t("workbench.transcript.cancelEdit")}
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={!transcriptDraft.trim()}
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                                {t("workbench.transcript.saveEdit")}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="min-w-0 flex-1 rounded-sm bg-transparent p-0 text-left leading-relaxed text-inherit hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                                  <span className="border-l-2 border-primary/40 pl-3 text-foreground">
                                    {segment.text}
                                  </span>
                                </span>
                              ) : (
                                segment.text
                              )}
                            </button>
                            {onUpdateTranscriptSegment && !isViewingTranscriptVariant ? (
                              <span className="h-7 w-7 shrink-0">
                                {showActiveEditButton ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label={t("workbench.transcript.edit", {
                                      time: formatTime(segment.startSeconds),
                                    })}
                                    onClick={() => startTranscriptEdit(segment)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
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
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("workbench.summary.title")}</span>
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
          <div className="flex flex-wrap gap-2">
            <SummaryTemplateSelect
              value={summaryTemplateId}
              onChange={setSummaryTemplateId}
            />
            <SummaryLengthSelect
              value={summaryLengthMode}
              onChange={setSummaryLengthMode}
            />
            <SummaryLanguageSelect
              value={summaryLanguage.code}
              onChange={setSummaryLanguage}
            />
            <Button
              type="button"
              disabled={isSummarizing || transcript.length === 0}
              onClick={() => {
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
              }}
            >
              <Bot className="mr-2 h-4 w-4" aria-hidden="true" />
              {isSummarizing
                ? t("workbench.summary.generating")
                : t("workbench.summary.action")}
            </Button>
            {activeSummary ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSummarizing}
                onClick={() => onSaveMarkdown(activeSummary.id)}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("workbench.summary.save")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {transcript.length === 0 ? (
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
          <SummaryTabStrip
            summaries={summaryTabs}
            activeSummaryId={activeSummary?.id}
            onSelectSummaryTab={onSelectSummaryTab}
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-4">
            {summaryJob ? (
              <AiGenerationStatus
                job={summaryJob}
                runningLabel={t("workbench.summary.generating")}
                failedLabel={t("workbench.summary.failed")}
              />
            ) : null}
            {summaryMarkdown ? (
              <MarkdownSummaryEditor
                markdown={summaryMarkdown}
                editable={Boolean(activeSummary && onUpdateSummaryMarkdown)}
                ariaLabel={t("workbench.summary.editor")}
                onMarkdownChange={(markdown) =>
                  activeSummary
                    ? onUpdateSummaryMarkdown?.(activeSummary.id, markdown)
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("workbench.summary.empty")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t("workbench.chat.title")}</span>
                <span className="text-muted-foreground">{t("workbench.chat.with")}</span>
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
                    onClick={onResetChat}
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
            {chatMessages.length === 0 ? (
              <p className="text-muted-foreground">
                {t("workbench.chat.empty")}
              </p>
            ) : (
              <ol className="space-y-4">
                {chatMessages.map((message, index) => (
                  <ChatBubble
                    key={message.id}
                    message={message}
                    isLast={index === chatMessages.length - 1}
                  />
                ))}
              </ol>
            )}
            {chatJob ? (
              <AiGenerationStatus
                job={chatJob}
                runningLabel={t("workbench.chat.sending")}
                failedLabel={t("workbench.chat.failed")}
              />
            ) : null}
            {chatJob?.status === "running" && chatJob.streamingMode && chatJob.draftText ? (
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
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submitChat();
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
              <Button type="submit" disabled={isSendingChat || !question.trim()}>
                {isSendingChat ? t("workbench.chat.sending") : t("workbench.chat.send")}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  isLast,
}: {
  message: ChatMessage;
  isLast: boolean;
}) {
  const { t } = useI18n();
  const [isActionRegionFocused, setIsActionRegionFocused] = useState(false);
  const [isActionRegionHovered, setIsActionRegionHovered] = useState(false);
  const hasUsage = Boolean(message.tokenUsage);
  const showActions = isLast || isActionRegionFocused || isActionRegionHovered;

  return (
    <li
      tabIndex={isLast ? undefined : 0}
      className={cn(
        "flex flex-col rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      <p
        className={cn(
          "max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 leading-relaxed",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {message.content}
      </p>
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

function StreamingChatDraft({ draftText }: { draftText: string }) {
  return (
    <div className="flex items-start">
      <p className="max-w-[88%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
        {draftText}
      </p>
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
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {providerLabels[provider]} · {shortProviderModelName(model)}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{t("setup.provider.description")}</DialogDescription>
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
            <p className="text-xs text-muted-foreground">
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
                  isActive
                    ? "hover:bg-primary-foreground/20"
                    : "hover:bg-muted"
                } opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`}
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
            className="min-w-0 truncate text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {providerLabels[provider]} · {shortModelName}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{t("setup.provider.description")}</DialogDescription>
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
            <span className="font-medium">{t("workbench.summary.streaming")}</span>
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
            <p className="text-xs text-muted-foreground">
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
    <div className="grid gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <Select value={activeVariantId} onValueChange={onVariantChange}>
          <SelectTrigger
            className="h-9 min-w-0 flex-1"
            aria-label={t("workbench.transcript.variant.select")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">
              {baseTranscriptLabel}
            </SelectItem>
            {variants.map((variant) => (
              <SelectItem key={variant.id} value={variant.id}>
                {variant.languageLabel ??
                  t("workbench.transcript.variant.reviewed")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isReviewing}
          onClick={onReview}
        >
          <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {isReviewing
            ? t("workbench.transcript.review.running")
            : t("workbench.transcript.review")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isTranslating}
          onClick={onTranslate}
        >
          <Languages className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {isTranslating
            ? t("workbench.transcript.translate.running")
            : t("workbench.transcript.translate")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOverlay}
        >
          <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("workbench.transcript.overlay")}
        </Button>
      </div>
      <Dialog
        open={translateDialogOpen}
        onOpenChange={onTranslateDialogOpenChange}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workbench.transcript.translate.title")}</DialogTitle>
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
              <SelectTrigger aria-label={t("workbench.transcript.translate.language")}>
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

function normalizeVideoTabs(openVideos: VideoAsset[], activeVideo?: VideoAsset) {
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

function TranscriptProgressCard({ transcriptJob }: { transcriptJob: TranscriptJob }) {
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
      className="rounded-md border border-border bg-muted/40 p-3 text-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">
          {transcriptJob.status === "failed"
            ? t("workbench.transcript.failed")
            : statusLabel}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {progressPercent}%
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-background"
        aria-label={t("workbench.transcript.progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {transcriptJob.errorMessage ? (
        <p className="mt-2 text-xs text-destructive">{transcriptJob.errorMessage}</p>
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
      className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {job.status === "failed" ? failedLabel : runningLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {job.provider}
          {job.model ? ` · ${job.model}` : ""}
        </span>
      </div>
      {job.errorMessage ? (
        <p className="mt-1 text-xs text-destructive">{job.errorMessage}</p>
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
  onChange,
}: {
  value: VideoSummaryTemplateId;
  onChange(value: VideoSummaryTemplateId): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.template")}
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as VideoSummaryTemplateId)}
      options={videoSummaryTemplates.map((template) => ({
        value: template.id,
        label: template.label,
      }))}
    />
  );
}

function SummaryLengthSelect({
  value,
  onChange,
}: {
  value: SummaryLengthMode;
  onChange(value: SummaryLengthMode): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.length")}
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as SummaryLengthMode)}
      options={(Object.keys(summaryLengthModeLabels) as SummaryLengthMode[]).map(
        (mode) => ({
          value: mode,
          label: summaryLengthModeLabels[mode],
        }),
      )}
    />
  );
}

function SummaryLanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange(value: SummaryOutputLanguageOption): void;
}) {
  const { t } = useI18n();

  return (
    <WorkbenchSelect
      ariaLabel={t("workbench.summary.language")}
      value={value}
      triggerClassName="w-44"
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
      <SelectTrigger aria-label={ariaLabel} className={cn("h-10 w-52", triggerClassName)}>
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

function formatTokenCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

export function shortProviderModelName(model: string) {
  const chunks = model.split(/[/:]/).filter(Boolean);
  return chunks[chunks.length - 1] ?? model;
}
