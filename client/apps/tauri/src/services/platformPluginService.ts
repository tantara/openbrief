import { arch, platform, version } from "@tauri-apps/plugin-os";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type JobNotificationKind = "job-completed" | "job-failed";

export type PlatformDiagnostics = {
  platform: string;
  arch: string;
  version: string;
};

export type UpdateCheckResult =
  | {
      available: false;
    }
  | {
      available: true;
      version: string;
      currentVersion: string;
      body?: string;
      date?: string;
    };

export type UpdateInstallResult =
  | {
      installed: true;
      version: string;
      currentVersion: string;
    }
  | {
      installed: false;
      reason: "not-available";
    };

export type PlatformPluginAdapter = {
  platform(): string;
  arch(): string;
  version(): string;
  checkForUpdate(): Promise<Update | null>;
};

export type PlatformPluginService = {
  readDiagnostics(): PlatformDiagnostics;
  notifyJobResult(request: {
    kind: JobNotificationKind;
    title: string;
    body: string;
  }): Promise<boolean>;
  checkForUpdate(): Promise<UpdateCheckResult>;
  installAvailableUpdate(): Promise<UpdateInstallResult>;
};

const tauriPlatformPluginAdapter: PlatformPluginAdapter = {
  platform,
  arch,
  version,
  checkForUpdate: check,
};

export function createPlatformPluginService(
  adapter: PlatformPluginAdapter = tauriPlatformPluginAdapter,
): PlatformPluginService {
  return {
    readDiagnostics() {
      return {
        platform: adapter.platform(),
        arch: adapter.arch(),
        version: adapter.version(),
      };
    },

    async notifyJobResult(request) {
      if (!isAllowedJobNotification(request.kind)) {
        return false;
      }

      return false;
    },

    async checkForUpdate() {
      const update = await adapter.checkForUpdate();

      if (!update) {
        return { available: false };
      }

      return {
        available: true,
        version: update.version,
        currentVersion: update.currentVersion,
        body: update.body,
        date: update.date,
      };
    },

    async installAvailableUpdate() {
      const update = await adapter.checkForUpdate();

      if (!update) {
        return { installed: false, reason: "not-available" };
      }

      await update.downloadAndInstall();

      return {
        installed: true,
        version: update.version,
        currentVersion: update.currentVersion,
      };
    },
  };
}

function isAllowedJobNotification(kind: string): kind is JobNotificationKind {
  return kind === "job-completed" || kind === "job-failed";
}
