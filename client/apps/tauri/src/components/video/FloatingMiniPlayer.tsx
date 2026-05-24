import { PanelLeft, PictureInPicture2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@acme/ui/button";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { mediaSourceTypeForAsset, type VideoAsset } from "@/domain/media-library";
import {
  clampMiniPlayerPosition,
  miniPlayerPositionFromCorner,
  type MiniPlayerCorner,
  type MiniPlayerPosition,
  type MiniPlayerSize,
  type MiniPlayerViewport,
} from "@/hooks/useVideoPlayback";
import { cn } from "@acme/ui";
import { useI18n } from "@/i18n";

type FloatingMiniPlayerProps = {
  media: VideoAsset;
  corner: MiniPlayerCorner;
  position?: MiniPlayerPosition;
  activeMediaId?: string;
  isPlaying: boolean;
  currentTimeSeconds: number;
  onPositionChange(
    position: MiniPlayerPosition,
    viewport: MiniPlayerViewport,
    size: MiniPlayerSize,
  ): void;
  onPlay(videoId: string): void;
  onPause(videoId: string): void;
  onTimeUpdate(videoId: string, currentTimeSeconds: number): void;
  onEnded(videoId: string): void;
  onOpenWorkbench(): void;
  onClose(): void;
};

export function FloatingMiniPlayer({
  media,
  corner,
  position,
  activeMediaId,
  isPlaying,
  currentTimeSeconds,
  onPositionChange,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onOpenWorkbench,
  onClose,
}: FloatingMiniPlayerProps) {
  const { t } = useI18n();
  const sourceType = mediaSourceTypeForAsset(media);
  const playerRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const draftPositionRef = useRef(resolveInitialPosition(position, corner));
  const viewportRef = useRef(readViewport());
  const [draftPosition, setDraftPosition] = useState(draftPositionRef.current);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isDragging) return;

    const nextPosition = resolveInitialPosition(
      position,
      corner,
      readElementSize(playerRef.current),
    );
    draftPositionRef.current = nextPosition;
    setDraftPosition(nextPosition);
  }, [corner, isDragging, position]);

  useEffect(() => {
    function clampOnResize() {
      const size = readElementSize(playerRef.current);
      const viewport = readViewport();
      const anchoredCorner = cornerForAnchoredPosition(
        draftPositionRef.current,
        viewportRef.current,
        size,
      );
      const nextPosition = anchoredCorner
        ? miniPlayerPositionFromCorner(anchoredCorner, viewport, size)
        : clampMiniPlayerPosition(draftPositionRef.current, viewport, size);

      viewportRef.current = viewport;
      draftPositionRef.current = nextPosition;
      setDraftPosition(nextPosition);
      onPositionChange(nextPosition, viewport, size);
    }

    window.addEventListener("resize", clampOnResize);
    return () => window.removeEventListener("resize", clampOnResize);
  }, [onPositionChange]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;

    const rect = playerRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setIsDragging(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const size = readElementSize(playerRef.current);
    const nextPosition = clampMiniPlayerPosition(
      {
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      },
      readViewport(),
      size,
    );

    draftPositionRef.current = nextPosition;
    setDraftPosition(nextPosition);
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const size = readElementSize(playerRef.current);
    const viewport = readViewport();
    dragRef.current = null;
    setIsDragging(false);
    onPositionChange(draftPositionRef.current, viewport, size);
  }

  return (
    <aside
      ref={playerRef}
      className={cn(
        "fixed left-0 top-0 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl",
        isDragging ? "cursor-grabbing ring-2 ring-ring" : "cursor-default",
      )}
      style={{
        transform: `translate3d(${draftPosition.x}px, ${draftPosition.y}px, 0)`,
      }}
      aria-label={t("video.player.pictureInPicture")}
    >
      <div
        className="flex touch-none cursor-grab select-none items-center justify-between gap-2 border-b border-border px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          dragRef.current = null;
          setIsDragging(false);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <PictureInPicture2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="min-w-0 truncate text-xs font-medium">{media.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("video.player.openWorkbench")}
            onClick={onOpenWorkbench}
          >
            <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t("video.player.closePictureInPicture")}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {sourceType === "audio" ? (
        <AudioPlayer
          media={media}
          activeMediaId={activeMediaId}
          isPlaying={isPlaying}
          currentTimeSeconds={currentTimeSeconds}
          onPlay={onPlay}
          onPause={onPause}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
        />
      ) : (
        <VideoPlayer
          video={media}
          activeVideoId={activeMediaId}
          isPlaying={isPlaying}
          currentTimeSeconds={currentTimeSeconds}
          compact
          className="rounded-none"
          onPlay={onPlay}
          onPause={onPause}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
        />
      )}
    </aside>
  );
}

function resolveInitialPosition(
  position: MiniPlayerPosition | undefined,
  corner: MiniPlayerCorner,
  size = readElementSize(),
) {
  return position
    ? clampMiniPlayerPosition(position, readViewport(), size)
    : miniPlayerPositionFromCorner(corner, readViewport(), size);
}

function readViewport(): MiniPlayerViewport {
  if (typeof window === "undefined") {
    return { width: 392, height: 282 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function readElementSize(element?: HTMLElement | null): MiniPlayerSize {
  if (!element) return { width: 380, height: 254 };

  const rect = element.getBoundingClientRect();
  return {
    width: rect.width || 380,
    height: rect.height || 254,
  };
}

function cornerForAnchoredPosition(
  position: MiniPlayerPosition,
  viewport: MiniPlayerViewport,
  size: MiniPlayerSize,
) {
  const anchorTolerance = 2;
  const corners: MiniPlayerCorner[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  return corners.find((corner) => {
    const anchor = miniPlayerPositionFromCorner(corner, viewport, size);

    return (
      Math.abs(position.x - anchor.x) <= anchorTolerance &&
      Math.abs(position.y - anchor.y) <= anchorTolerance
    );
  });
}
