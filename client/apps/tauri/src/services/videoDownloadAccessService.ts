import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { VideoDownloadAccessStatus } from "@/domain/settings";
import type { TauriInvoke } from "@/services/tauriHelperClient";

/**
 * Renderer-side client for the Rust-owned video-download access config.
 *
 * The renderer only ever hands a chosen path to Rust, which validates and
 * persists it; Rust resolves it into yt-dlp argv at download time. Secrets and
 * authority-bearing paths never live in renderer state.
 */
export async function loadVideoDownloadAccessStatus(
  invokeCommand: TauriInvoke = invoke,
): Promise<VideoDownloadAccessStatus> {
  return invokeCommand<VideoDownloadAccessStatus>("video_download_access_status");
}

export async function setVideoDownloadCookiesFile(
  path: string,
  invokeCommand: TauriInvoke = invoke,
): Promise<VideoDownloadAccessStatus> {
  return invokeCommand<VideoDownloadAccessStatus>(
    "set_video_download_cookies_file",
    { path },
  );
}

export async function clearVideoDownloadCookiesFile(
  invokeCommand: TauriInvoke = invoke,
): Promise<VideoDownloadAccessStatus> {
  return invokeCommand<VideoDownloadAccessStatus>(
    "clear_video_download_cookies_file",
  );
}

type OpenDialog = typeof open;

/** Open a native picker for a cookies.txt file. Returns null if cancelled. */
export async function selectCookiesFile(
  openDialog: OpenDialog = open,
): Promise<string | null> {
  const selected = await openDialog({
    title: "Select cookies.txt",
    multiple: false,
    directory: false,
    filters: [{ name: "Cookies", extensions: ["txt"] }],
  });

  if (Array.isArray(selected)) {
    return selected[0] ?? null;
  }

  return selected ?? null;
}
