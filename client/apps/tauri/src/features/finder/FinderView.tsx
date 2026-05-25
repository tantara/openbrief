import type { DownloadRecoveryActionKind } from "@/domain/download-error";
import type {
  IngestJob,
  MediaSourceType,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
  VideoLibraryQuery,
  VideoLibrarySortKey,
} from "@/domain/media-library";
import type { PodcastDocument } from "@/domain/podcast";
import type { TranslationKey } from "@/i18n";
import type { VideoArtifactDownloadKind } from "@/services/artifactExportService";
import type { LocalFileDialogService } from "@/services/localFileDialogService";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  CopyActionButton,
  CopyDropdownMenuItem,
} from "@/components/CopyAction";
import { MediaThumbnailFrame } from "@/components/media/MediaThumbnailFrame";
import { VideoDownloadMenuButton } from "@/components/video/VideoDownloadMenu";
import {
  filterVideoLibrary,
  mediaSourceTypeForAsset,
} from "@/domain/media-library";
import { AddVideoForm } from "@/features/finder/AddVideoForm";
import { useI18n } from "@/i18n";
import {
  isOpenableWebUrl,
  openExternalWebUrl,
  providerLabelForWebUrl,
} from "@/services/externalUrlService";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  HardDrive,
  Link,
  MoreVertical,
  Notebook,
  Plus,
  RotateCcw,
  Subtitles,
  X,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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

type FinderViewProps = {
  videos: VideoAsset[];
  ingestJobs?: IngestJob[];
  transcriptsByVideoId?: Record<string, TranscriptSegment[]>;
  summariesByVideoId?: Record<string, SummaryDocument>;
  podcastsByVideoId?: Record<string, PodcastDocument>;
  selectedVideoId?: string;
  query?: VideoLibraryQuery;
  onQueryChange?(query: VideoLibraryQuery): void;
  onImportLocalFile(sourcePath: string): Promise<unknown>;
  onImportYoutubeUrl(url: string): Promise<unknown>;
  onCancelIngestJob?(jobId: string): Promise<unknown>;
  onRemoveFailedIngestJob?(jobId: string): void;
  onDownloadRecoveryAction?(
    job: IngestJob,
    actionKind: DownloadRecoveryActionKind,
  ): void;
  onRenameVideoTitle?(videoId: string, title: string): void;
  onDeleteVideo?(videoId: string): void;
  onDownloadArtifact?(
    video: VideoAsset,
    kind: VideoArtifactDownloadKind,
    transcript?: TranscriptSegment[],
  ): void;
  onOpenTutorial?(): void;
  onAddVideo?(): void;
  onOpenVideo(videoId: string): void;
  onPlayVideo?(videoId: string): void;
  fileDialogService?: LocalFileDialogService;
};

const finderPageSize = 24;

export function FinderView({
  videos,
  ingestJobs = [],
  transcriptsByVideoId = {},
  summariesByVideoId = {},
  podcastsByVideoId = {},
  query,
  onQueryChange,
  onImportLocalFile,
  onImportYoutubeUrl,
  onCancelIngestJob,
  onRemoveFailedIngestJob,
  onDownloadRecoveryAction,
  onRenameVideoTitle,
  onDeleteVideo,
  onDownloadArtifact,
  onOpenTutorial,
  onAddVideo,
  onOpenVideo,
  onPlayVideo,
  fileDialogService,
}: FinderViewProps) {
  const [internalQuery, setInternalQuery] = useState<VideoLibraryQuery>({
    sourceKind: "all",
    transcriptStatus: "all",
    summaryStatus: "all",
    podcastStatus: "all",
    sortBy: "created_at",
    page: 1,
  });
  const activeQuery = query ?? internalQuery;
  const updateQuery = onQueryChange ?? setInternalQuery;
  const visibleVideos = useMemo(
    () =>
      filterVideoLibrary({
        videos,
        transcriptsByVideoId,
        summariesByVideoId,
        podcastsByVideoId,
        query: activeQuery,
      }),
    [
      activeQuery,
      podcastsByVideoId,
      summariesByVideoId,
      transcriptsByVideoId,
      videos,
    ],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(visibleVideos.length / finderPageSize),
  );
  const currentPage = clampPage(activeQuery.page, pageCount);
  const pageStartIndex = (currentPage - 1) * finderPageSize;
  const pagedVideos = visibleVideos.slice(
    pageStartIndex,
    pageStartIndex + finderPageSize,
  );

  return (
    <div className="space-y-5">
      <IngestControls
        onImportLocalFile={onImportLocalFile}
        onImportYoutubeUrl={onImportYoutubeUrl}
        fileDialogService={fileDialogService}
        onOpenTutorial={onOpenTutorial}
      />
      <IngestJobList
        ingestJobs={ingestJobs}
        onCancelIngestJob={onCancelIngestJob}
        onRemoveFailedIngestJob={onRemoveFailedIngestJob}
        onRetryFailedIngestJob={async (job) => {
          const url = ingestJobSourceUrl(job);
          if (!url) return;

          await onImportYoutubeUrl(url);
          onRemoveFailedIngestJob?.(job.id);
        }}
        onDownloadRecoveryAction={onDownloadRecoveryAction}
      />
      {videos.length > 0 ? (
        <VideoLibraryControls
          query={activeQuery}
          onQueryChange={updateQuery}
          resultCount={visibleVideos.length}
          totalCount={videos.length}
          currentPage={currentPage}
          pageCount={pageCount}
        />
      ) : null}
      {videos.length === 0 ? (
        <FinderEmptyState onAddVideo={onAddVideo} />
      ) : visibleVideos.length === 0 ? (
        <FinderNoMatches onAddVideo={onAddVideo} />
      ) : (
        <VideoGrid
          videos={pagedVideos}
          transcriptsByVideoId={transcriptsByVideoId}
          summariesByVideoId={summariesByVideoId}
          onRenameVideoTitle={onRenameVideoTitle}
          onDeleteVideo={onDeleteVideo}
          onDownloadArtifact={onDownloadArtifact}
          onOpenVideo={onOpenVideo}
          onPlayVideo={onPlayVideo}
        />
      )}
    </div>
  );
}

function VideoLibraryControls({
  query,
  onQueryChange,
  resultCount,
  totalCount,
  currentPage,
  pageCount,
}: {
  query: VideoLibraryQuery;
  onQueryChange(query: VideoLibraryQuery): void;
  resultCount: number;
  totalCount: number;
  currentPage: number;
  pageCount: number;
}) {
  const { t } = useI18n();
  function patchQuery(patch: Partial<VideoLibraryQuery>) {
    onQueryChange({
      ...query,
      ...patch,
      page: patch.page ?? 1,
    });
  }

  return (
    <div className="border-border bg-card rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {t("finder.filter.shortLabel")}
        </span>
        <FilterChip
          active={(query.transcriptStatus ?? "all") === "with-transcript"}
          onClick={() =>
            patchQuery({
              transcriptStatus:
                query.transcriptStatus === "with-transcript"
                  ? "all"
                  : "with-transcript",
            })
          }
        >
          {t("finder.filter.transcript.with")}
        </FilterChip>
        <FilterChip
          active={(query.transcriptStatus ?? "all") === "without-transcript"}
          onClick={() =>
            patchQuery({
              transcriptStatus:
                query.transcriptStatus === "without-transcript"
                  ? "all"
                  : "without-transcript",
            })
          }
        >
          {t("finder.filter.transcript.without")}
        </FilterChip>
        <FilterChip
          active={(query.summaryStatus ?? "all") === "with-summary"}
          onClick={() =>
            patchQuery({
              summaryStatus:
                query.summaryStatus === "with-summary" ? "all" : "with-summary",
            })
          }
        >
          {t("finder.filter.summary.with")}
        </FilterChip>
        <FilterChip
          active={(query.summaryStatus ?? "all") === "without-summary"}
          onClick={() =>
            patchQuery({
              summaryStatus:
                query.summaryStatus === "without-summary"
                  ? "all"
                  : "without-summary",
            })
          }
        >
          {t("finder.filter.summary.without")}
        </FilterChip>
        <FilterChip
          active={(query.podcastStatus ?? "all") === "with-podcast"}
          onClick={() =>
            patchQuery({
              podcastStatus:
                query.podcastStatus === "with-podcast" ? "all" : "with-podcast",
            })
          }
        >
          {t("finder.filter.podcast.with")}
        </FilterChip>
        <FilterChip
          active={(query.podcastStatus ?? "all") === "without-podcast"}
          onClick={() =>
            patchQuery({
              podcastStatus:
                query.podcastStatus === "without-podcast"
                  ? "all"
                  : "without-podcast",
            })
          }
        >
          {t("finder.filter.podcast.without")}
        </FilterChip>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            {t("finder.sort.shortLabel")}
          </span>
          <FinderSelect
            ariaLabel={t("finder.sort.label")}
            value={query.sortBy ?? "created_at"}
            onValueChange={(value) =>
              patchQuery({
                sortBy: value as VideoLibrarySortKey,
              })
            }
            triggerClassName="h-8 w-32"
            groups={[
              {
                label: t("finder.sort.group.date"),
                options: [
                  { value: "created_at", label: t("finder.sort.createdAt") },
                  {
                    value: "created_at_asc",
                    label: t("finder.sort.createdAtAsc"),
                  },
                ],
              },
              {
                label: t("finder.sort.group.length"),
                options: [
                  { value: "time", label: t("finder.sort.time") },
                  { value: "time_asc", label: t("finder.sort.timeAsc") },
                ],
              },
              {
                label: t("finder.sort.group.size"),
                options: [
                  { value: "size", label: t("finder.sort.size") },
                  { value: "size_asc", label: t("finder.sort.sizeAsc") },
                ],
              },
            ]}
          />
          <PaginationButton
            label={t("finder.pagination.previous")}
            disabled={currentPage <= 1}
            onClick={() => patchQuery({ page: currentPage - 1 })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </PaginationButton>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={t("finder.pagination.status")}
                  className="text-muted-foreground min-w-9 cursor-default text-center text-sm"
                >
                  {currentPage}/{pageCount}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {resultCount} of {totalCount}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PaginationButton
            label={t("finder.pagination.next")}
            disabled={currentPage >= pageCount}
            onClick={() => patchQuery({ page: currentPage + 1 })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </PaginationButton>
        </div>
      </div>
    </div>
  );
}

function FinderSelect({
  ariaLabel,
  value,
  onValueChange,
  options,
  groups,
  triggerClassName = "h-9 w-44",
}: {
  ariaLabel: string;
  value: string;
  onValueChange(value: string): void;
  options?: Array<{ value: string; label: string }>;
  groups?: Array<{
    label: string;
    options: Array<{ value: string; label: string }>;
  }>;
  triggerClassName?: string;
}) {
  const optionGroups =
    groups ?? (options ? [{ label: undefined, options }] : []);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel} className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {optionGroups.map((group, index) => (
          <SelectGroup key={group.label ?? `group-${index}`}>
            {index > 0 ? <SelectSeparator /> : null}
            {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-8 rounded-full px-3 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function PaginationButton({
  label,
  disabled,
  children,
  onClick,
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function IngestControls({
  onImportLocalFile,
  onImportYoutubeUrl,
  fileDialogService,
  onOpenTutorial,
}: Pick<
  FinderViewProps,
  | "onImportLocalFile"
  | "onImportYoutubeUrl"
  | "fileDialogService"
  | "onOpenTutorial"
>) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t("finder.import.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t("finder.import.description")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <AddVideoForm
            onImportLocalFile={onImportLocalFile}
            onImportYoutubeUrl={onImportYoutubeUrl}
            fileDialogService={fileDialogService}
            inputId="finder-video-url"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("finder.howTo.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t("finder.howTo.description")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="text-muted-foreground space-y-2 text-sm">
            <li>{t("finder.howTo.step.download")}</li>
            <li>{t("finder.howTo.step.transcript")}</li>
            <li>{t("finder.howTo.step.summary")}</li>
            <li>{t("finder.howTo.step.chat")}</li>
          </ol>
          <Button variant="ghost" className="w-fit px-3" asChild>
            <a
              href="/tutorial"
              onClick={(event) => {
                if (!onOpenTutorial) return;
                event.preventDefault();
                onOpenTutorial();
              }}
            >
              {t("finder.howTo.openTutorial")}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function IngestJobList({
  ingestJobs,
  onCancelIngestJob,
  onRemoveFailedIngestJob,
  onRetryFailedIngestJob,
  onDownloadRecoveryAction,
}: {
  ingestJobs: IngestJob[];
  onCancelIngestJob?: (jobId: string) => Promise<unknown>;
  onRemoveFailedIngestJob?: (jobId: string) => void;
  onRetryFailedIngestJob?: (job: IngestJob) => Promise<unknown>;
  onDownloadRecoveryAction?: (
    job: IngestJob,
    actionKind: DownloadRecoveryActionKind,
  ) => void;
}) {
  const visibleJobs = ingestJobs.filter((job) => job.status !== "completed");

  if (visibleJobs.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {visibleJobs.map((job) => (
        <IngestJobItem
          key={job.id}
          job={job}
          onCancelIngestJob={onCancelIngestJob}
          onRemoveFailedIngestJob={onRemoveFailedIngestJob}
          onRetryFailedIngestJob={onRetryFailedIngestJob}
          onDownloadRecoveryAction={onDownloadRecoveryAction}
        />
      ))}
    </div>
  );
}

function IngestJobItem({
  job,
  onCancelIngestJob,
  onRemoveFailedIngestJob,
  onRetryFailedIngestJob,
  onDownloadRecoveryAction,
}: {
  job: IngestJob;
  onCancelIngestJob?: (jobId: string) => Promise<unknown>;
  onRemoveFailedIngestJob?: (jobId: string) => void;
  onRetryFailedIngestJob?: (job: IngestJob) => Promise<unknown>;
  onDownloadRecoveryAction?: (
    job: IngestJob,
    actionKind: DownloadRecoveryActionKind,
  ) => void;
}) {
  const { t } = useI18n();
  const sourceUrl = ingestJobSourceUrl(job);

  return (
    <div className="border-border bg-card rounded-md border px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium">
          {job.title ?? job.originalUri ?? job.sourceKind}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={job.status === "failed" ? "text-destructive" : undefined}
          >
            {t(jobStatusKey(job.status))}
          </span>
          {onCancelIngestJob && ["queued", "running"].includes(job.status) ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={t("finder.job.cancel", {
                sourceKind: job.sourceKind,
              })}
              onClick={() => void onCancelIngestJob(job.id)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {onRemoveFailedIngestJob && job.status === "failed" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={t("finder.job.removeFailed")}
              onClick={() => onRemoveFailedIngestJob(job.id)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between gap-3">
        <span>{job.sourceKind}</span>
        <span>{Math.round(job.progressPercent)}%</span>
      </div>
      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full"
          style={{ width: `${job.progressPercent}%` }}
        />
      </div>
      {job.errorMessage ? (
        <p className="text-muted-foreground mt-2">
          {job.errorKind
            ? t(downloadErrorKey(job.errorKind))
            : job.errorMessage}
        </p>
      ) : null}
      {job.status === "failed" && sourceUrl ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyActionButton
            value={sourceUrl}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            ariaLabel={t("finder.job.copyFailedUrl")}
          >
            {t("finder.job.copy")}
          </CopyActionButton>
          {onRetryFailedIngestJob ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label={t("finder.job.retryFailed")}
              onClick={() => void onRetryFailedIngestJob(job)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("finder.job.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {job.recoveryActions?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {job.recoveryActions.map((action) => (
            <Button
              key={action.kind}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              title={t(recoveryActionDescriptionKey(action.kind))}
              onClick={() => onDownloadRecoveryAction?.(job, action.kind)}
            >
              {t(recoveryActionLabelKey(action.kind))}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ingestJobSourceUrl(job: IngestJob) {
  if (job.originalUri && isOpenableWebUrl(job.originalUri)) {
    return job.originalUri;
  }

  if (job.title && isOpenableWebUrl(job.title)) {
    return job.title;
  }

  return undefined;
}

function jobStatusKey(status: IngestJob["status"]): TranslationKey {
  switch (status) {
    case "queued":
      return "finder.job.status.queued";
    case "running":
      return "finder.job.status.running";
    case "failed":
      return "finder.job.status.failed";
    case "completed":
      return "finder.job.status.completed";
    case "cancelled":
      return "finder.job.status.cancelled";
  }
}

function downloadErrorKey(
  errorKind: NonNullable<IngestJob["errorKind"]>,
): TranslationKey {
  switch (errorKind) {
    case "yt-dlp-outdated":
      return "download.error.yt-dlp-outdated";
    case "youtube-sabr-forbidden":
      return "download.error.youtube-sabr-forbidden";
    case "rate-limited":
      return "download.error.rate-limited";
    case "network-offline":
      return "download.error.network-offline";
    case "private-video":
      return "download.error.private-video";
    case "cookies-required":
      return "download.error.cookies-required";
    case "credentials-required":
      return "download.error.credentials-required";
    case "video-password-required":
      return "download.error.video-password-required";
    case "geo-restricted":
      return "download.error.geo-restricted";
    case "not-found":
      return "download.error.not-found";
    case "forbidden":
      return "download.error.forbidden";
    case "helper-unavailable":
      return "download.error.helper-unavailable";
    case "unknown":
      return "download.error.unknown";
  }
}

function recoveryActionLabelKey(
  actionKind: DownloadRecoveryActionKind,
): TranslationKey {
  return `download.recovery.${actionKind}.label` as TranslationKey;
}

function recoveryActionDescriptionKey(
  actionKind: DownloadRecoveryActionKind,
): TranslationKey {
  return `download.recovery.${actionKind}.description` as TranslationKey;
}

function FinderEmptyState({ onAddVideo }: { onAddVideo?(): void }) {
  const { t } = useI18n();

  return (
    <div className="border-border bg-card flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
      <p className="text-muted-foreground text-sm">{t("finder.empty")}</p>
      {onAddVideo ? (
        <Button type="button" variant="outline" onClick={onAddVideo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("finder.import.title")}
        </Button>
      ) : null}
    </div>
  );
}

function FinderNoMatches({ onAddVideo }: { onAddVideo?(): void }) {
  const { t } = useI18n();

  return (
    <div className="border-border bg-card flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
      <p className="text-muted-foreground text-sm">{t("finder.noMatches")}</p>
      {onAddVideo ? (
        <Button type="button" variant="outline" onClick={onAddVideo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("finder.import.title")}
        </Button>
      ) : null}
    </div>
  );
}

function VideoGrid({
  videos,
  transcriptsByVideoId,
  summariesByVideoId,
  onRenameVideoTitle,
  onDeleteVideo,
  onDownloadArtifact,
  onOpenVideo,
  onPlayVideo,
}: Pick<
  FinderViewProps,
  | "videos"
  | "transcriptsByVideoId"
  | "summariesByVideoId"
  | "onRenameVideoTitle"
  | "onDeleteVideo"
  | "onDownloadArtifact"
  | "onOpenVideo"
  | "onPlayVideo"
>) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {videos.map((video) => {
        const sourceType = mediaSourceTypeForAsset(video);
        const hasTranscript =
          (transcriptsByVideoId?.[video.id]?.length ?? 0) > 0;
        const hasSummary = Boolean(summariesByVideoId?.[video.id]);
        const canOpenInNote = sourceType === "pdf" || sourceType === "csv";
        const canHaveTranscript =
          sourceType === "video" || sourceType === "audio";

        return (
          <Card key={video.id}>
            <MediaThumbnailFrame
              media={video}
              openLabel={t("finder.openThumbnail", { title: video.title })}
              playLabel={t("finder.play", { title: video.title })}
              onOpenMedia={onOpenVideo}
              onPlayMedia={onPlayVideo}
            />
            <CardContent className="space-y-3 pt-4">
              <div>
                <div className="flex items-start gap-2">
                  <h2 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold">
                    {video.title}
                  </h2>
                  <VideoTitleActions
                    video={video}
                    onRenameVideoTitle={onRenameVideoTitle}
                    onDeleteVideo={onDeleteVideo}
                  />
                </div>
                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    {mediaSourceTypeLabel(sourceType, t)} · {video.importStatus}
                  </span>
                  {canOpenInNote ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto shrink-0 px-0 py-0 text-xs"
                      aria-label={t("finder.openInNote", {
                        title: video.title,
                      })}
                      onClick={() => onOpenVideo(video.id)}
                    >
                      <Notebook className="h-3 w-3" aria-hidden="true" />
                      {t("finder.open")}
                    </Button>
                  ) : null}
                </div>
                <VideoAuthorLink video={video} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canHaveTranscript ? (
                  <FinderStatusPill active={hasTranscript}>
                    <Subtitles className="h-3 w-3" aria-hidden="true" />
                    {hasTranscript
                      ? t("finder.badge.transcript")
                      : t("finder.badge.noTranscript")}
                  </FinderStatusPill>
                ) : null}
                <FinderStatusPill active={hasSummary}>
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {hasSummary
                    ? t("finder.badge.summary")
                    : t("finder.badge.noSummary")}
                </FinderStatusPill>
              </div>
              <dl className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <dt className="sr-only">{t("finder.meta.length")}</dt>
                  <dd>{formatContentLength(video, t)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                  <dt className="sr-only">{t("finder.meta.fileSize")}</dt>
                  <dd>{formatBytes(video.fileSizeBytes)}</dd>
                </div>
              </dl>
              <div className="relative flex gap-2">
                <Button
                  type="button"
                  className="min-w-0 flex-1"
                  onClick={() => onOpenVideo(video.id)}
                >
                  {t("finder.open")}
                </Button>
                <VideoDownloadMenuButton
                  video={video}
                  hasTranscript={hasTranscript}
                  hasSummary={hasSummary}
                  side="top"
                  align="end"
                  onDownloadArtifact={(kind) => {
                    if (kind === "transcription") {
                      onDownloadArtifact?.(
                        video,
                        kind,
                        transcriptsByVideoId?.[video.id],
                      );
                      return;
                    }

                    onDownloadArtifact?.(video, kind);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FinderStatusPill({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (active) {
    return (
      <Badge variant="outline" className="gap-1">
        {children}
      </Badge>
    );
  }

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      {children}
    </span>
  );
}

function VideoAuthorLink({ video }: { video: VideoAsset }) {
  const { t } = useI18n();
  const authorName = video.authorName ?? video.channelName;

  if (!authorName) return null;

  const authorUrl = video.authorUrl;

  if (authorUrl) {
    return (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs"
        onClick={(event) => {
          event.stopPropagation();
          void openExternalWebUrl(authorUrl);
        }}
      >
        <Link className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t("finder.meta.author")}</span>
        <span className="truncate">{authorName}</span>
      </button>
    );
  }

  return (
    <p className="text-muted-foreground mt-1 truncate text-xs">
      <span className="sr-only">{t("finder.meta.author")}</span>
      {authorName}
    </p>
  );
}

function VideoTitleActions({
  video,
  onRenameVideoTitle,
  onDeleteVideo,
}: {
  video: VideoAsset;
  onRenameVideoTitle?: (videoId: string, title: string) => void;
  onDeleteVideo?: (videoId: string) => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"edit" | "delete" | undefined>();
  const canOpenOriginalUrl = isOpenableWebUrl(video.originalUri);
  const providerLabel = providerLabelForWebUrl(video.originalUri);
  const actionKindLabel = t(mediaKindLabelKey(video));

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mt-2 -mr-2 h-8 w-8 shrink-0"
            aria-label={t("finder.actions.open", {
              kind: actionKindLabel,
              title: video.title,
            })}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-40">
          {canOpenOriginalUrl && providerLabel ? (
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                void openExternalWebUrl(video.originalUri);
              }}
            >
              {t("finder.actions.openProvider", { provider: providerLabel })}
            </DropdownMenuItem>
          ) : null}
          {canOpenOriginalUrl ? (
            <CopyDropdownMenuItem
              value={video.originalUri}
              onCopied={() => setMenuOpen(false)}
            >
              {t("finder.actions.copyLink")}
            </CopyDropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              setMenuOpen(false);
              setDialogMode("edit");
            }}
          >
            {t("finder.actions.editTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              setMenuOpen(false);
              setDialogMode("delete");
            }}
          >
            {t("finder.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogMode === "edit" ? (
        <EditVideoTitleDialog
          video={video}
          onClose={() => setDialogMode(undefined)}
          onSave={(title) => {
            onRenameVideoTitle?.(video.id, title);
            setDialogMode(undefined);
          }}
        />
      ) : null}
      {dialogMode === "delete" ? (
        <DeleteVideoDialog
          video={video}
          onClose={() => setDialogMode(undefined)}
          onDelete={() => {
            onDeleteVideo?.(video.id);
            setDialogMode(undefined);
          }}
        />
      ) : null}
    </>
  );
}

function EditVideoTitleDialog({
  video,
  onClose,
  onSave,
}: {
  video: VideoAsset;
  onClose(): void;
  onSave(title: string): void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(video.title);
  const trimmedTitle = title.trim();

  return (
    <FinderDialog
      title={t("finder.editTitle.title")}
      description={t("finder.editTitle.description")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("finder.dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!trimmedTitle}
            onClick={() => onSave(trimmedTitle)}
          >
            {t("finder.editTitle.save")}
          </Button>
        </>
      }
    >
      <label
        className="text-sm font-medium"
        htmlFor={`video-title-${video.id}`}
      >
        {t("finder.editTitle.label")}
      </label>
      <Textarea
        id={`video-title-${video.id}`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="mt-2 min-h-24 resize-y"
        autoFocus
      />
    </FinderDialog>
  );
}

function DeleteVideoDialog({
  video,
  onClose,
  onDelete,
}: {
  video: VideoAsset;
  onClose(): void;
  onDelete(): void;
}) {
  const { t } = useI18n();
  const sourceType = mediaSourceTypeForAsset(video);

  return (
    <FinderDialog
      title={t(deleteTitleKey(sourceType))}
      description={t(deleteDescriptionKey(sourceType), {
        title: video.title,
      })}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("finder.dialog.cancel")}
          </Button>
          <Button type="button" variant="default" onClick={onDelete}>
            {t("finder.delete.confirm")}
          </Button>
        </>
      }
    />
  );
}

function mediaKindLabelKey(video: VideoAsset): TranslationKey {
  const sourceType = mediaSourceTypeForAsset(video);

  switch (sourceType) {
    case "audio":
      return "finder.media.audio";
    case "csv":
      return "finder.media.csv";
    case "pdf":
      return "finder.media.pdf";
    case "video":
      return "finder.media.video";
  }

  return assertNeverMediaSourceType(sourceType);
}

function deleteTitleKey(
  sourceType: ReturnType<typeof mediaSourceTypeForAsset>,
): TranslationKey {
  switch (sourceType) {
    case "audio":
      return "finder.delete.title.audio";
    case "csv":
      return "finder.delete.title.csv";
    case "pdf":
      return "finder.delete.title.pdf";
    case "video":
      return "finder.delete.title.video";
  }

  return assertNeverMediaSourceType(sourceType);
}

function deleteDescriptionKey(
  sourceType: ReturnType<typeof mediaSourceTypeForAsset>,
): TranslationKey {
  switch (sourceType) {
    case "audio":
      return "finder.delete.description.audio";
    case "csv":
      return "finder.delete.description.csv";
    case "pdf":
      return "finder.delete.description.pdf";
    case "video":
      return "finder.delete.description.video";
  }

  return assertNeverMediaSourceType(sourceType);
}

function assertNeverMediaSourceType(sourceType: never): never {
  throw new Error(`Unhandled media source type: ${sourceType}`);
}

function FinderDialog({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  footer: ReactNode;
  onClose(): void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatContentLength(
  video: VideoAsset,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
) {
  if (mediaSourceTypeForAsset(video) === "pdf") {
    return video.pageCount && video.pageCount > 0
      ? t(video.pageCount === 1 ? "finder.meta.page" : "finder.meta.pages", {
          count: video.pageCount,
        })
      : "—";
  }

  return formatDuration(video.durationSeconds);
}

function formatDuration(durationSeconds?: number) {
  if (!durationSeconds || durationSeconds <= 0) return "—";
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes = 0) {
  if (bytes <= 0) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mediaSourceTypeLabel(
  sourceType: MediaSourceType,
  t: (key: TranslationKey) => string,
) {
  switch (sourceType) {
    case "audio":
      return t("finder.mediaType.audio");
    case "csv":
      return t("finder.mediaType.csv");
    case "pdf":
      return t("finder.mediaType.pdf");
    case "video":
      return t("finder.mediaType.video");
  }
}

function clampPage(page: number | undefined, pageCount: number) {
  if (!page || !Number.isFinite(page)) return 1;

  return Math.min(Math.max(1, Math.trunc(page)), pageCount);
}
