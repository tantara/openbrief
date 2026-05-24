import type { LocalFileDialogService } from "@/services/localFileDialogService";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import type {
  QwenPresetVoiceId,
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
} from "@/services/ttsSettingsService";
import { createLocalFileDialogService } from "@/services/localFileDialogService";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";
import { invoke } from "@tauri-apps/api/core";

export type TtsVoiceCatalogModel = {
  id: TtsModelId;
  name: string;
  engine: "supertonic" | "qwen";
  downloaded: boolean;
  voices: TtsVoiceCatalogVoice[];
};

export type TtsVoiceCatalogVoice = {
  id: SupertonicVoiceStyleId | QwenPresetVoiceId;
  label: string;
  downloaded: boolean;
};

export type GenerateTtsPreviewRequest = {
  text: string;
  modelId: TtsModelId;
  language: TtsLanguageCode;
  voiceStyleId?: SupertonicVoiceStyleId;
  qwenPresetVoiceId?: QwenPresetVoiceId;
};

export type TtsPreviewResult = {
  modelId: TtsModelId;
  voiceId: string;
  language: TtsLanguageCode;
  sizeBytes: number;
  audioUrl: string;
  audioBytes: Uint8Array;
};

type RawTtsPreviewResult = {
  modelId: TtsModelId;
  voiceId: string;
  language: TtsLanguageCode;
  sizeBytes: number;
  audioBytes: number[];
};

export type SaveTtsPreviewAudioRequest = {
  audioBytes: Uint8Array | number[];
  defaultFileName: string;
};

export type SaveTtsPreviewAudioResult = {
  targetPath: string;
  bytesWritten: number;
};

export async function listTtsVoices(invokeCommand: TauriInvoke = invoke) {
  if (!canUseTauriRuntime()) {
    return [] satisfies TtsVoiceCatalogModel[];
  }

  return await invokeCommand<TtsVoiceCatalogModel[]>("tts_voice_catalog");
}

export async function generateTtsPreview(
  request: GenerateTtsPreviewRequest,
  invokeCommand: TauriInvoke = invoke,
): Promise<TtsPreviewResult> {
  if (!canUseTauriRuntime()) {
    throw new Error("tts_preview_requires_tauri_runtime");
  }

  const result = await invokeCommand<RawTtsPreviewResult>(
    "generate_tts_preview",
    {
      request: {
        text: request.text,
        modelId: request.modelId,
        language: request.language,
        voiceStyleId: request.voiceStyleId,
        qwenPresetVoiceId: request.qwenPresetVoiceId,
      },
    },
  );
  const audioBytes = new Uint8Array(result.audioBytes);
  const audioBlob = new Blob([audioBytes], {
    type: "audio/wav",
  });

  return {
    modelId: result.modelId,
    voiceId: result.voiceId,
    language: result.language,
    sizeBytes: result.sizeBytes,
    audioUrl: URL.createObjectURL(audioBlob),
    audioBytes,
  };
}

export async function saveTtsPreviewAudio(
  request: SaveTtsPreviewAudioRequest,
  {
    invokeCommand = invoke,
    fileDialogService = createLocalFileDialogService(),
  }: {
    invokeCommand?: TauriInvoke;
    fileDialogService?: LocalFileDialogService;
  } = {},
): Promise<SaveTtsPreviewAudioResult | undefined> {
  const targetPath = await fileDialogService.selectSavePath({
    title: "Export voice preview",
    defaultPath: request.defaultFileName,
    filters: [{ name: "Audio", extensions: ["wav"] }],
  });

  if (!targetPath) {
    return undefined;
  }

  const { outputDirectory, fileName } = splitExportTargetPath(targetPath);
  return invokeCommand<SaveTtsPreviewAudioResult>("export_tts_preview_audio", {
    audioBytes: Array.from(request.audioBytes),
    outputDirectory,
    fileName: ensureWavFileName(fileName),
  });
}

export function createTtsPreviewDefaultFileName(
  text: string,
  voiceName?: string,
) {
  const promptStem = sanitizeFileNamePart(text, 20);
  const voiceStem = sanitizeFileNamePart(voiceName ?? "");
  const stem = [promptStem, voiceStem].filter(Boolean).join("_");

  return `${stem || "voice-preview"}.wav`;
}

function sanitizeFileNamePart(value: string, maxCharacters?: number) {
  const limited =
    typeof maxCharacters === "number"
      ? Array.from(value.trim()).slice(0, maxCharacters).join("")
      : value.trim();

  return limited
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
}

function ensureWavFileName(fileName: string) {
  return /\.[A-Za-z0-9]+$/.test(fileName) ? fileName : `${fileName}.wav`;
}

function splitExportTargetPath(targetPath: string) {
  const slashIndex = Math.max(
    targetPath.lastIndexOf("/"),
    targetPath.lastIndexOf("\\"),
  );

  if (slashIndex < 0) {
    return {
      outputDirectory: ".",
      fileName: targetPath,
    };
  }

  return {
    outputDirectory: targetPath.slice(0, slashIndex) || ".",
    fileName: targetPath.slice(slashIndex + 1),
  };
}
