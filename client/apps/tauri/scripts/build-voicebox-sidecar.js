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
const sidecarSourceDir = join(rustCrateDir, "sidecars", "voicebox-python");
const buildRoot = join(rustCrateDir, "target", "voicebox-sidecar");
const sidecarBaseName = "openbrief-voicebox";

export function releaseModeFromArgs(args) {
  if (args.includes("--debug")) return false;
  if (args.includes("--release")) return true;
  return true;
}

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

export function normalizeBuildProfile(profile) {
  if (["tts", "asr", "smoke"].includes(profile)) {
    return profile;
  }
  throw new Error(`Unsupported Voicebox build profile '${profile}'. Supported: tts, asr, smoke`);
}

export function buildProfileFromArgs(args) {
  const profileFlagIndex = args.indexOf("--profile");
  if (profileFlagIndex >= 0) {
    const profile = args[profileFlagIndex + 1];
    if (!profile) {
      throw new Error("--profile requires tts, asr, or smoke");
    }
    return normalizeBuildProfile(profile);
  }

  return normalizeBuildProfile(process.env.OPENBRIEF_VOICEBOX_PROFILE || "tts");
}

export function pythonExecutableForPlatform(platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}

export function venvPythonPath(venvDir, targetTriple) {
  return targetTriple.includes("windows")
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

export function pyinstallerOutputPath({ distDir, targetTriple }) {
  const executable = targetTriple.includes("windows")
    ? `${sidecarBaseName}.exe`
    : sidecarBaseName;
  return join(distDir, executable);
}

export function extrasForBuildProfile({ profile, targetTriple }) {
  const extras = [];
  if (profile === "tts") {
    extras.push("qwen-tts", "torch");
  } else if (profile === "asr") {
    extras.push("qwen-asr", "torch");
  }

  if (targetTriple === "aarch64-apple-darwin" && profile !== "smoke") {
    extras.push("mlx");
  }

  return extras;
}

export function pyinstallerCollectArgs({ profile, targetTriple }) {
  const args = [];
  const addCollectAll = (moduleName) => {
    args.push("--collect-all", moduleName);
  };
  const addCopyMetadata = (packageName) => {
    args.push("--copy-metadata", packageName);
  };

  if (profile === "smoke") {
    return args;
  }

  addCollectAll("huggingface_hub");
  addCollectAll("soundfile");
  addCollectAll("transformers");
  addCollectAll("tokenizers");
  addCollectAll(profile === "tts" ? "qwen_tts" : "qwen_asr");
  args.push("--hidden-import", "torch");

  addCopyMetadata(profile === "tts" ? "qwen-tts" : "qwen-asr");
  addCopyMetadata("transformers");
  addCopyMetadata("huggingface-hub");
  addCopyMetadata("tokenizers");
  addCopyMetadata("safetensors");

  if (targetTriple === "aarch64-apple-darwin") {
    addCollectAll("mlx");
    addCollectAll("mlx_audio");
    addCopyMetadata("mlx");
    addCopyMetadata("mlx-audio");
  }

  return args;
}

export function copyBuiltVoiceboxSidecar({
  targetTriple = getHostTriple(),
  sourcePath,
  binariesDir = join(rustCrateDir, "binaries"),
} = {}) {
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`Built Voicebox sidecar not found: ${sourcePath}`);
  }

  mkdirSync(binariesDir, { recursive: true });
  const destinationName = sidecarFileName(sidecarBaseName, targetTriple);
  const destinationPath = join(binariesDir, destinationName);
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

export function buildVoiceboxSidecar({
  execFile = execFileSync,
  targetTriple = getHostTriple(),
  hostTriple = getHostTriple(),
  profile = normalizeBuildProfile(process.env.OPENBRIEF_VOICEBOX_PROFILE || "tts"),
  release = true,
  binariesDir = join(rustCrateDir, "binaries"),
  sourceDir = sidecarSourceDir,
  root = buildRoot,
  platform = process.platform,
} = {}) {
  if (release && targetTriple !== hostTriple) {
    throw new Error(
      `PyInstaller cannot cross-compile Voicebox sidecars; build ${targetTriple} on its matching host instead of ${hostTriple}`,
    );
  }

  createDevSidecarPlaceholder({
    binariesDir,
    baseName: sidecarBaseName,
    targetTriple,
    message:
      "OpenBrief dev Voicebox sidecar placeholder. Build the PyInstaller sidecar before packaging.",
  });

  if (!release) {
    return {
      skipped: true,
      reason: "debug builds use the dev placeholder",
      targetTriple,
    };
  }

  const venvDir = join(root, "venv", targetTriple);
  const distDir = join(root, "dist", targetTriple);
  const workDir = join(root, "work", targetTriple);
  const specDir = join(root, "spec", targetTriple);
  const bootstrapPython = pythonExecutableForPlatform(platform);
  const python = venvPythonPath(venvDir, targetTriple);

  if (!existsSync(python)) {
    execFile(bootstrapPython, ["-m", "venv", venvDir], { stdio: "inherit" });
  }

  execFile(python, ["-m", "pip", "install", "--upgrade", "pip"], {
    stdio: "inherit",
  });
  execFile(python, ["-m", "pip", "install", "pyinstaller"], {
    stdio: "inherit",
  });
  const extras = extrasForBuildProfile({ profile, targetTriple });
  if (extras.length > 0) {
    execFile(python, ["-m", "pip", "install", `${sourceDir}[${extras.join(",")}]`], {
      stdio: "inherit",
    });
  } else {
    execFile(python, ["-m", "pip", "install", sourceDir], {
      stdio: "inherit",
    });
  }

  mkdirSync(distDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(specDir, { recursive: true });

  execFile(
    python,
    [
      "-m",
      "PyInstaller",
      "--clean",
      "--onefile",
      "--name",
      sidecarBaseName,
      "--distpath",
      distDir,
      "--workpath",
      workDir,
      "--specpath",
      specDir,
      ...pyinstallerCollectArgs({ profile, targetTriple }),
      join(sourceDir, "openbrief_voicebox.py"),
    ],
    {
      cwd: sourceDir,
      stdio: "inherit",
    },
  );

  return {
    skipped: false,
    ...copyBuiltVoiceboxSidecar({
      binariesDir,
      targetTriple,
      sourcePath: pyinstallerOutputPath({ distDir, targetTriple }),
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const result = buildVoiceboxSidecar({
    targetTriple: targetTripleFromArgs(args),
    profile: buildProfileFromArgs(args),
    release: releaseModeFromArgs(args),
  });

  if (result.skipped) {
    console.log(`Skipped Voicebox sidecar: ${result.reason}`);
  } else {
    console.log(`Copied Voicebox sidecar: ${result.destinationName} (${result.size} bytes)`);
  }
}
