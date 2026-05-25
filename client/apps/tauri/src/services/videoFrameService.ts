import { invoke } from "@tauri-apps/api/core";
import { helperProtocolVersion } from "@/domain/helper-protocol";
import {
  createLibraryAssetDirectory,
  createVideoFrameArtifactPath,
  mediaSourceTypeForAsset,
  type VideoAsset,
} from "@/domain/media-library";
import type { HelperClient } from "@/services/fakeHelperClient";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { TauriHelperClient, type TauriInvoke } from "@/services/tauriHelperClient";

export type VideoFramePreview = {
  relativePath: string;
  imageUrl: string;
  cached: boolean;
};

export type VideoFrameService = {
  getFramePreview(request: {
    video: VideoAsset;
    seconds: number;
  }): Promise<VideoFramePreview>;
};

export function createVideoFrameService({
  invokeCommand = invoke,
  helperClient = new TauriHelperClient(invokeCommand),
}: {
  invokeCommand?: TauriInvoke;
  helperClient?: HelperClient;
} = {}): VideoFrameService {
  return {
    async getFramePreview({ video, seconds }) {
      if (mediaSourceTypeForAsset(video) !== "video") {
        throw new Error("frame_preview_requires_video_asset");
      }

      const safeSeconds = normalizedFrameSeconds(seconds);
      const outputPath = createVideoFrameArtifactPath(video.id, safeSeconds);
      const cachedImageUrl = await resolveExistingFrameUrl(
        outputPath,
        invokeCommand,
      );

      if (cachedImageUrl) {
        return {
          relativePath: outputPath,
          imageUrl: cachedImageUrl,
          cached: true,
        };
      }

      const result = await helperClient.run({
        protocolVersion: helperProtocolVersion,
        command: "extract_thumbnail",
        jobId: `frame-preview-${video.id}-${safeSeconds}`,
        videoPath: video.libraryPath,
        outputPath,
        tempDir: createLibraryAssetDirectory("job-temp", video.id),
        timestampSeconds: safeSeconds,
      });

      if (result.command !== "extract_thumbnail") {
        throw new Error("frame_preview_extract_failed");
      }

      const imageUrl = await resolveLibraryAssetUrl(outputPath, invokeCommand);
      if (!imageUrl) {
        throw new Error("frame_preview_unavailable");
      }

      return {
        relativePath: outputPath,
        imageUrl,
        cached: false,
      };
    },
  };
}

async function resolveExistingFrameUrl(
  relativePath: string,
  invokeCommand: TauriInvoke,
) {
  try {
    return await resolveLibraryAssetUrl(relativePath, invokeCommand);
  } catch {
    return undefined;
  }
}

function normalizedFrameSeconds(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
}
