import { Music, PictureInPicture2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/media-library";
import { useI18n } from "@/i18n";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";

type AudioPlayerProps = {
  media: VideoAsset;
  activeMediaId?: string;
  isPlaying: boolean;
  currentTimeSeconds: number;
  onPlay(mediaId: string): void;
  onPause(mediaId: string): void;
  onTimeUpdate(mediaId: string, currentTimeSeconds: number): void;
  onEnded(mediaId: string): void;
  onOpenPictureInPicture?(mediaId: string): void;
};

export function AudioPlayer({
  media,
  activeMediaId,
  isPlaying,
  currentTimeSeconds,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onOpenPictureInPicture,
}: AudioPlayerProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | undefined>(() =>
    canUseTauriRuntime() ? undefined : media.libraryPath,
  );
  const [failed, setFailed] = useState(false);
  const isActive = activeMediaId === media.id;

  useEffect(() => {
    let cancelled = false;

    async function resolveAudio() {
      setFailed(false);
      setSrc(canUseTauriRuntime() ? undefined : media.libraryPath);

      try {
        const resolvedSrc = await resolveLibraryAssetUrl(media.libraryPath);

        if (!cancelled) {
          setSrc(resolvedSrc);
        }
      } catch {
        if (!cancelled) {
          setSrc(undefined);
          setFailed(true);
        }
      }
    }

    void resolveAudio();

    return () => {
      cancelled = true;
    };
  }, [media.libraryPath]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    if (isActive && Math.abs(element.currentTime - currentTimeSeconds) > 1.5) {
      try {
        element.currentTime = currentTimeSeconds;
      } catch {
        // Some webviews reject seeking before metadata is available.
      }
    }
  }, [currentTimeSeconds, isActive, src]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    if (isActive && isPlaying) {
      try {
        const playResult = element.play();
        void playResult?.catch(() => {
          onPause(media.id);
        });
      } catch {
        onPause(media.id);
      }
      return;
    }

    if (!element.paused) {
      try {
        element.pause();
      } catch {
        // jsdom does not implement media playback; browsers and Tauri webviews do.
      }
    }
  }, [isActive, isPlaying, media.id, onPause, src]);

  return (
    <div className="relative flex aspect-video flex-col items-center justify-center gap-4 rounded-md bg-muted p-5 text-center">
      {onOpenPictureInPicture ? (
        <TooltipProvider delayDuration={150}>
          <div className="absolute right-2 top-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-md bg-background/90 p-1.5 text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={t("video.player.pictureInPicture")}
                  onClick={() => onOpenPictureInPicture(media.id)}
                >
                  <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("video.player.pictureInPicture")}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ) : null}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background text-foreground shadow-sm">
        <Music className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium">{media.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("audio.player.title")}
        </p>
      </div>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          controls
          preload="metadata"
          className="w-full"
          aria-label={media.title}
          onPlay={() => onPlay(media.id)}
          onPause={() => onPause(media.id)}
          onTimeUpdate={(event) =>
            onTimeUpdate(media.id, event.currentTarget.currentTime)
          }
          onEnded={() => onEnded(media.id)}
          onError={() => {
            setSrc(undefined);
            setFailed(true);
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {failed
            ? t("audio.player.fileUnavailable")
            : t("audio.player.loading")}
        </p>
      )}
    </div>
  );
}
