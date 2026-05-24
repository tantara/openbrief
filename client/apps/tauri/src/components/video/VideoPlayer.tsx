import { Maximize2, Minimize2, PictureInPicture2, Play } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { VideoAsset } from "@/domain/media-library";
import { cn } from "@acme/ui";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { generateVideoThumbnail } from "@/services/browserThumbnail";
import { useI18n, type TranslationKey } from "@/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";

type VideoPlayerProps = {
  video: VideoAsset;
  activeVideoId?: string;
  isPlaying: boolean;
  currentTimeSeconds: number;
  compact?: boolean;
  className?: string;
  onPlay(videoId: string): void;
  onPause(videoId: string): void;
  onTimeUpdate(videoId: string, currentTimeSeconds: number): void;
  onEnded(videoId: string): void;
  onOpenPictureInPicture?(videoId: string): void;
};

const keyboardSeekSeconds = 5;

export function VideoPlayer({
  video,
  activeVideoId,
  isPlaying,
  currentTimeSeconds,
  compact = false,
  className,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onOpenPictureInPicture,
}: VideoPlayerProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const suppressNextPauseRef = useRef(false);
  const fullscreenResumeTimeRef = useRef<number | undefined>(undefined);
  const [src, setSrc] = useState<string | undefined>(() =>
    canUseTauriRuntime() ? undefined : video.libraryPath,
  );
  const [posterSrc, setPosterSrc] = useState<string | undefined>(() =>
    canUseTauriRuntime() ? undefined : video.thumbnailPath,
  );
  const [loadErrorKey, setLoadErrorKey] = useState<TranslationKey | undefined>();
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const isActive = activeVideoId === video.id;
  const isFullscreen = isAppFullscreen;
  const shouldShowThumbnailOverlay =
    Boolean(posterSrc) && !hasStartedPlayback && (!isActive || currentTimeSeconds < 0.5);

  useEffect(() => {
    let cancelled = false;

    async function resolveVideo() {
      if (!canUseTauriRuntime()) {
        setSrc(video.libraryPath);
        return;
      }

      try {
        const resolvedSrc = await resolveLibraryAssetUrl(video.libraryPath);

        if (!cancelled) {
          setSrc(resolvedSrc);
          setLoadErrorKey(undefined);
        }
      } catch {
        if (!cancelled) {
          setSrc(undefined);
          setLoadErrorKey("video.player.fileUnavailable");
        }
      }
    }

    setSrc(canUseTauriRuntime() ? undefined : video.libraryPath);
    setLoadErrorKey(undefined);
    void resolveVideo();

    return () => {
      cancelled = true;
    };
  }, [video.libraryPath]);

  useEffect(() => {
    setHasStartedPlayback(false);
  }, [video.id, src]);

  useEffect(() => {
    let cancelled = false;

    async function resolvePoster() {
      if (video.thumbnailPath) {
        try {
          const resolvedPoster = await resolveLibraryAssetUrl(video.thumbnailPath);

          if (!cancelled) {
            setPosterSrc(resolvedPoster);
          }
          return;
        } catch {
          if (!cancelled) {
            setPosterSrc(undefined);
          }
        }
      }

      try {
        const generatedPoster = await generateVideoThumbnail(video.libraryPath, {
          isDestroyed: () => cancelled,
        });

        if (!cancelled) {
          setPosterSrc(generatedPoster);
        }
      } catch {
        if (!cancelled) setPosterSrc(undefined);
      }
    }

    setPosterSrc(canUseTauriRuntime() ? undefined : video.thumbnailPath);
    void resolvePoster();

    return () => {
      cancelled = true;
    };
  }, [video.thumbnailPath]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const targetTime = fullscreenResumeTimeRef.current ?? currentTimeSeconds;

    if (isActive && Math.abs(element.currentTime - targetTime) > 1.5) {
      try {
        element.currentTime = targetTime;
      } catch {
        // Some webviews reject seeking before metadata is available.
      }
    }

    fullscreenResumeTimeRef.current = undefined;
  }, [currentTimeSeconds, isActive, isFullscreen, src]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (isActive && isPlaying) {
      try {
        const playResult = element.play();
        void playResult?.catch(() => {
          onPause(video.id);
        });
      } catch {
        onPause(video.id);
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
  }, [isActive, isPlaying, isFullscreen, onPause, src, video.id]);

  useEffect(() => {
    if (!isAppFullscreen) return;

    function exitOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAppFullscreen(false);
      }
    }

    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [isAppFullscreen]);

  function toggleFullscreen() {
    const element = videoRef.current;
    const shouldKeepPlaying = isActive && (isPlaying || Boolean(element && !element.paused));

    suppressNextPauseRef.current = shouldKeepPlaying;
    fullscreenResumeTimeRef.current = element?.currentTime;
    setIsAppFullscreen((current) => !current);
  }

  function handlePlayerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableShortcutTarget(event.target)) return;

    const element = videoRef.current;
    if (!element) return;

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();

      if (isActive && isPlaying) {
        onPause(video.id);
      } else {
        onPlay(video.id);
      }
      return;
    }

    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      element.muted = !element.muted;
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const duration = Number.isFinite(element.duration) ? element.duration : undefined;
      const nextTime = clampVideoTime(
        element.currentTime + direction * keyboardSeekSeconds,
        duration,
      );

      try {
        element.currentTime = nextTime;
      } catch {
        // Some webviews reject seeking before metadata is available.
      }

      onTimeUpdate(video.id, nextTime);
    }
  }

  if (!src) {
    return (
      <div
        className={cn(
          "flex aspect-video items-center justify-center rounded-md bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        {t(loadErrorKey ?? "video.player.fileUnavailable")}
      </div>
    );
  }

  const player = (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handlePlayerKeyDown}
      className={cn(
        "relative overflow-hidden bg-black focus:outline-none focus:ring-2 focus:ring-ring",
        isFullscreen
          ? "fixed bottom-0 left-20 right-0 top-16 z-[80] rounded-none"
          : compact
            ? "aspect-video rounded-none"
            : "aspect-video rounded-md",
        className,
      )}
    >
      <video
        ref={videoRef}
        src={src}
        poster={posterSrc}
        className="h-full w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
        aria-label={video.title}
        onError={() => {
          setLoadErrorKey("video.player.cannotPlay");
          setSrc(undefined);
        }}
        onPlay={() => {
          setHasStartedPlayback(true);
          onPlay(video.id);
        }}
        onPause={() => {
          if (suppressNextPauseRef.current) {
            suppressNextPauseRef.current = false;
            return;
          }

          onPause(video.id);
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime > 0.25) {
            setHasStartedPlayback(true);
          }
          onTimeUpdate(video.id, event.currentTarget.currentTime);
        }}
        onEnded={() => onEnded(video.id)}
      />
      {shouldShowThumbnailOverlay ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
          aria-label={`Play ${video.title}`}
          onClick={() => onPlay(video.id)}
        >
          <img
            src={posterSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          <span className="absolute rounded-full bg-background/85 p-3 text-foreground shadow-sm">
            <Play className="h-5 w-5" aria-hidden="true" />
          </span>
        </button>
      ) : null}
      <TooltipProvider delayDuration={150}>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {onOpenPictureInPicture ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-md bg-background/90 p-1.5 text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={t("video.player.pictureInPicture")}
                  onClick={() => onOpenPictureInPicture(video.id)}
                >
                  <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("video.player.pictureInPicture")}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md bg-background/90 p-1.5 text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={
                  isFullscreen
                    ? t("video.player.exitFullscreen")
                    : t("video.player.enterFullscreen")
                }
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isFullscreen
                ? t("video.player.exitFullscreen")
                : t("video.player.enterFullscreen")}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      {!isActive || !isPlaying ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-background/85 p-3 text-foreground shadow-sm">
            <Play className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );

  return isFullscreen && typeof document !== "undefined"
    ? createPortal(player, document.body)
    : player;
}

function clampVideoTime(value: number, duration?: number) {
  const lowerBounded = Math.max(0, value);
  return duration === undefined ? lowerBounded : Math.min(lowerBounded, duration);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button,input,textarea,select,[contenteditable="true"],[role="textbox"]',
    ),
  );
}
