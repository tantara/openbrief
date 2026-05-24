import {
  getTarget,
  type Architecture,
  type DesktopPlatform,
  type PlatformTarget,
} from "@/domain/platform";

export type CompatibilitySeverity = "supported" | "warning" | "blocked";

export type CompatibilityFeatureId =
  | "target"
  | "video-download"
  | "media-tools"
  | "local-stt"
  | `stt-model:${string}`;

export type CompatibilityFeature = {
  id: CompatibilityFeatureId;
  label: string;
  severity: CompatibilitySeverity;
  message: string;
};

export type PlatformCompatibilityReport = {
  platform: DesktopPlatform | "unknown";
  architecture: Architecture | "unknown";
  platformLabel: string;
  targetKey: string;
  targetTriple?: string;
  targetSupported: boolean;
  summarySeverity: CompatibilitySeverity;
  summaryMessage: string;
  features: CompatibilityFeature[];
};

export type CompatibilityReportInput = {
  platform: string;
  architecture: string;
  downloaderStatus?: "available" | "unavailable" | "unknown";
  ytdlpIsStale?: boolean;
  mediaTools?: Array<{ tool: string; status: "configured" | "unknown" }>;
  sttModels?: Array<{ id: string; name: string; sizeMb: number }>;
};

const supportedTargetWarning: Partial<Record<DesktopPlatform, string>> = {
  windows:
    "Windows x86_64 is supported by the packaging contract, but needs package smoke before release-quality claims.",
  linux:
    "Linux support depends on distro codec, WebView, and executable-permission smoke for the packaged build.",
};

export function createPlatformCompatibilityReport(
  input: CompatibilityReportInput,
): PlatformCompatibilityReport {
  const platform = normalizeDesktopPlatform(input.platform);
  const architecture = normalizeArchitecture(input.architecture);
  const target =
    platform === "unknown" || architecture === "unknown"
      ? undefined
      : getTarget(platform, architecture);

  const features = [
    createTargetFeature(platform, architecture, target),
    createVideoDownloadFeature(input, target),
    createMediaToolsFeature(input, target),
    createLocalSttFeature(platform, architecture, target),
    ...(input.sttModels ?? []).map((model) =>
      createSttModelFeature(model, platform, architecture, target),
    ),
  ];
  const summarySeverity = mostSevere(features.map((feature) => feature.severity));

  return {
    platform,
    architecture,
    platformLabel: formatPlatformLabel(platform, architecture),
    targetKey:
      platform === "unknown" || architecture === "unknown"
        ? "unknown"
        : `${platform}/${architecture}`,
    targetTriple: target?.rustTriple,
    targetSupported: Boolean(target),
    summarySeverity,
    summaryMessage: summaryMessage(summarySeverity),
    features,
  };
}

export function normalizeDesktopPlatform(
  platform: string,
): DesktopPlatform | "unknown" {
  const normalized = platform.toLowerCase();
  if (normalized === "macos" || normalized === "darwin") return "macos";
  if (normalized === "windows" || normalized === "win32") return "windows";
  if (normalized === "linux") return "linux";
  return "unknown";
}

export function normalizeArchitecture(
  architecture: string,
): Architecture | "unknown" {
  const normalized = architecture.toLowerCase();
  if (normalized === "aarch64" || normalized === "arm64") return "aarch64";
  if (
    normalized === "x86_64" ||
    normalized === "x64" ||
    normalized === "amd64"
  ) {
    return "x86_64";
  }
  return "unknown";
}

export function getFeatureCompatibility(
  report: PlatformCompatibilityReport | undefined,
  featureId: CompatibilityFeatureId,
) {
  return report?.features.find((feature) => feature.id === featureId);
}

export function getSttModelCompatibility(
  report: PlatformCompatibilityReport | undefined,
  modelId: string,
) {
  return getFeatureCompatibility(report, `stt-model:${modelId}`);
}

function createTargetFeature(
  platform: DesktopPlatform | "unknown",
  architecture: Architecture | "unknown",
  target: PlatformTarget | undefined,
): CompatibilityFeature {
  if (!target) {
    return {
      id: "target",
      label: "App target",
      severity: "blocked",
      message:
        platform === "unknown" || architecture === "unknown"
          ? "OpenBrief cannot identify this OS or CPU architecture, so packaged helper support is not trusted."
          : `${formatPlatformLabel(platform, architecture)} is not in the packaged target allowlist.`,
    };
  }

  const warning = supportedTargetWarning[target.platform];
  return {
    id: "target",
    label: "App target",
    severity: warning ? "warning" : "supported",
    message: warning ?? `${target.rustTriple} is an approved packaged target.`,
  };
}

function createVideoDownloadFeature(
  input: CompatibilityReportInput,
  target: PlatformTarget | undefined,
): CompatibilityFeature {
  if (!target) {
    return {
      id: "video-download",
      label: "Video download",
      severity: "blocked",
      message: "Video download requires a packaged target and bundled helper tools.",
    };
  }

  if (input.downloaderStatus === "unavailable") {
    return {
      id: "video-download",
      label: "Video download",
      severity: "blocked",
      message: "yt-dlp is not available to the helper on this target.",
    };
  }

  if (input.ytdlpIsStale) {
    return {
      id: "video-download",
      label: "Video download",
      severity: "warning",
      message:
        "yt-dlp is stale. Downloads may fail on hosts with frequent extractor changes until yt-dlp is updated.",
    };
  }

  if (input.downloaderStatus === "unknown") {
    return {
      id: "video-download",
      label: "Video download",
      severity: "warning",
      message: "yt-dlp availability has not been verified in this runtime.",
    };
  }

  return {
    id: "video-download",
    label: "Video download",
    severity: target.platform === "macos" ? "supported" : "warning",
    message:
      target.platform === "macos"
        ? "yt-dlp is available for this packaged target."
        : "yt-dlp is available, but this platform still needs packaged download smoke before release claims.",
  };
}

function createMediaToolsFeature(
  input: CompatibilityReportInput,
  target: PlatformTarget | undefined,
): CompatibilityFeature {
  const tools = input.mediaTools ?? [];
  const missingTools = ["ffmpeg", "ffprobe"].filter(
    (tool) =>
      !tools.some(
        (candidate) =>
          candidate.tool === tool && candidate.status === "configured",
      ),
  );

  if (!target) {
    return {
      id: "media-tools",
      label: "Media tools",
      severity: "blocked",
      message: "ffmpeg and ffprobe require a supported packaged target.",
    };
  }

  if (missingTools.length > 0) {
    return {
      id: "media-tools",
      label: "Media tools",
      severity: "warning",
      message: `${missingTools.join(", ")} has not been verified for this runtime.`,
    };
  }

  return {
    id: "media-tools",
    label: "Media tools",
    severity: target.platform === "macos" ? "supported" : "warning",
    message:
      target.platform === "macos"
        ? "ffmpeg and ffprobe are configured for this target."
        : "ffmpeg and ffprobe are configured, but packaged smoke is still required on this OS.",
  };
}

function createLocalSttFeature(
  platform: DesktopPlatform | "unknown",
  architecture: Architecture | "unknown",
  target: PlatformTarget | undefined,
): CompatibilityFeature {
  if (!target) {
    return {
      id: "local-stt",
      label: "Local transcription",
      severity: "blocked",
      message: "Local STT requires a supported packaged target and a compatible runtime.",
    };
  }

  if (platform === "linux" && architecture === "aarch64") {
    return {
      id: "local-stt",
      label: "Local transcription",
      severity: "warning",
      message:
        "Linux ARM64 local STT is allowed for small models only until runtime and model smoke is complete.",
    };
  }

  const warning = supportedTargetWarning[target.platform];
  return {
    id: "local-stt",
    label: "Local transcription",
    severity: warning ? "warning" : "supported",
    message:
      warning ??
      "Local transcription is supported on this target when a model is downloaded.",
  };
}

function createSttModelFeature(
  model: { id: string; name: string; sizeMb: number },
  platform: DesktopPlatform | "unknown",
  architecture: Architecture | "unknown",
  target: PlatformTarget | undefined,
): CompatibilityFeature {
  if (!target) {
    return {
      id: `stt-model:${model.id}`,
      label: model.name,
      severity: "blocked",
      message: `${model.name} cannot be downloaded until OpenBrief identifies a supported packaged target.`,
    };
  }

  const isLargeModel = model.sizeMb >= 1024 || /medium|large/i.test(model.id);
  if (platform === "linux" && architecture === "aarch64" && isLargeModel) {
    return {
      id: `stt-model:${model.id}`,
      label: model.name,
      severity: "blocked",
      message:
        `${model.name} is blocked on Linux ARM64 until memory and runtime smoke proves it is reliable.`,
    };
  }

  if (isLargeModel) {
    return {
      id: `stt-model:${model.id}`,
      label: model.name,
      severity: "warning",
      message:
        `${model.name} is large and may be slow or memory-heavy. Use it only when accuracy matters more than speed.`,
    };
  }

  const platformWarning = supportedTargetWarning[target.platform];
  return {
    id: `stt-model:${model.id}`,
    label: model.name,
    severity: platformWarning ? "warning" : "supported",
    message:
      platformWarning ??
      `${model.name} is compatible with the current local transcription target.`,
  };
}

function mostSevere(severities: CompatibilitySeverity[]): CompatibilitySeverity {
  if (severities.includes("blocked")) return "blocked";
  if (severities.includes("warning")) return "warning";
  return "supported";
}

function summaryMessage(severity: CompatibilitySeverity) {
  switch (severity) {
    case "supported":
      return "Core video, media, and transcription features are supported on this target.";
    case "warning":
      return "Core features can run, but this target has release or runtime caveats.";
    case "blocked":
      return "One or more core features are blocked on this target.";
  }
}

function formatPlatformLabel(
  platform: DesktopPlatform | "unknown",
  architecture: Architecture | "unknown",
) {
  const platformLabel =
    platform === "macos"
      ? "macOS"
      : platform === "windows"
        ? "Windows"
        : platform === "linux"
          ? "Linux"
          : "Unknown OS";
  const architectureLabel =
    architecture === "aarch64"
      ? "ARM64"
      : architecture === "x86_64"
        ? "Intel/AMD x64"
        : "unknown CPU";

  return `${platformLabel} ${architectureLabel}`;
}
