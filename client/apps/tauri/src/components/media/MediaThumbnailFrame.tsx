import type { MediaSourceType, VideoAsset } from "@/domain/media-library";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { isVideoAsset, mediaSourceTypeForAsset } from "@/domain/media-library";
import { generateVideoThumbnail } from "@/services/browserThumbnail";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import {
  FileAudio,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Play,
} from "lucide-react";

import { cn } from "@acme/ui";

type MediaThumbnailFrameProps = {
  media: VideoAsset;
  openLabel: string;
  playLabel?: string;
  className?: string;
  onOpenMedia(mediaId: string): void;
  onPlayMedia?(mediaId: string): void;
};

export function MediaThumbnailFrame({
  media,
  openLabel,
  playLabel,
  className,
  onOpenMedia,
  onPlayMedia,
}: MediaThumbnailFrameProps) {
  const sourceType = mediaSourceTypeForAsset(media);
  const canPlay =
    (sourceType === "video" || sourceType === "audio") && Boolean(onPlayMedia);

  return (
    <div
      className={cn(
        "bg-muted relative flex aspect-video items-center justify-center overflow-hidden rounded-t-md",
        className,
      )}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <MediaThumbnailContent media={media} sourceType={sourceType} />
      </div>
      <button
        type="button"
        className="focus:ring-ring absolute inset-0 z-10 focus:ring-2 focus:outline-none focus:ring-inset"
        aria-label={openLabel}
        onClick={() => onOpenMedia(media.id)}
      />
      {canPlay ? (
        <button
          type="button"
          className="bg-background/90 text-foreground hover:bg-background focus:ring-ring absolute right-2 bottom-2 z-20 rounded-full p-1.5 shadow-sm transition-colors focus:ring-2 focus:outline-none"
          aria-label={playLabel ?? openLabel}
          onClick={() => onPlayMedia?.(media.id)}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

type MediaPreviewFrameProps = {
  media: VideoAsset;
  className?: string;
  children?: ReactNode;
};

export function MediaPreviewFrame({
  media,
  className,
  children,
}: MediaPreviewFrameProps) {
  const sourceType = mediaSourceTypeForAsset(media);

  return (
    <div
      className={cn(
        "bg-muted relative flex aspect-video items-center justify-center overflow-hidden rounded-md",
        className,
      )}
    >
      <MediaThumbnailContent media={media} sourceType={sourceType} />
      {children}
    </div>
  );
}

function MediaThumbnailContent({
  media,
  sourceType,
}: {
  media: VideoAsset;
  sourceType: MediaSourceType;
}) {
  if (isVideoAsset(media)) {
    return <ResolvedThumbnailImage media={media} />;
  }

  if (sourceType === "pdf") {
    return <ResolvedPdfThumbnail media={media} />;
  }

  return <MediaTypePlaceholder sourceType={sourceType} />;
}

function MediaTypePlaceholder({ sourceType }: { sourceType: MediaSourceType }) {
  const Icon =
    sourceType === "audio"
      ? FileAudio
      : sourceType === "csv"
        ? FileSpreadsheet
        : FileText;

  return (
    <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center">
      <Icon className="h-10 w-10" aria-hidden="true" />
    </div>
  );
}

export function useResolvedVideoThumbnailSrc(media: VideoAsset) {
  const [src, setSrc] = useState<string | undefined>(() => {
    if (!media.thumbnailPath || canUseTauriRuntime()) return undefined;
    return media.thumbnailPath;
  });
  const [failedProvidedThumbnail, setFailedProvidedThumbnail] = useState(false);
  const [failedGeneratedThumbnail, setFailedGeneratedThumbnail] =
    useState(false);

  useEffect(() => {
    setFailedProvidedThumbnail(false);
    setFailedGeneratedThumbnail(false);
  }, [media.id, media.libraryPath, media.thumbnailPath]);

  useEffect(() => {
    let cancelled = false;

    async function resolveThumbnail() {
      setSrc(undefined);

      if (media.thumbnailPath && !failedProvidedThumbnail) {
        if (!canUseTauriRuntime()) {
          setSrc(media.thumbnailPath);
          return;
        }

        try {
          const resolvedSrc = await resolveLibraryAssetUrl(media.thumbnailPath);

          if (!cancelled) {
            setSrc(resolvedSrc);
          }
          return;
        } catch {
          if (!cancelled) {
            setSrc(undefined);
          }
        }
      }

      if (failedGeneratedThumbnail) return;

      try {
        const generatedSrc = await generateVideoThumbnail(media.libraryPath, {
          isDestroyed: () => cancelled,
        });
        if (!cancelled) {
          setSrc(generatedSrc);
        }
      } catch {
        if (!cancelled) {
          setSrc(undefined);
        }
      }
    }

    void resolveThumbnail();

    return () => {
      cancelled = true;
    };
  }, [
    failedGeneratedThumbnail,
    failedProvidedThumbnail,
    media.id,
    media.libraryPath,
    media.thumbnailPath,
  ]);

  return {
    src,
    canRetryProvidedThumbnail: Boolean(
      media.thumbnailPath && !failedProvidedThumbnail,
    ),
    markProvidedThumbnailFailed: () => setFailedProvidedThumbnail(true),
    markGeneratedThumbnailFailed: () => {
      setFailedGeneratedThumbnail(true);
      setSrc(undefined);
    },
  };
}

function ResolvedThumbnailImage({ media }: { media: VideoAsset }) {
  const {
    canRetryProvidedThumbnail,
    src,
    markGeneratedThumbnailFailed,
    markProvidedThumbnailFailed,
  } = useResolvedVideoThumbnailSrc(media);

  if (!src) {
    return (
      <ImageIcon className="text-muted-foreground h-7 w-7" aria-hidden="true" />
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      title={media.title}
      onError={() => {
        if (canRetryProvidedThumbnail) {
          markProvidedThumbnailFailed();
          return;
        }

        markGeneratedThumbnailFailed();
      }}
    />
  );
}

function ResolvedPdfThumbnail({ media }: { media: VideoAsset }) {
  const src = useResolvedPdfThumbnailSrc(media);

  if (!src) {
    return <MediaTypePlaceholder sourceType="pdf" />;
  }

  return (
    <div className="bg-background relative h-full w-full overflow-hidden">
      <iframe
        title={media.title}
        src={src}
        className="bg-background pointer-events-none absolute inset-x-0 top-0 h-full w-full border-0"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

function useResolvedPdfThumbnailSrc(media: VideoAsset) {
  const [src, setSrc] = useState<string | undefined>(() => {
    if (canUseTauriRuntime()) return undefined;
    return pdfThumbnailUrl(media.libraryPath);
  });

  useEffect(() => {
    let cancelled = false;

    async function resolvePdfThumbnail() {
      setSrc(
        canUseTauriRuntime() ? undefined : pdfThumbnailUrl(media.libraryPath),
      );

      try {
        const resolvedSrc = await resolveLibraryAssetUrl(media.libraryPath);

        if (!cancelled) {
          setSrc(pdfThumbnailUrl(resolvedSrc));
        }
      } catch {
        if (!cancelled) {
          setSrc(undefined);
        }
      }
    }

    void resolvePdfThumbnail();

    return () => {
      cancelled = true;
    };
  }, [media.libraryPath]);

  return src;
}

function pdfThumbnailUrl(src: string | undefined) {
  if (!src) return undefined;

  const baseUrl = src.split("#")[0];
  return `${baseUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
}
