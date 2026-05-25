import type { TranscriptSegment, VideoProviderKind } from "@/domain/media-library";

export const helperProtocolVersion = 1;

export type HelperCommandName =
  | "probe_media"
  | "download_youtube"
  | "extract_thumbnail"
  | "list_captions"
  | "extract_captions"
  | "extract_audio"
  | "transcode_video"
  | "transcribe_audio"
  | "cancel_job";

export type HelperCommandBase<TName extends HelperCommandName> = {
  protocolVersion: typeof helperProtocolVersion;
  command: TName;
  jobId: string;
};

export type ProbeMediaCommand = HelperCommandBase<"probe_media"> & {
  inputPath: string;
};

export type DownloadYoutubeCommand = HelperCommandBase<"download_youtube"> & {
  url: string;
  sourceKind: VideoProviderKind;
  outputDir: string;
  tempDir: string;
  subtitleLanguages: string[];
};

export type ExtractThumbnailCommand = HelperCommandBase<"extract_thumbnail"> & {
  videoPath: string;
  outputPath: string;
  tempDir: string;
  timestampSeconds?: number;
};

export type CaptionLanguage = {
  code: string;
  label: string;
  kind: "manual" | "automatic";
};

export type ListCaptionsCommand = HelperCommandBase<"list_captions"> & {
  sourceUrl: string;
};

export type ExtractCaptionsCommand = HelperCommandBase<"extract_captions"> & {
  videoPath: string;
  sourceUrl?: string;
  outputDir: string;
  languages: string[];
};

export type ExtractAudioCommand = HelperCommandBase<"extract_audio"> & {
  videoPath: string;
  outputPath: string;
  tempDir: string;
};

export type TranscodeVideoCommand = HelperCommandBase<"transcode_video"> & {
  videoPath: string;
  outputPath: string;
  tempDir: string;
};

export type TranscribeAudioCommand = HelperCommandBase<"transcribe_audio"> & {
  audioPath: string;
  enginePreference?: "auto" | "whisper" | "fluidaudio" | "qwen3-asr";
  modelId?: string;
  modelPath: string;
  outputPath: string;
  language?: string;
};

export type CancelJobCommand = HelperCommandBase<"cancel_job"> & {
  targetJobId: string;
};

export type HelperCommand =
  | ProbeMediaCommand
  | DownloadYoutubeCommand
  | ExtractThumbnailCommand
  | ListCaptionsCommand
  | ExtractCaptionsCommand
  | ExtractAudioCommand
  | TranscodeVideoCommand
  | TranscribeAudioCommand
  | CancelJobCommand;

export type HelperEvent =
  | {
      type: "job_started";
      jobId: string;
      command: HelperCommandName;
    }
  | {
      type: "job_progress";
      jobId: string;
      command: HelperCommandName;
      progressPercent: number;
      message?: string;
    }
  | {
      type: "job_completed";
      jobId: string;
      command: HelperCommandName;
      result: HelperCommandResult;
    }
  | {
      type: "job_failed";
      jobId: string;
      command: HelperCommandName;
      errorCode: HelperErrorCode;
      message: string;
    }
  | {
      type: "job_cancelled";
      jobId: string;
      command: "cancel_job";
      targetJobId: string;
    };

export type HelperErrorCode =
  | "unsupported_url"
  | "invalid_command"
  | "cancelled"
  | "helper_unavailable";

export type HelperCommandResult =
  | {
      command: "probe_media";
      durationSeconds: number;
      fileSizeBytes: number;
      container: string;
      videoCodec?: string;
      audioCodec?: string;
    }
  | {
      command: "download_youtube";
      videoPath: string;
      title: string;
      captionsAvailable: boolean;
      thumbnailPath?: string;
      authorName?: string;
      authorUrl?: string;
    }
  | {
      command: "extract_thumbnail";
      thumbnailPath: string;
    }
  | {
      command: "list_captions";
      languages: CaptionLanguage[];
    }
  | {
      command: "extract_captions";
      captionsPath?: string;
      captionsAvailable: boolean;
      segments?: TranscriptSegment[];
    }
  | {
      command: "extract_audio";
      audioPath: string;
    }
  | {
      command: "transcode_video";
      videoPath: string;
    }
  | {
      command: "transcribe_audio";
      transcriptPath: string;
      text?: string;
      segments?: TranscriptSegment[];
      engine?: "whisper" | "fluidaudio" | "qwen3-asr";
      modelId?: string;
      language?: string;
    }
  | {
      command: "cancel_job";
      targetJobId: string;
      cancelled: boolean;
    };

export type VideoProviderUrlClassification =
  | {
      kind: "single-video";
      normalizedUrl: string;
      provider: VideoProviderKind;
      label: string;
    }
  | {
      kind: "unsupported-playlist-or-channel";
      reason: string;
      provider?: VideoProviderKind;
      label?: string;
    }
  | {
      kind: "unsupported-provider";
      reason: string;
    };

const forbiddenSecretKeyFragments = [
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "oauth",
  "provider",
  "secret",
  "token",
];

const providerLabels: Record<VideoProviderKind, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  twitch: "Twitch",
  vimeo: "Vimeo",
};

export const supportedVideoProviderDomains: Record<VideoProviderKind, string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  twitch: ["twitch.tv", "clips.twitch.tv"],
  vimeo: ["vimeo.com", "player.vimeo.com"],
};

export function classifyVideoProviderUrl(input: string): VideoProviderUrlClassification {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return { kind: "unsupported-provider", reason: "URL parsing failed" };
  }

  const hostname = normalizeHostname(url.hostname);
  const provider = providerFromHostname(hostname);

  if (!provider) {
    return {
      kind: "unsupported-provider",
      reason: "Supported video providers are YouTube, TikTok, Twitch, and Vimeo",
    };
  }

  const label = providerLabels[provider];

  if (isUnsupportedCollectionUrl(url, hostname, provider)) {
    return {
      kind: "unsupported-playlist-or-channel",
      provider,
      label,
      reason: "Playlist, channel, profile, and collection imports are not supported in v1",
    };
  }

  if (isSingleVideoUrl(url, hostname, provider)) {
    return { kind: "single-video", normalizedUrl: url.toString(), provider, label };
  }

  return {
    kind: "unsupported-playlist-or-channel",
    provider,
    label,
    reason: `Only single ${label} video URLs are supported in v1`,
  };
}

export const classifyYoutubeUrl = classifyVideoProviderUrl;

export function validateHelperCommand(command: HelperCommand) {
  if (command.protocolVersion !== helperProtocolVersion) {
    return { ok: false as const, errorCode: "invalid_command" as const };
  }

  if (helperPayloadContainsProviderSecret(command)) {
    return { ok: false as const, errorCode: "invalid_command" as const };
  }

  if (command.command === "download_youtube" || command.command === "list_captions") {
    const classification = classifyVideoProviderUrl(
      command.command === "download_youtube" ? command.url : command.sourceUrl,
    );

    if (classification.kind !== "single-video") {
      return { ok: false as const, errorCode: "unsupported_url" as const };
    }
  }

  return { ok: true as const };
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^(www|m)\./, "");
}

function providerFromHostname(hostname: string): VideoProviderKind | undefined {
  const entry = Object.entries(supportedVideoProviderDomains).find(([, domains]) =>
    domains.includes(hostname),
  );

  if (entry) return entry[0] as VideoProviderKind;

  return undefined;
}

function isUnsupportedCollectionUrl(
  url: URL,
  hostname: string,
  provider: VideoProviderKind,
) {
  const path = normalizedPathname(url);

  switch (provider) {
    case "youtube":
      return (
        url.searchParams.has("list") ||
        path.startsWith("/playlist") ||
        path.startsWith("/channel/") ||
        path.startsWith("/c/") ||
        path.startsWith("/@")
      );
    case "tiktok":
      return (
        path === "/" ||
        /^\/@[^/]+\/?$/.test(path) ||
        path.startsWith("/tag/") ||
        path.startsWith("/music/")
      );
    case "twitch":
      return hostname === "twitch.tv" && /^\/[^/]+\/?$/.test(path);
    case "vimeo":
      return ["/channels/", "/album/", "/groups/", "/ondemand/", "/showcase/"].some(
        (prefix) => path.startsWith(prefix),
      );
  }
}

function isSingleVideoUrl(url: URL, hostname: string, provider: VideoProviderKind) {
  const path = normalizedPathname(url);

  switch (provider) {
    case "youtube":
      return (
        (hostname === "youtu.be" && path.length > 1) ||
        (path === "/watch" && url.searchParams.has("v")) ||
        path.startsWith("/shorts/") ||
        path.startsWith("/embed/")
      );
    case "tiktok":
      return (
        /^\/@[^/]+\/video\/[^/]+/.test(path) ||
        path.startsWith("/t/") ||
        hostname === "vm.tiktok.com" ||
        hostname === "vt.tiktok.com"
      );
    case "twitch":
      return (
        path.startsWith("/videos/") ||
        /^\/[^/]+\/clip\/[^/]+/.test(path) ||
        hostname === "clips.twitch.tv"
      );
    case "vimeo":
      return (
        /^\/\d+/.test(path) ||
        path.startsWith("/video/") ||
        path.startsWith("/manage/videos/")
      );
  }
}

function normalizedPathname(url: URL) {
  return url.pathname.replace(/\/+$/, "") || "/";
}

export function helperPayloadContainsProviderSecret(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => helperPayloadContainsProviderSecret(item));
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    const normalizedKey = key.toLowerCase().replace(/[-\s]/g, "_");
    const hasForbiddenKey = forbiddenSecretKeyFragments.some((fragment) =>
      normalizedKey.includes(fragment),
    );

    return hasForbiddenKey || helperPayloadContainsProviderSecret(nestedValue);
  });
}
