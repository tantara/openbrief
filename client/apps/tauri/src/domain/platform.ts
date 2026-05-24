export type DesktopPlatform = "macos" | "windows" | "linux";

export type Architecture = "aarch64" | "x86_64";

export type PlatformTarget = {
  platform: DesktopPlatform;
  architecture: Architecture;
  rustTriple: string;
  executableSuffix: "" | ".exe";
  pathSeparator: "/" | "\\";
};

export type MediaToolName = "yt-dlp" | "ffmpeg" | "ffprobe";

export const helperSidecarBaseName = "openbrief-helper";
export const helperExternalBinPath = helperSidecarBaseName;

const targets: PlatformTarget[] = [
  {
    platform: "macos",
    architecture: "aarch64",
    rustTriple: "aarch64-apple-darwin",
    executableSuffix: "",
    pathSeparator: "/",
  },
  {
    platform: "macos",
    architecture: "x86_64",
    rustTriple: "x86_64-apple-darwin",
    executableSuffix: "",
    pathSeparator: "/",
  },
  {
    platform: "windows",
    architecture: "x86_64",
    rustTriple: "x86_64-pc-windows-msvc",
    executableSuffix: ".exe",
    pathSeparator: "\\",
  },
  {
    platform: "linux",
    architecture: "x86_64",
    rustTriple: "x86_64-unknown-linux-gnu",
    executableSuffix: "",
    pathSeparator: "/",
  },
  {
    platform: "linux",
    architecture: "aarch64",
    rustTriple: "aarch64-unknown-linux-gnu",
    executableSuffix: "",
    pathSeparator: "/",
  },
];

export const supportedTargets = targets;

export function getTarget(platform: DesktopPlatform, architecture: Architecture) {
  return targets.find(
    (target) => target.platform === platform && target.architecture === architecture,
  );
}

export function sidecarBinaryName(baseName: string, target: PlatformTarget) {
  return `${baseName}-${target.rustTriple}${target.executableSuffix}`;
}

export function mediaToolBinaryName(tool: MediaToolName, target: PlatformTarget) {
  return `${tool}${target.executableSuffix}`;
}

export function sidecarBinaryPath(baseName: string, target: PlatformTarget) {
  return `src-tauri/binaries/${sidecarBinaryName(baseName, target)}`;
}

export type BundledMediaToolContract = {
  tool: MediaToolName;
  targetTriple: string;
  executableName: string;
  relativePath: string;
  versionArgs: readonly string[];
  purpose: "youtube-download" | "media-probe" | "audio-extraction";
  executablePermission: "required-on-unix" | "not-applicable";
};

const mediaToolPurposes: Record<MediaToolName, BundledMediaToolContract["purpose"]> = {
  "yt-dlp": "youtube-download",
  ffmpeg: "audio-extraction",
  ffprobe: "media-probe",
};

const mediaToolVersionArgs: Record<MediaToolName, readonly string[]> = {
  "yt-dlp": ["--version"],
  ffmpeg: ["-version"],
  ffprobe: ["-version"],
};

export function bundledMediaToolContracts(
  target: PlatformTarget,
): BundledMediaToolContract[] {
  return (["yt-dlp", "ffmpeg", "ffprobe"] as const).map((tool) => {
    const executableName = mediaToolBinaryName(tool, target);

    return {
      tool,
      targetTriple: target.rustTriple,
      executableName,
      relativePath: `media-tools/${target.rustTriple}/${executableName}`,
      versionArgs: mediaToolVersionArgs[tool],
      purpose: mediaToolPurposes[tool],
      executablePermission:
        target.platform === "windows" ? "not-applicable" : "required-on-unix",
    };
  });
}
