import type { ChatMessage, VideoAsset } from "@/domain/media-library";
import type {
  QwenPresetVoiceId,
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
} from "@/services/ttsSettingsService";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import {
  createReadableVoiceAudioFileName,
  createShortVoiceAudioId,
} from "@/services/voiceDownloadFileName";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type SupertonicChatTtsResult = {
  audioPath: string;
  generationId: string;
  modelId: string;
  voiceStyleId: string;
  sizeBytes: number;
};

export type SupertonicChatTtsArtifact = {
  audioPath: string;
  generationId: string;
  voiceName?: string;
  sizeBytes: number;
};

export type ReadChatBubbleRequest = {
  video: VideoAsset;
  message: ChatMessage;
  text?: string;
  modelId?: TtsModelId;
  language?: TtsLanguageCode;
  voiceStyleId?: SupertonicVoiceStyleId;
  qwenPresetVoiceId?: QwenPresetVoiceId;
};

export function createVoiceMessageDownloadFileName(
  audio?: Pick<SupertonicChatTtsArtifact, "audioPath"> &
    Partial<Pick<SupertonicChatTtsArtifact, "generationId">>,
  options: {
    text?: string;
    voiceName?: string;
  } = {},
  now = new Date(),
) {
  return createReadableVoiceAudioFileName({
    text: options.text,
    voiceName: options.voiceName,
    shortId: createShortVoiceAudioId(audio?.generationId ?? audio?.audioPath, now),
    fallbackStem: "voice-message",
  });
}

export async function readChatBubbleWithSupertonic(
  request: ReadChatBubbleRequest,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    throw new Error("supertonic_requires_tauri_runtime");
  }

  const result = await invokeCommand<SupertonicChatTtsResult>(
    "generate_supertonic_chat_tts",
    {
      request: {
        assetLibraryPath: request.video.libraryPath,
        chatMessageId: request.message.id,
        chatSessionId: request.message.sessionId ?? "default",
        text: request.text ?? request.message.content,
        modelId: request.modelId,
        language: request.language ?? request.video.language ?? "en",
        voiceStyleId: request.voiceStyleId ?? "M1",
        qwenPresetVoiceId: request.qwenPresetVoiceId ?? "default",
      },
    },
  );
  const audioUrl =
    (await resolveLibraryAssetUrl(result.audioPath, invokeCommand)) ??
    convertFileSrc(result.audioPath);

  return {
    ...result,
    audioUrl,
  };
}

export async function findLatestChatBubbleSupertonicAudio(
  request: Pick<ReadChatBubbleRequest, "video" | "message">,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!canUseTauriRuntime()) {
    return undefined;
  }

  const result = await invokeCommand<SupertonicChatTtsArtifact | null>(
    "latest_supertonic_chat_tts",
    {
      request: {
        assetLibraryPath: request.video.libraryPath,
        chatMessageId: request.message.id,
      },
    },
  );

  return result ?? undefined;
}

export async function resolveChatBubbleSupertonicAudioUrl(
  audio: SupertonicChatTtsArtifact,
  invokeCommand: TauriInvoke = invoke,
) {
  return (
    (await resolveLibraryAssetUrl(audio.audioPath, invokeCommand)) ??
    convertFileSrc(audio.audioPath)
  );
}
