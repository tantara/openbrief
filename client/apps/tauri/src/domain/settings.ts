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
  compatibility: PlatformCompatibilityReport;
};
