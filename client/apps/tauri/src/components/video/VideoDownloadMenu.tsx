import type { MediaSourceType, VideoAsset } from "@/domain/media-library";
import type { VideoArtifactDownloadKind } from "@/services/artifactExportService";
import { mediaSourceTypeForAsset } from "@/domain/media-library";
import { useI18n } from "@/i18n";
import { Download } from "lucide-react";

import type { ButtonProps } from "@acme/ui/button";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";

type VideoDownloadMenuButtonProps = {
  video: VideoAsset;
  hasTranscript: boolean;
  hasSummary?: boolean;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onDownloadArtifact?(kind: VideoArtifactDownloadKind): void;
} & Pick<ButtonProps, "className" | "variant" | "size">;

type VideoDownloadItem = {
  id: string;
  label: string;
  downloadKind?: VideoArtifactDownloadKind;
};

export function VideoDownloadMenuButton({
  video,
  hasTranscript,
  hasSummary = false,
  className,
  contentClassName,
  variant = "outline",
  size = "icon",
  side = "bottom",
  align = "end",
  onDownloadArtifact,
}: VideoDownloadMenuButtonProps) {
  const { t } = useI18n();
  const items = createVideoDownloadItems({
    sourceType: mediaSourceTypeForAsset(video),
    hasTranscript,
    hasSummary,
    t,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          aria-label={t("finder.download.openMenu", { title: video.title })}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        className={cn("w-56 p-1", contentClassName)}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="px-3 py-2"
            disabled={!item.downloadKind || !onDownloadArtifact}
            onSelect={() => {
              if (item.downloadKind) {
                onDownloadArtifact?.(item.downloadKind);
              }
            }}
          >
            <span className="font-medium">{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function createVideoDownloadItems({
  sourceType,
  hasTranscript,
  hasSummary,
  t,
}: {
  sourceType: MediaSourceType;
  hasTranscript: boolean;
  hasSummary: boolean;
  t(key: string, values?: Record<string, string | number>): string;
}): VideoDownloadItem[] {
  const sourceItems: VideoDownloadItem[] =
    sourceType === "video"
      ? [
          {
            id: "video",
            downloadKind: "video" as const,
            label: t("finder.download.video"),
          },
          {
            id: "thumbnail",
            downloadKind: "thumbnail" as const,
            label: t("finder.download.thumbnail"),
          },
          {
            id: "audio",
            downloadKind: "audio" as const,
            label: t("finder.download.audio"),
          },
        ]
      : sourceType === "audio"
        ? [
            {
              id: "audio",
              downloadKind: "audio" as const,
              label: t("finder.download.audio"),
            },
          ]
        : sourceType === "pdf"
          ? [
              {
                id: "pdf",
                downloadKind: "pdf" as const,
                label: t("finder.download.pdf"),
              },
            ]
          : [
              {
                id: "csv",
                downloadKind: "csv" as const,
                label: t("finder.download.csv"),
              },
            ];

  return [
    ...sourceItems,
    ...(hasTranscript
      ? [
          {
            id: "transcription",
            downloadKind: "transcription" as const,
            label: t("finder.download.transcription"),
          },
        ]
      : []),
    ...(hasSummary
      ? [
          {
            id: "summary",
            downloadKind: "summary" as const,
            label: t("finder.download.summary"),
          },
        ]
      : []),
  ];
}
