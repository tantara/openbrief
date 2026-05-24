import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import {
  arch,
  platform,
  version as osVersion,
} from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppUpdaterStatus,
  SettingsSnapshot,
  VideoDownloadStatus,
  YtDlpUpdateStatus,
} from "@/domain/settings";
import { createPlatformCompatibilityReport } from "@/domain/compatibility";
import type { ProviderKind } from "@/domain/media-library";
import {
  defaultProviderModels,
  providerLabels,
  providerOptions,
} from "@/domain/provider";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";
import {
  createPlatformPluginService,
  type PlatformPluginService,
} from "@/services/platformPluginService";

type HelperProtocolContract = {
  protocolVersion: number;
  mediaTools: Array<{ tool: string }>;
};

type RawSttModelCatalog = {
  downloadRequiresUserConfirmation: boolean;
  storage: string;
  models: Array<{
    id: string;
    name: string;
    engine: string;
    fileName: string;
    sizeMb: number;
    downloaded: boolean;
    recommended: boolean;
  }>;
};

type RawProviderApiKeyStatus = {
  provider: ProviderKind;
  configured: boolean;
  credentialRef: string;
};

export async function loadSettingsSnapshot(
  invokeCommand: TauriInvoke = invoke,
  platformPluginService: PlatformPluginService = createPlatformPluginService(),
  options: { checkAppUpdate?: boolean } = {},
): Promise<SettingsSnapshot> {
  if (!canUseTauriRuntime()) {
    return createFallbackSettingsSnapshot();
  }

  const [
    appName,
    appVersion,
    tauriVersion,
    helperContract,
    sttCatalog,
    providerStatuses,
    ytdlpUpdate,
  ] =
    await Promise.all([
      getName(),
      getVersion(),
      getTauriVersion(),
      invokeCommand<HelperProtocolContract>("helper_protocol_contract"),
      invokeCommand<RawSttModelCatalog>("stt_model_catalog"),
      invokeCommand<RawProviderApiKeyStatus[]>("provider_api_key_statuses"),
      invokeCommand<YtDlpUpdateStatus>("yt_dlp_update_status"),
    ]);

  const updater = options.checkAppUpdate
    ? await readAppUpdaterStatus(appVersion, platformPluginService)
    : createUncheckedAppUpdaterStatus(appVersion);

  const osPlatform = platform();
  const osArch = arch();
  const videoDownload: VideoDownloadStatus = {
    youtubeApiKeyRequired: false,
    keyStatus: "not-required",
    downloader: "yt-dlp",
    downloaderStatus: helperContract.mediaTools.some(
      (tool) => tool.tool === "yt-dlp",
    )
      ? "available"
      : "unavailable",
    protocolVersion: helperContract.protocolVersion,
    ytdlpUpdate,
    access: createDefaultVideoDownloadAccessStatus(),
    mediaTools: helperContract.mediaTools.map((tool) => ({
      tool: tool.tool,
      status: "configured",
    })),
  };
  const stt = sttCatalog;

  return createSettingsSnapshot({
    versionInfo: {
      appName,
      appVersion,
      tauriVersion,
      osPlatform,
      osVersion: osVersion(),
      osArch,
      updater,
    },
    videoDownload,
    stt,
    llm: createLlmSettings(providerStatuses),
  });
}

function createFallbackSettingsSnapshot(): SettingsSnapshot {
  return createSettingsSnapshot({
    versionInfo: {
      appName: "OpenBrief",
      appVersion: "0.1.0",
      osPlatform: "browser-preview",
      osVersion: "unknown",
      osArch: "unknown",
      updater: {
        status: "not-checked",
        currentVersion: "0.1.0",
        canUpdate: false,
      },
    },
    videoDownload: {
      youtubeApiKeyRequired: false,
      keyStatus: "not-required",
      downloader: "yt-dlp",
      downloaderStatus: "unknown",
      ytdlpUpdate: {
        tool: "yt-dlp",
        staleAfterDays: 30,
        isStale: false,
        autoUpdateEnabled: false,
        source: "unavailable",
        canUpdate: false,
      },
      access: createDefaultVideoDownloadAccessStatus(),
      mediaTools: [
        { tool: "yt-dlp", status: "unknown" },
        { tool: "ffmpeg", status: "unknown" },
        { tool: "ffprobe", status: "unknown" },
      ],
    },
    stt: {
      downloadRequiresUserConfirmation: true,
      storage: "app-data/models",
      models: [
        {
          id: "whisper-tiny",
          name: "Whisper Tiny",
          engine: "whisper.cpp",
          fileName: "ggml-tiny.bin",
          sizeMb: 75,
          downloaded: false,
          recommended: false,
        },
        {
          id: "whisper-base",
          name: "Whisper Base",
          engine: "whisper.cpp",
          fileName: "ggml-base.bin",
          sizeMb: 142,
          downloaded: false,
          recommended: false,
        },
        {
          id: "whisper-small",
          name: "Whisper Small",
          engine: "whisper.cpp",
          fileName: "ggml-small.bin",
          sizeMb: 466,
          downloaded: false,
          recommended: true,
        },
        {
          id: "whisper-medium",
          name: "Whisper Medium",
          engine: "whisper.cpp",
          fileName: "ggml-medium.bin",
          sizeMb: 1536,
          downloaded: false,
          recommended: false,
        },
      ],
    },
    llm: createLlmSettings([]),
  });
}

function createDefaultVideoDownloadAccessStatus() {
  return {
    cookiesEnabled: false,
    cookieSource: "none" as const,
    browser: undefined,
    browserProfile: undefined,
    cookiesFileConfigured: false,
    cookiesFilePath: undefined,
    poTokenConfigured: false,
    extractorArgsConfigured: false,
  };
}

function createSettingsSnapshot(
  snapshot: Omit<SettingsSnapshot, "compatibility">,
): SettingsSnapshot {
  return {
    ...snapshot,
    compatibility: createPlatformCompatibilityReport({
      platform: snapshot.versionInfo.osPlatform,
      architecture: snapshot.versionInfo.osArch,
      downloaderStatus: snapshot.videoDownload.downloaderStatus,
      ytdlpIsStale: snapshot.videoDownload.ytdlpUpdate.isStale,
      mediaTools: snapshot.videoDownload.mediaTools,
      sttModels: snapshot.stt.models,
    }),
  };
}

export async function setYtDlpAutoUpdatePolicy(
  autoUpdateEnabled: boolean,
  staleAfterDays = 30,
  invokeCommand: TauriInvoke = invoke,
) {
  return invokeCommand<YtDlpUpdateStatus>("set_yt_dlp_update_policy", {
    autoUpdateEnabled,
    staleAfterDays,
  });
}

export async function updateYtDlpNow(
  invokeCommand: TauriInvoke = invoke,
) {
  return invokeCommand<YtDlpUpdateStatus>("update_yt_dlp_now");
}

export async function updateAppNow(
  platformPluginService: PlatformPluginService = createPlatformPluginService(),
) {
  return platformPluginService.installAvailableUpdate();
}

async function readAppUpdaterStatus(
  currentVersion: string,
  platformPluginService: PlatformPluginService,
): Promise<AppUpdaterStatus> {
  try {
    const update = await platformPluginService.checkForUpdate();

    if (!update.available) {
      return {
        status: "current",
        currentVersion,
        canUpdate: false,
      };
    }

    return {
      status: "available",
      currentVersion: update.currentVersion,
      latestVersion: update.version,
      body: update.body,
      date: update.date,
      canUpdate: true,
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      canUpdate: false,
      errorMessage:
        error instanceof Error ? error.message : "updater_check_failed",
    };
  }
}

function createUncheckedAppUpdaterStatus(currentVersion: string): AppUpdaterStatus {
  return {
    status: "not-checked",
    currentVersion,
    canUpdate: false,
  };
}

function createLlmSettings(statuses: RawProviderApiKeyStatus[]): SettingsSnapshot["llm"] {
  const configured = new Set(
    statuses
      .filter((status) => status.configured)
      .map((status) => status.provider),
  );

  return {
    defaultProvider: "openai",
    defaultModels: defaultProviderModels,
    accounts: providerOptions.map((provider) => ({
      provider,
      label: providerLabels[provider],
      configured: configured.has(provider),
      authModes:
        provider === "openai"
          ? ["oauth-subscription", "api-key"]
          : ["api-key"],
      credentialPolicy: "os-keychain-preferred",
      oauthStatus: "planned",
    })),
  };
}
