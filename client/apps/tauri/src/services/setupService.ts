import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProviderKind } from "@/domain/media-library";
import type { SettingsSnapshot } from "@/domain/settings";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";

export type ProviderApiKeyStatus = {
  provider: ProviderKind;
  configured: boolean;
  credentialRef: string;
};

export type SttModelDownloadResult = {
  modelId: string;
  fileName: string;
  downloaded: boolean;
  sha1: string;
  sizeBytes: number;
};

export type SttModelDownloadProgress = {
  modelId: string;
  fileName: string;
  downloadedBytes: number;
  totalBytes?: number;
  progress: number;
  progressPercent: number;
};

export type SttModelDownloadOptions = {
  onProgress?: (progress: SttModelDownloadProgress) => void;
};

export type SetupService = {
  downloadWhisperModel(
    modelId: string,
    options?: SttModelDownloadOptions,
  ): Promise<SttModelDownloadResult>;
  saveProviderApiKey(
    provider: ProviderKind,
    apiKey: string,
  ): Promise<ProviderApiKeyStatus>;
};

export function createSetupService(
  invokeCommand: TauriInvoke = invoke,
): SetupService {
  return {
    async downloadWhisperModel(modelId, options = {}) {
      if (!canUseTauriRuntime()) {
        options.onProgress?.({
          modelId,
          fileName: `${modelId}.bin`,
          downloadedBytes: 0,
          totalBytes: 0,
          progress: 1,
          progressPercent: 100,
        });
        return {
          modelId,
          fileName: `${modelId}.bin`,
          downloaded: true,
          sha1: "browser-preview",
          sizeBytes: 0,
        };
      }

      const unlisten = options.onProgress
        ? await listen<RawSttModelDownloadProgress>(
            "openbrief://stt-model-download-progress",
            (event) => {
              if (event.payload.modelId !== modelId) return;
              options.onProgress?.(mapSttModelDownloadProgress(event.payload));
            },
          )
        : undefined;

      try {
        return await invokeCommand<SttModelDownloadResult>("download_stt_model", {
          modelId,
          userConfirmed: true,
        });
      } finally {
        unlisten?.();
      }
    },

    async saveProviderApiKey(provider, apiKey) {
      if (!canUseTauriRuntime()) {
        return {
          provider,
          configured: apiKey.trim().length > 0,
          credentialRef: `provider:${provider}:api-key`,
        };
      }

      return invokeCommand<ProviderApiKeyStatus>("save_provider_api_key", {
        provider,
        apiKey,
      });
    },
  };
}

type RawSttModelDownloadProgress = {
  modelId: string;
  fileName: string;
  downloadedBytes: number;
  totalBytes?: number;
  progress: number;
};

function mapSttModelDownloadProgress(
  progress: RawSttModelDownloadProgress,
): SttModelDownloadProgress {
  return {
    ...progress,
    progress: Number.isFinite(progress.progress) ? progress.progress : 0,
    progressPercent: Math.round(
      (Number.isFinite(progress.progress) ? progress.progress : 0) * 100,
    ),
  };
}

export function whisperModelPath(
  model?: SettingsSnapshot["stt"]["models"][number],
) {
  return model ? `models/${model.fileName}` : "models/ggml-small.bin";
}
