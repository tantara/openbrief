import { describe, expect, it, vi } from "vitest";
import type { open } from "@tauri-apps/plugin-dialog";
import type { VideoDownloadAccessStatus } from "@/domain/settings";
import type { TauriInvoke } from "@/services/tauriHelperClient";
import {
  clearVideoDownloadCookiesFile,
  loadVideoDownloadAccessStatus,
  selectCookiesFile,
  setVideoDownloadCookiesFile,
} from "@/services/videoDownloadAccessService";

const status: VideoDownloadAccessStatus = {
  cookiesEnabled: true,
  cookieSource: "cookies-file",
  cookiesFileConfigured: true,
  cookiesFilePath: "/tmp/cookies.txt",
  poTokenConfigured: false,
  extractorArgsConfigured: false,
};

describe("videoDownloadAccessService", () => {
  it("loads status via the access command", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(status) as unknown as TauriInvoke;
    await expect(loadVideoDownloadAccessStatus(invokeCommand)).resolves.toEqual(
      status,
    );
    expect(invokeCommand).toHaveBeenCalledWith("video_download_access_status");
  });

  it("sets the cookies file with the chosen path", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(status) as unknown as TauriInvoke;
    await setVideoDownloadCookiesFile("/tmp/cookies.txt", invokeCommand);
    expect(invokeCommand).toHaveBeenCalledWith(
      "set_video_download_cookies_file",
      { path: "/tmp/cookies.txt" },
    );
  });

  it("clears the cookies file", async () => {
    const invokeCommand = vi
      .fn()
      .mockResolvedValue({ ...status, cookiesEnabled: false }) as unknown as TauriInvoke;
    await clearVideoDownloadCookiesFile(invokeCommand);
    expect(invokeCommand).toHaveBeenCalledWith(
      "clear_video_download_cookies_file",
    );
  });

  it("returns the first entry when the dialog yields an array", async () => {
    const openDialog = vi
      .fn()
      .mockResolvedValue(["/tmp/cookies.txt"]) as unknown as typeof open;
    await expect(selectCookiesFile(openDialog)).resolves.toBe("/tmp/cookies.txt");
  });

  it("returns null when the dialog is cancelled", async () => {
    const openDialog = vi.fn().mockResolvedValue(null) as unknown as typeof open;
    await expect(selectCookiesFile(openDialog)).resolves.toBeNull();
  });
});
