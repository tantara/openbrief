import { openUrl } from "@tauri-apps/plugin-opener";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";

export type ExternalUrlOpener = (url: string | URL) => Promise<void>;

export function isOpenableWebUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function providerLabelForWebUrl(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtube.com" || hostname === "youtu.be") return "YouTube";
    if (
      hostname === "tiktok.com" ||
      hostname === "vm.tiktok.com" ||
      hostname === "vt.tiktok.com"
    ) {
      return "TikTok";
    }
    if (hostname === "twitch.tv" || hostname === "clips.twitch.tv") {
      return "Twitch";
    }
    if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
      return "Vimeo";
    }

    return url.hostname;
  } catch {
    return undefined;
  }
}

export async function openExternalWebUrl(
  url: string,
  opener: ExternalUrlOpener = openUrl,
) {
  if (!isOpenableWebUrl(url)) {
    throw new Error("external_url_not_openable");
  }

  if (canUseTauriRuntime()) {
    await opener(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
