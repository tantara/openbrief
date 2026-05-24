import { describe, expect, it, vi } from "vitest";
import {
  createPlatformPluginService,
  type PlatformPluginAdapter,
} from "@/services/platformPluginService";

describe("platform plugin service", () => {
  it("reads OS diagnostics without hostname or filesystem paths", () => {
    const service = createPlatformPluginService(createAdapter());

    expect(service.readDiagnostics()).toEqual({
      platform: "macos",
      arch: "aarch64",
      version: "15.0.0",
    });
  });

  it("does not send notifications in the notification-free macOS build", async () => {
    const adapter = createAdapter();
    const service = createPlatformPluginService(adapter);

    const sent = await service.notifyJobResult({
      kind: "job-failed",
      title: "Import failed",
      body: "OpenBrief could not download the video.",
    });

    expect(sent).toBe(false);
  });

  it("keeps updater checks explicit and metadata-only", async () => {
    const service = createPlatformPluginService(
      createAdapter({
        checkForUpdate: vi.fn().mockResolvedValue({
          version: "0.2.0",
          currentVersion: "0.1.0",
          body: "Release notes",
          date: "2026-05-21T00:00:00Z",
        }),
      }),
    );

    await expect(service.checkForUpdate()).resolves.toEqual({
      available: true,
      version: "0.2.0",
      currentVersion: "0.1.0",
      body: "Release notes",
      date: "2026-05-21T00:00:00Z",
    });
  });

  it("installs an available app update only after an explicit action", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const service = createPlatformPluginService(
      createAdapter({
        checkForUpdate: vi.fn().mockResolvedValue({
          version: "0.2.0",
          currentVersion: "0.1.0",
          downloadAndInstall,
        }),
      }),
    );

    await expect(service.installAvailableUpdate()).resolves.toEqual({
      installed: true,
      version: "0.2.0",
      currentVersion: "0.1.0",
    });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it("does not install when no app update is available", async () => {
    const service = createPlatformPluginService(createAdapter());

    await expect(service.installAvailableUpdate()).resolves.toEqual({
      installed: false,
      reason: "not-available",
    });
  });
});

function createAdapter(
  overrides: Partial<PlatformPluginAdapter> = {},
): PlatformPluginAdapter {
  return {
    platform: vi.fn(() => "macos"),
    arch: vi.fn(() => "aarch64"),
    version: vi.fn(() => "15.0.0"),
    checkForUpdate: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}
