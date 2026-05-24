import { invoke } from "@tauri-apps/api/core";
import type { TranscriptSegment, VideoAsset } from "@/domain/media-library";
import {
  canUseTauriRuntime,
  type TauriInvoke,
} from "@/services/tauriHelperClient";

export const transcriptOverlayWindowLabel = "transcript-overlay";
export const transcriptOverlayEvent = "openbrief://transcript-overlay";

export type TranscriptOverlayPayload = {
  videoTitle: string;
  timestamp: string;
  text: string;
};

export async function showTranscriptOverlay(
  payload: TranscriptOverlayPayload,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    return false;
  }

  return invokeCommand<boolean>("show_transcript_overlay", { payload });
}

export async function hideTranscriptOverlay(
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    return false;
  }

  return invokeCommand<boolean>("hide_transcript_overlay");
}

export function createTranscriptOverlayPayload({
  video,
  segment,
  timestamp,
}: {
  video: VideoAsset;
  segment?: TranscriptSegment;
  timestamp: string;
}): TranscriptOverlayPayload {
  return {
    videoTitle: video.title,
    timestamp,
    text: segment?.text ?? "No transcript at the current timestamp.",
  };
}
