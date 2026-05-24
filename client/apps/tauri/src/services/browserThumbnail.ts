import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";

const thumbnailCache = new Map<string, string>();
const thumbnailPromises = new Map<string, Promise<string | undefined>>();
const thumbnailQueue: Array<() => void> = [];
let activeThumbnailJobs = 0;
let cacheVersion = 0;

const maxThumbnailJobs = 2;

export type BrowserThumbnailOptions = {
  seekTimeSeconds?: number;
  isDestroyed?: () => boolean;
};

export async function generateVideoThumbnail(
  videoPath: string,
  options: BrowserThumbnailOptions = {},
) {
  const hasSeekTime =
    options.seekTimeSeconds !== undefined && options.seekTimeSeconds > 0;
  const cacheKey = hasSeekTime
    ? `${videoPath}@${Math.floor(options.seekTimeSeconds!)}`
    : videoPath;

  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey);
  }

  if (thumbnailPromises.has(cacheKey)) {
    return thumbnailPromises.get(cacheKey);
  }

  const capturedVersion = cacheVersion;
  const promise = scheduleThumbnailJob(() =>
    createVideoThumbnail({
      videoPath,
      cacheKey,
      seekTimeSeconds: options.seekTimeSeconds,
      hasSeekTime,
      capturedVersion,
      isDestroyed: options.isDestroyed ?? (() => false),
    }),
  ).finally(() => {
    thumbnailPromises.delete(cacheKey);
  });

  thumbnailPromises.set(cacheKey, promise);
  return promise;
}

export function clearGeneratedVideoThumbnailCache() {
  cacheVersion += 1;
  thumbnailQueue.length = 0;
  thumbnailPromises.clear();

  for (const thumbnail of thumbnailCache.values()) {
    if (thumbnail.startsWith("blob:")) {
      URL.revokeObjectURL(thumbnail);
    }
  }

  thumbnailCache.clear();
}

function scheduleThumbnailJob(job: () => Promise<string | undefined>) {
  return new Promise<string | undefined>((resolve) => {
    const run = () => {
      activeThumbnailJobs += 1;
      job()
        .then(resolve)
        .catch(() => resolve(undefined))
        .finally(() => {
          activeThumbnailJobs -= 1;
          thumbnailQueue.shift()?.();
        });
    };

    if (activeThumbnailJobs < maxThumbnailJobs) {
      run();
    } else {
      thumbnailQueue.push(run);
    }
  });
}

async function createVideoThumbnail({
  videoPath,
  cacheKey,
  seekTimeSeconds,
  hasSeekTime,
  capturedVersion,
  isDestroyed,
}: {
  videoPath: string;
  cacheKey: string;
  seekTimeSeconds?: number;
  hasSeekTime: boolean;
  capturedVersion: number;
  isDestroyed: () => boolean;
}) {
  if (isJsdomRuntime()) return undefined;

  const videoSrc = await resolveLibraryAssetUrl(videoPath);

  if (!videoSrc) return undefined;

  return new Promise<string | undefined>((resolve) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    let settled = false;
    const timeout = window.setTimeout(() => settle(undefined), 8000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;

      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // Detached media cleanup is best-effort across webviews and jsdom.
      }
    }

    function settle(thumbnail: string | undefined) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(thumbnail);
    }

    function capture() {
      try {
        const aspectRatio = video.videoWidth / video.videoHeight;

        if (!context || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
          settle(undefined);
          return;
        }

        canvas.width = 320;
        canvas.height = Math.round(canvas.width / aspectRatio);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              settle(undefined);
              return;
            }

            const objectUrl = URL.createObjectURL(blob);

            if (isDestroyed() || cacheVersion !== capturedVersion) {
              URL.revokeObjectURL(objectUrl);
              settle(undefined);
              return;
            }

            thumbnailCache.set(cacheKey, objectUrl);
            settle(objectUrl);
          },
          "image/jpeg",
          0.75,
        );
      } catch {
        settle(undefined);
      }
    }

    if (!context) {
      settle(undefined);
      return;
    }

    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const fallbackTime = Number.isFinite(video.duration)
        ? Math.min(1, video.duration * 0.1)
        : 0;
      const targetTime = hasSeekTime ? seekTimeSeconds! : fallbackTime;

      if (targetTime <= 0) {
        capture();
        return;
      }

      try {
        video.currentTime = targetTime;
      } catch {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => settle(undefined);
    video.src = videoSrc;
  });
}

function isJsdomRuntime() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("jsdom")
  );
}
