import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getHostTriple, sidecarFileName } from "./setup-dev-sidecars.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = join(__dirname, "..");
const rustCrateDir = join(projectDir, "src-tauri");
const swiftPackageDir = join(rustCrateDir, "sidecars", "fluidaudio-swift");
export const SUPPORTED_FLUIDAUDIO_TARGET_TRIPLE = "aarch64-apple-darwin";

export function targetTripleFromArgs(args) {
  const targetFlagIndex = args.indexOf("--target");
  if (targetFlagIndex >= 0) {
    const targetTriple = args[targetFlagIndex + 1];
    if (!targetTriple) {
      throw new Error("--target requires a target triple");
    }
    return targetTriple;
  }

  return getHostTriple();
}

export function releaseModeFromArgs(args) {
  if (args.includes("--debug")) return false;
  if (args.includes("--release")) return true;
  return true;
}

export function buildFluidAudioSidecar({
  execFile = execFileSync,
  targetTriple = getHostTriple(),
  release = true,
  binariesDir = join(rustCrateDir, "binaries"),
  packageDir = swiftPackageDir,
} = {}) {
  if (targetTriple !== SUPPORTED_FLUIDAUDIO_TARGET_TRIPLE) {
    return {
      skipped: true,
      reason: `FluidAudio sidecar is only built for ${SUPPORTED_FLUIDAUDIO_TARGET_TRIPLE}`,
      targetTriple,
    };
  }

  const configuration = release ? "release" : "debug";
  execFile(
    "swift",
    ["build", "-c", configuration, "--arch", "arm64", "--package-path", packageDir],
    {
      cwd: packageDir,
      stdio: "inherit",
    },
  );

  const archSourcePath = join(
    packageDir,
    ".build",
    "arm64-apple-macosx",
    configuration,
    "openbrief-fluidaudio",
  );
  const defaultSourcePath = join(packageDir, ".build", configuration, "openbrief-fluidaudio");
  const sourcePath = existsSync(archSourcePath) ? archSourcePath : defaultSourcePath;
  if (!existsSync(sourcePath)) {
    throw new Error(`Built FluidAudio sidecar not found: ${sourcePath}`);
  }

  mkdirSync(binariesDir, { recursive: true });
  const destinationName = sidecarFileName("openbrief-fluidaudio", targetTriple);
  const destinationPath = join(binariesDir, destinationName);
  copyFileSync(sourcePath, destinationPath);
  chmodSync(destinationPath, 0o755);

  return {
    skipped: false,
    sourcePath,
    destinationName,
    destinationPath,
    size: statSync(destinationPath).size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const result = buildFluidAudioSidecar({
    targetTriple: targetTripleFromArgs(args),
    release: releaseModeFromArgs(args),
  });

  if (result.skipped) {
    console.log(`Skipped FluidAudio sidecar: ${result.reason}`);
  } else {
    console.log(`Copied FluidAudio sidecar: ${result.destinationName} (${result.size} bytes)`);
  }
}
