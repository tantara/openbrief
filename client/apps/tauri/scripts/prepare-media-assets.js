import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getHostTriple, SUPPORTED_HELPER_TARGET_TRIPLES } from "./setup-dev-sidecars.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

export const YTDLP_VERSION = "2026.03.17";
export const YTDLP_RELEASE_BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;
export const MEDIA_TOOL_NAMES = ["yt-dlp", "ffmpeg", "ffprobe"];

export const mediaToolTargetSources = {
  "aarch64-apple-darwin": {
    ytdlpAsset: "yt-dlp_macos",
    ffmpegPackage: "@ffmpeg-installer/darwin-arm64",
    ffprobePackage: "@ffprobe-installer/darwin-arm64",
  },
  "x86_64-apple-darwin": {
    ytdlpAsset: "yt-dlp_macos",
    ffmpegPackage: "@ffmpeg-installer/darwin-x64",
    ffprobePackage: "@ffprobe-installer/darwin-x64",
  },
  "x86_64-pc-windows-msvc": {
    ytdlpAsset: "yt-dlp.exe",
    ffmpegPackage: "@ffmpeg-installer/win32-x64",
    ffprobePackage: "@ffprobe-installer/win32-x64",
  },
  "x86_64-unknown-linux-gnu": {
    ytdlpAsset: "yt-dlp_linux",
    ffmpegPackage: "@ffmpeg-installer/linux-x64",
    ffprobePackage: "@ffprobe-installer/linux-x64",
  },
  "aarch64-unknown-linux-gnu": {
    ytdlpAsset: "yt-dlp_linux_aarch64",
    ffmpegPackage: "@ffmpeg-installer/linux-arm64",
    ffprobePackage: "@ffprobe-installer/linux-arm64",
  },
};

export function executableName(toolName, targetTriple) {
  return targetTriple.includes("windows") ? `${toolName}.exe` : toolName;
}

export function mediaToolsDirForTarget({
  resourcesDir = join(__dirname, "..", "src-tauri", "resources", "media-tools"),
  targetTriple,
}) {
  return join(resourcesDir, targetTriple);
}

export function resolvePackageJsonPath(packageName) {
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch (error) {
    const installerRoot =
      packageName.startsWith("@ffmpeg-installer/")
        ? "@ffmpeg-installer/ffmpeg"
        : packageName.startsWith("@ffprobe-installer/")
          ? "@ffprobe-installer/ffprobe"
          : null;

    if (!installerRoot) {
      throw error;
    }

    const installerPackageJsonPath = require.resolve(`${installerRoot}/package.json`);
    const nestedPackageJsonPath = join(
      dirname(dirname(installerPackageJsonPath)),
      packageName.split("/")[1],
      "package.json",
    );
    if (!existsSync(nestedPackageJsonPath)) {
      throw error;
    }

    return nestedPackageJsonPath;
  }
}

export function packageBinaryPath(packageName, binaryName) {
  const resolvedPackageJsonPath = resolvePackageJsonPath(packageName);
  return join(dirname(resolvedPackageJsonPath), binaryName);
}

export function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function describePreparedTool({
  tool,
  targetTriple,
  filePath,
  source,
  sourceVersion,
  license,
}) {
  return {
    name: tool,
    targetTriple,
    fileName: executableName(tool, targetTriple),
    relativePath: `${targetTriple}/${executableName(tool, targetTriple)}`,
    source,
    sourceVersion,
    license,
    sha256: sha256File(filePath),
    sizeBytes: statSync(filePath).size,
    executablePermission: targetTriple.includes("windows")
      ? "not-applicable"
      : "required-on-unix",
  };
}

export async function downloadFile(url, destinationPath, { httpsGet = get } = {}) {
  await new Promise((resolve, reject) => {
    const request = httpsGet(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadFile(response.headers.location, destinationPath, { httpsGet })
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download_failed:${response.statusCode}:${url}`));
        return;
      }

      const file = createWriteStream(destinationPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

export function copyPackagedBinary({ packageName, binaryName, destinationPath }) {
  const sourcePath = packageBinaryPath(packageName, binaryName);
  if (!existsSync(sourcePath)) {
    throw new Error(`media_tool_package_binary_missing:${packageName}/${binaryName}`);
  }
  copyFileSync(sourcePath, destinationPath);
}

export function adHocSignMacOSBinary(filePath, { spawn = spawnSync } = {}) {
  if (process.platform !== "darwin") {
    return;
  }

  const result = spawn("codesign", ["--force", "--sign", "-", filePath], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    return;
  }

  const details = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  throw new Error(`macos_codesign_failed:${details || result.error?.message || "unknown"}`);
}

export function readPackageMetadata(packageName) {
  const resolvedPackageJsonPath = resolvePackageJsonPath(packageName);
  return JSON.parse(readFileSync(resolvedPackageJsonPath, "utf8"));
}

export async function prepareMediaAssets({
  targetTriple = getHostTriple(),
  resourcesDir = join(__dirname, "..", "src-tauri", "resources", "media-tools"),
  download = downloadFile,
  signMacOSBinary = adHocSignMacOSBinary,
} = {}) {
  const targetSources = mediaToolTargetSources[targetTriple];
  if (!targetSources) {
    throw new Error(`unsupported_media_tool_target:${targetTriple}`);
  }

  const targetDir = mediaToolsDirForTarget({ resourcesDir, targetTriple });
  mkdirSync(targetDir, { recursive: true });

  const ytdlpPath = join(targetDir, executableName("yt-dlp", targetTriple));
  await download(`${YTDLP_RELEASE_BASE}/${targetSources.ytdlpAsset}`, ytdlpPath);

  const ffmpegPath = join(targetDir, executableName("ffmpeg", targetTriple));
  const ffprobePath = join(targetDir, executableName("ffprobe", targetTriple));
  copyPackagedBinary({
    packageName: targetSources.ffmpegPackage,
    binaryName: executableName("ffmpeg", targetTriple),
    destinationPath: ffmpegPath,
  });
  copyPackagedBinary({
    packageName: targetSources.ffprobePackage,
    binaryName: executableName("ffprobe", targetTriple),
    destinationPath: ffprobePath,
  });

  if (!targetTriple.includes("windows")) {
    for (const path of [ytdlpPath, ffmpegPath, ffprobePath]) {
      chmodSync(path, 0o755);
    }
  }
  if (targetTriple.includes("apple-darwin")) {
    signMacOSBinary(ytdlpPath);
  }

  const ffmpegMetadata = readPackageMetadata(targetSources.ffmpegPackage);
  const ffprobeMetadata = readPackageMetadata(targetSources.ffprobePackage);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetTriple,
    tools: [
      describePreparedTool({
        tool: "yt-dlp",
        targetTriple,
        filePath: ytdlpPath,
        source: `${YTDLP_RELEASE_BASE}/${targetSources.ytdlpAsset}`,
        sourceVersion: YTDLP_VERSION,
        license: "Unlicense",
      }),
      describePreparedTool({
        tool: "ffmpeg",
        targetTriple,
        filePath: ffmpegPath,
        source: targetSources.ffmpegPackage,
        sourceVersion: ffmpegMetadata.ffmpeg ?? ffmpegMetadata.version,
        license: ffmpegMetadata.license,
      }),
      describePreparedTool({
        tool: "ffprobe",
        targetTriple,
        filePath: ffprobePath,
        source: targetSources.ffprobePackage,
        sourceVersion: ffprobeMetadata.ffprobe ?? ffprobeMetadata.version,
        license: ffprobeMetadata.license,
      }),
    ],
  };

  writeFileSync(join(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function targetTripleFromArgs(args) {
  const targetFlagIndex = args.indexOf("--target");
  if (targetFlagIndex >= 0) {
    const targetTriple = args[targetFlagIndex + 1];
    if (!targetTriple) {
      throw new Error("--target requires a Rust target triple");
    }
    return targetTriple;
  }

  return getHostTriple();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targetTriple = targetTripleFromArgs(process.argv.slice(2));
  if (!SUPPORTED_HELPER_TARGET_TRIPLES.includes(targetTriple)) {
    throw new Error(`Unsupported target triple: ${targetTriple}`);
  }

  const manifest = await prepareMediaAssets({ targetTriple });
  for (const tool of manifest.tools) {
    console.log(
      `Prepared ${tool.name} for ${targetTriple}: ${tool.fileName} (${tool.sizeBytes} bytes, sha256:${tool.sha256})`,
    );
  }
}
