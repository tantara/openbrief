import { useState } from "react";

export type MiniPlayerCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type MiniPlayerPosition = {
  x: number;
  y: number;
};

export type MiniPlayerSize = {
  width: number;
  height: number;
};

export type MiniPlayerViewport = {
  width: number;
  height: number;
};

export type VideoPlaybackState = {
  activeVideoId?: string;
  status: "idle" | "playing" | "paused";
  currentTimeSeconds: number;
  miniPlayerCorner: MiniPlayerCorner;
  miniPlayerPosition?: MiniPlayerPosition;
  pictureInPictureActive: boolean;
};

type PictureInPictureOptions = {
  preserveStatus?: boolean;
};

const miniPlayerMargin = 16;
const defaultMiniPlayerSize: MiniPlayerSize = {
  width: 360,
  height: 250,
};

export function createInitialVideoPlaybackState(): VideoPlaybackState {
  return {
    status: "idle",
    currentTimeSeconds: 0,
    miniPlayerCorner: "bottom-right",
    pictureInPictureActive: false,
  };
}

export function shouldShowMiniPlayer(
  state: VideoPlaybackState,
  activeView: string,
) {
  return Boolean(
    state.activeVideoId &&
      state.status !== "idle" &&
      (state.pictureInPictureActive || activeView !== "workbench"),
  );
}

export function miniPlayerPositionFromCorner(
  corner: MiniPlayerCorner,
  viewport: MiniPlayerViewport = readViewport(),
  size: MiniPlayerSize = defaultMiniPlayerSize,
): MiniPlayerPosition {
  const right = viewport.width - size.width - miniPlayerMargin;
  const bottom = viewport.height - size.height - miniPlayerMargin;

  return clampMiniPlayerPosition(
    {
      x: corner.endsWith("left") ? miniPlayerMargin : right,
      y: corner.startsWith("top") ? miniPlayerMargin : bottom,
    },
    viewport,
    size,
  );
}

export function clampMiniPlayerPosition(
  position: MiniPlayerPosition,
  viewport: MiniPlayerViewport = readViewport(),
  size: MiniPlayerSize = defaultMiniPlayerSize,
): MiniPlayerPosition {
  const maxX = Math.max(miniPlayerMargin, viewport.width - size.width - miniPlayerMargin);
  const maxY = Math.max(miniPlayerMargin, viewport.height - size.height - miniPlayerMargin);

  return {
    x: Math.min(Math.max(position.x, miniPlayerMargin), maxX),
    y: Math.min(Math.max(position.y, miniPlayerMargin), maxY),
  };
}

export function useVideoPlayback() {
  const [state, setState] = useState<VideoPlaybackState>(
    createInitialVideoPlaybackState,
  );

  function playVideo(videoId: string) {
    setState((current) => ({
      ...current,
      activeVideoId: videoId,
      status: "playing",
      currentTimeSeconds:
        current.activeVideoId === videoId ? current.currentTimeSeconds : 0,
      pictureInPictureActive:
        current.activeVideoId === videoId ? current.pictureInPictureActive : false,
    }));
  }

  function pauseVideo(videoId: string) {
    setState((current) =>
      current.activeVideoId === videoId
        ? {
            ...current,
            status: "paused",
          }
        : current,
    );
  }

  function stopVideo() {
    setState((current) => ({
      ...current,
      activeVideoId: undefined,
      status: "idle",
      currentTimeSeconds: 0,
      pictureInPictureActive: false,
    }));
  }

  function updateVideoTime(videoId: string, currentTimeSeconds: number) {
    setState((current) =>
      current.activeVideoId === videoId
        ? {
            ...current,
            currentTimeSeconds,
          }
        : current,
    );
  }

  function seekVideo(videoId: string, currentTimeSeconds: number) {
    setState((current) => {
      const isCurrentActiveVideo = current.activeVideoId === videoId;

      return {
        ...current,
        activeVideoId: videoId,
        status:
          isCurrentActiveVideo && current.status === "playing"
            ? "playing"
            : "paused",
        currentTimeSeconds: Math.max(0, currentTimeSeconds),
        pictureInPictureActive: isCurrentActiveVideo
          ? current.pictureInPictureActive
          : false,
      };
    });
  }

  function openPictureInPicture(
    videoId: string,
    options: PictureInPictureOptions = {},
  ) {
    setState((current) => ({
      ...current,
      activeVideoId: videoId,
      status:
        options.preserveStatus && current.activeVideoId === videoId
          ? current.status
          : "playing",
      currentTimeSeconds:
        current.activeVideoId === videoId ? current.currentTimeSeconds : 0,
      miniPlayerPosition:
        current.miniPlayerPosition ??
        miniPlayerPositionFromCorner(current.miniPlayerCorner),
      pictureInPictureActive: true,
    }));
  }

  function closePictureInPicture() {
    setState((current) => ({
      ...current,
      pictureInPictureActive: false,
    }));
  }

  function playActiveOrSelectedVideo(selectedVideoId?: string) {
    const videoId = state.activeVideoId ?? selectedVideoId;
    if (videoId) {
      playVideo(videoId);
    }
  }

  function pauseActiveVideo() {
    if (state.activeVideoId) {
      pauseVideo(state.activeVideoId);
    }
  }

  function moveMiniPlayer(
    position: MiniPlayerPosition,
    viewport?: MiniPlayerViewport,
    size?: MiniPlayerSize,
  ) {
    setState((current) => ({
      ...current,
      miniPlayerPosition: clampMiniPlayerPosition(position, viewport, size),
    }));
  }

  return {
    playbackState: state,
    playVideo,
    pauseVideo,
    stopVideo,
    updateVideoTime,
    seekVideo,
    openPictureInPicture,
    closePictureInPicture,
    playActiveOrSelectedVideo,
    pauseActiveVideo,
    moveMiniPlayer,
  };
}

function readViewport(): MiniPlayerViewport {
  if (typeof window === "undefined") {
    return {
      width: defaultMiniPlayerSize.width + miniPlayerMargin * 2,
      height: defaultMiniPlayerSize.height + miniPlayerMargin * 2,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
