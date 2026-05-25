import type { ProviderKind } from "@/domain/media-library";
import type { PlatformCompatibilityReport } from "@/domain/compatibility";

export type ProviderAuthMode = "api-key" | "oauth-subscription";

export type AppVersionInfo = {
  appName: string;
  appVersion: string;
  tauriVersion?: string;
  osPlatform: string;
  osVersion: string;
  osArch: string;
  updater: AppUpdaterStatus;
};

export type AppUpdaterStatus = {
  status: "available" | "current" | "not-checked" | "unavailable" | "error";
  currentVersion: string;
  latestVersion?: string;
  date?: string;
  body?: string;
  canUpdate: boolean;
  errorMessage?: string;
};

export type VideoDownloadStatus = {
  youtubeApiKeyRequired: false;
  keyStatus: "not-required";
  downloader: "yt-dlp";
  downloaderStatus: "available" | "unavailable" | "unknown";
  protocolVersion?: number;
  ytdlpUpdate: YtDlpUpdateStatus;
  access: VideoDownloadAccessStatus;
  mediaTools: Array<{
    tool: string;
    status: "configured" | "unknown";
  }>;
};

export type VideoDownloadAccessStatus = {
  cookiesEnabled: boolean;
  cookieSource: "none" | "browser" | "cookies-file";
  browser?: string;
  browserProfile?: string;
  cookiesFileConfigured: boolean;
  cookiesFilePath?: string;
  poTokenConfigured: boolean;
  extractorArgsConfigured: boolean;
};

export type VideoDownloadAccessAction =
  | "use-browser-cookies"
  | "choose-cookies-file"
  | "configure-po-token"
  | "configure-extractor-args";

export type YtDlpUpdateStatus = {
  tool: "yt-dlp";
  version?: string;
  versionDate?: string;
  ageDays?: number;
  staleAfterDays: number;
  isStale: boolean;
  autoUpdateEnabled: boolean;
  activePath?: string;
  source:
    | "app-data-override"
    | "bundled-resource"
    | "environment-override"
    | "path"
    | "unavailable";
  canUpdate: boolean;
  lastUpdateError?: string;
};

export type SttModelStatus = {
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

export type StorageUsageCategory =
  | "database"
  | "video"
  | "audio"
  | "pdf"
  | "model-checkpoint";

export type StorageUsageItem = {
  category: StorageUsageCategory;
  label: string;
  sizeBytes: number;
  percentage: number;
};

export type StorageUsageSnapshot = {
  totalBytes: number;
  items: StorageUsageItem[];
  measuredAtIso: string;
  errorMessage?: string;
};

export type ProviderSetupStatus = {
  defaultProvider: ProviderKind;
  defaultModels: Record<ProviderKind, string>;
  accounts: Array<{
    provider: ProviderKind;
    label: string;
    configured: boolean;
    authModes: ProviderAuthMode[];
    credentialPolicy: "os-keychain-preferred";
    oauthStatus: "planned";
  }>;
};

export type SettingsSnapshot = {
  versionInfo: AppVersionInfo;
  videoDownload: VideoDownloadStatus;
  stt: SttModelStatus;
  llm: ProviderSetupStatus;
  storage: StorageUsageSnapshot;
  compatibility: PlatformCompatibilityReport;
};

export function selectPreferredSttModel(
  models: SttModelStatus["models"],
  selectedModelId?: string,
) {
  return (
    models.find((model) => model.id === selectedModelId) ??
    models.find((model) => model.recommended) ??
    models[0]
  );
}

export const storageUsageCategories = [
  { category: "database", label: "Database" },
  { category: "video", label: "Video" },
  { category: "audio", label: "Audio" },
  { category: "pdf", label: "PDF" },
  { category: "model-checkpoint", label: "Model checkpoint" },
] as const satisfies ReadonlyArray<{
  category: StorageUsageCategory;
  label: string;
}>;

export function createZeroStorageUsageSnapshot(
  measuredAtIso = new Date().toISOString(),
  errorMessage?: string,
): StorageUsageSnapshot {
  return {
    totalBytes: 0,
    items: storageUsageCategories.map((item) => ({
      ...item,
      sizeBytes: 0,
      percentage: 0,
    })),
    measuredAtIso,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function formatStorageSize(sizeBytes: number): string {
  const safeBytes = Math.max(0, Number.isFinite(sizeBytes) ? sizeBytes : 0);
  if (safeBytes < 1024) return `${Math.round(safeBytes)} B`;

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = safeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatModelSize(sizeMb: number): string {
  const safeMb = Math.max(0, Number.isFinite(sizeMb) ? sizeMb : 0);
  if (safeMb < 1000) return `${Math.round(safeMb)} MB`;

  return `${(safeMb / 1000).toFixed(1)} GB`;
}

export function formatStoragePercentage(percentage: number): string {
  const safePercentage = Math.max(
    0,
    Number.isFinite(percentage) ? percentage : 0,
  );
  if (safePercentage === 0) return "0%";
  if (safePercentage < 1) return "<1%";
  return `${Math.round(safePercentage)}%`;
}
