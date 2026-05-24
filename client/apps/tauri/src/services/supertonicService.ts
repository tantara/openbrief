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
  audio?: Pick<SupertonicChatTtsArtifact, "audioPath">,
  now = new Date(),
) {
  const existingName = audio?.audioPath.split(/[\\/]/).at(-1);
  if (existingName?.startsWith("voice-message-") && existingName.endsWith(".wav")) {
    return existingName;
  }

  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `voice-message-${timestamp}.wav`;
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
