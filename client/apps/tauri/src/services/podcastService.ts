import type { PodcastDocument, PodcastSpeakerConfig } from "@/domain/podcast";
import type { VideoAsset } from "@/domain/media-library";
import type { TtsLanguageCode, TtsModelId } from "@/services/ttsSettingsService";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type PodcastTtsResult = {
  podcastId: string;
  audioPath: string;
  scriptPath: string;
  manifestPath: string;
  turnAudioPaths: string[];
  modelId: string;
  durationSeconds: number;
  sizeBytes: number;
};

export type GeneratePodcastTtsRequest = {
  video: VideoAsset;
  podcast: PodcastDocument;
};

export async function generatePodcastTts(
  request: GeneratePodcastTtsRequest,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    throw new Error("podcast_tts_requires_tauri_runtime");
  }

  const result = await invokeCommand<PodcastTtsResult>(
    "generate_supertonic_podcast_tts",
    {
      request: {
        assetLibraryPath: request.video.libraryPath,
        podcastId: request.podcast.id,
        modelId: request.podcast.tts.modelId,
        language: request.podcast.tts.languageCode,
        speakers: request.podcast.tts.speakers.map(podcastSpeakerPayload),
        turns: request.podcast.script.turns.map((turn) => ({
          id: turn.id,
          speakerId: turn.speakerId,
          text: turn.text,
        })),
        scriptMarkdown: request.podcast.script.markdown,
        manifestJson: JSON.stringify(request.podcast, null, 2),
      },
    },
  );
  const audioUrl =
    (await resolveLibraryAssetUrl(result.audioPath, invokeCommand)) ??
    convertFileSrc(result.audioPath);

  return { ...result, audioUrl };
}

export async function deletePodcastTts(
  video: VideoAsset,
  podcastId: string,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) return;

  await invokeCommand<void>("delete_supertonic_podcast_tts", {
    request: {
      assetLibraryPath: video.libraryPath,
      podcastId,
    },
  });
}

export async function findLatestPodcastTts(
  video: VideoAsset,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    return undefined;
  }

  const result = await invokeCommand<PodcastTtsResult | null>(
    "latest_supertonic_podcast_tts",
    {
      request: {
        assetLibraryPath: video.libraryPath,
      },
    },
  );

  return result ?? undefined;
}

export async function resolvePodcastAudioUrl(
  podcast: PodcastDocument,
  invokeCommand: TauriInvoke = invoke,
) {
  return (
    (await resolveLibraryAssetUrl(podcast.artifacts.podcastAudioPath, invokeCommand)) ??
    convertFileSrc(podcast.artifacts.podcastAudioPath)
  );
}

export function createPodcastDownloadFileName(
  podcast: Pick<PodcastDocument, "createdAtIso" | "id">,
) {
  const timestamp = podcast.createdAtIso.replace(/[:.]/g, "-");
  return `podcast-${timestamp || podcast.id}.wav`;
}

function podcastSpeakerPayload(speaker: PodcastSpeakerConfig): {
  id: "A" | "B";
  voiceStyleId: string;
} {
  return {
    id: speaker.id,
    voiceStyleId: speaker.voiceStyleId,
  };
}

export type PodcastTtsOptions = {
  modelId: TtsModelId;
  languageCode: TtsLanguageCode;
};
