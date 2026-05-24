import { FileAudio, FileText, ImageIcon, Play } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  isVideoAsset,
  mediaSourceTypeForAsset,
  type MediaSourceType,
  type VideoAsset,
} from "@/domain/media-library";
import { generateVideoThumbnail } from "@/services/browserThumbnail";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
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
  const canPlay = sourceType !== "pdf" && Boolean(onPlayMedia);

  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-t-md bg-muted",
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        aria-label={openLabel}
        onClick={() => onOpenMedia(media.id)}
      >
        {isVideoAsset(media) ? (
          <ResolvedThumbnailImage media={media} />
        ) : (
          <MediaTypePlaceholder sourceType={sourceType} />
        )}
      </button>
      {canPlay ? (
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded-full bg-background/90 p-1.5 text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {isVideoAsset(media) ? (
        <ResolvedThumbnailImage media={media} />
      ) : (
        <MediaTypePlaceholder sourceType={sourceType} />
      )}
      {children}
    </div>
  );
}

function MediaTypePlaceholder({ sourceType }: { sourceType: MediaSourceType }) {
  const Icon = sourceType === "audio" ? FileAudio : FileText;

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
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
  const [failedGeneratedThumbnail, setFailedGeneratedThumbnail] = useState(false);

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
    canRetryProvidedThumbnail: Boolean(media.thumbnailPath && !failedProvidedThumbnail),
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
    return <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />;
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
