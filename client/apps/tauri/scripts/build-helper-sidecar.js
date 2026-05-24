import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createDevSidecarPlaceholder,
  getHostTriple,
  sidecarFileName,
} from "./setup-dev-sidecars.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = join(__dirname, "..");
const rustCrateDir = join(projectDir, "src-tauri");
const helperCrateDir = join(rustCrateDir, "helper");

export function builtHelperPath({
  profile = "release",
  platform = process.platform,
  targetTriple,
} = {}) {
  const executable =
    platform === "win32" || targetTriple?.includes("windows")
      ? "openbrief-helper.exe"
      : "openbrief-helper";

  if (targetTriple) {
    return join(rustCrateDir, "target", targetTriple, profile, executable);
  }

  return join(rustCrateDir, "target", profile, executable);
}

export function copyBuiltHelperSidecar({
  targetTriple = getHostTriple(),
  profile = "release",
  sourcePath = builtHelperPath({ profile }),
  binariesDir = join(rustCrateDir, "binaries"),
} = {}) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Built helper binary not found: ${sourcePath}`);
  }

  const destinationName = sidecarFileName("openbrief-helper", targetTriple);
  const destinationPath = join(binariesDir, destinationName);
  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(sourcePath, destinationPath);

  if (!destinationName.endsWith(".exe")) {
    chmodSync(destinationPath, 0o755);
  }

  return {
    sourcePath,
    destinationName,
    destinationPath,
    size: statSync(destinationPath).size,
  };
}

export function buildHelperSidecar({
  execFile = execFileSync,
  binariesDir = join(rustCrateDir, "binaries"),
  sourcePath,
  targetTriple = getHostTriple(),
  release = true,
} = {}) {
  const cargoArgs = [
    "build",
    "--manifest-path",
    join(helperCrateDir, "Cargo.toml"),
    "--target-dir",
    join(rustCrateDir, "target"),
  ];
  if (targetTriple) {
    cargoArgs.push("--target", targetTriple);
  }
  if (release) {
    cargoArgs.push("--release");
  }

  createDevSidecarPlaceholder({
    binariesDir,
    baseName: "openbrief-helper",
    targetTriple,
  });

  execFile("cargo", cargoArgs, {
    cwd: rustCrateDir,
    env: {
      ...process.env,
      OPENBRIEF_BUILDING_HELPER_SIDECAR: "1",
    },
    stdio: "inherit",
  });

  return copyBuiltHelperSidecar({
    binariesDir,
    targetTriple,
    profile: release ? "release" : "debug",
    sourcePath:
      sourcePath ??
      builtHelperPath({
        profile: release ? "release" : "debug",
        targetTriple,
      }),
  });
}

export function releaseModeFromArgs(args) {
  if (args.includes("--debug")) {
    return false;
  }

  if (args.includes("--release")) {
    return true;
  }

  return true;
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
  const result = buildHelperSidecar({
    targetTriple: targetTripleFromArgs(process.argv.slice(2)),
    release: releaseModeFromArgs(process.argv.slice(2)),
  });
  console.log(`Copied helper sidecar: ${result.destinationName} (${result.size} bytes)`);
}
