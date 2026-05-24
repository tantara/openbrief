import { invoke } from "@tauri-apps/api/core";
import type { TranscriptSegment, VideoAsset } from "@/domain/media-library";
import {
  canUseTauriRuntime,
  type TauriInvoke,
} from "@/services/tauriHelperClient";

export const transcriptOverlayWindowLabel = "transcript-overlay";
export const transcriptOverlayEvent = "openbrief://transcript-overlay";
export const transcriptOverlayHiddenEvent = "openbrief://transcript-overlay-hidden";

export type TranscriptOverlayPayload = {
  videoTitle: string;
  timestamp: string;
  text: string;
  nextText?: string;
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
  nextSegment,
  timestamp,
}: {
  video: VideoAsset;
  segment?: TranscriptSegment;
  nextSegment?: TranscriptSegment;
  timestamp: string;
}): TranscriptOverlayPayload {
  return {
    videoTitle: video.title,
    timestamp,
    text: segment?.text ?? "No transcript at the current timestamp.",
    ...(nextSegment ? { nextText: nextSegment.text } : {}),
  };
}
