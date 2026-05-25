import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
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
const sidecarSourceDir = join(rustCrateDir, "sidecars", "localai-python");
const buildRoot = join(rustCrateDir, "target", "localai-sidecar");
const sidecarBaseName = "openbrief-localai";
const mlxAudioVersion = "0.4.3";
const minQwenPython = [3, 9];
const maxQwenPythonExclusive = [3, 13];

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
  throw new Error(`Unsupported Local AI build profile '${profile}'. Supported: tts, asr, smoke`);
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

  return normalizeBuildProfile(process.env.OPENBRIEF_LOCALAI_PROFILE || "tts");
}

export function pythonExecutableForPlatform(platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}

export function pythonExecutableCandidatesForPlatform({
  platform = process.platform,
  profile = "tts",
  env = process.env,
} = {}) {
  const override = env.OPENBRIEF_LOCALAI_PYTHON;
  if (override) {
    return [override];
  }

  if (platform === "win32") {
    return ["python"];
  }

  if (profile === "smoke") {
    return [pythonExecutableForPlatform(platform)];
  }

  return ["python3.12", "python3.11", "python3.10", "python3"];
}

export function parsePythonVersion(versionText) {
  const match = String(versionText || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse Python version from '${versionText}'`);
  }

  return match.slice(1, 4).map(Number);
}

export function supportsQwenPythonVersion([major, minor]) {
  const [minMajor, minMinor] = minQwenPython;
  const [maxMajor, maxMinor] = maxQwenPythonExclusive;
  const meetsMinimum = major > minMajor || (major === minMajor && minor >= minMinor);
  const belowMaximum = major < maxMajor || (major === maxMajor && minor < maxMinor);

  return meetsMinimum && belowMaximum;
}

export function readPythonVersion(execFile, executable) {
  const output = execFile(
    executable,
    [
      "-c",
      "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
    ],
    { encoding: "utf8" },
  );

  return parsePythonVersion(output);
}

export function resolveBootstrapPython({
  execFile = execFileSync,
  platform = process.platform,
  profile = "tts",
  env = process.env,
} = {}) {
  const candidates = pythonExecutableCandidatesForPlatform({ platform, profile, env });
  const rejected = [];

  for (const candidate of candidates) {
    try {
      const version = readPythonVersion(execFile, candidate);
      if (profile === "smoke" || supportsQwenPythonVersion(version)) {
        return candidate;
      }
      rejected.push(`${candidate} ${version.join(".")}`);
    } catch (error) {
      rejected.push(`${candidate} unavailable`);
    }
  }

  throw new Error(
    `Local AI ${profile} sidecar builds require Python >=${minQwenPython.join(".")},<${maxQwenPythonExclusive.join(".")}. ` +
      `Tried: ${rejected.join(", ") || candidates.join(", ")}`,
  );
}

export function ensureVenvPythonCompatible({ execFile, python, profile, venvDir }) {
  if (profile === "smoke" || !existsSync(python)) {
    return;
  }

  const version = readPythonVersion(execFile, python);
  if (supportsQwenPythonVersion(version)) {
    return;
  }

  rmSync(venvDir, { recursive: true, force: true });
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
  const appleSilicon = targetTriple === "aarch64-apple-darwin";
  if (profile === "tts") {
    extras.push("qwen-tts");
  } else if (profile === "asr" && !appleSilicon) {
    extras.push("qwen-asr");
  }

  if (
    targetTriple.includes("apple-darwin") &&
    profile !== "smoke" &&
    !(profile === "asr" && appleSilicon)
  ) {
    extras.push("torch");
  }

  if (appleSilicon && profile !== "smoke") {
    extras.push("mlx");
  }

  return extras;
}

export function torchInstallArgsForTarget(targetTriple) {
  if (targetTriple.includes("linux") || targetTriple.includes("windows")) {
    return [
      "-m",
      "pip",
      "install",
      "torch>=2.4",
      "--index-url",
      "https://download.pytorch.org/whl/cpu",
    ];
  }

  return null;
}

export function mlxAudioInstallArgsForTarget(targetTriple) {
  if (targetTriple === "aarch64-apple-darwin") {
    return ["-m", "pip", "install", "--no-deps", `mlx-audio==${mlxAudioVersion}`];
  }

  return null;
}

export function pyinstallerCollectArgs({ profile, targetTriple }) {
  const args = [];
  const appleSilicon = targetTriple === "aarch64-apple-darwin";
  const usesQwenPytorchPackage =
    profile === "tts" || (profile === "asr" && !appleSilicon);
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
  if (usesQwenPytorchPackage) {
    addCollectAll(profile === "tts" ? "qwen_tts" : "qwen_asr");
    args.push("--hidden-import", "torch");
  }

  if (usesQwenPytorchPackage) {
    addCopyMetadata(profile === "tts" ? "qwen-tts" : "qwen-asr");
  }
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

export function copyBuiltLocalAiSidecar({
  targetTriple = getHostTriple(),
  sourcePath,
  binariesDir = join(rustCrateDir, "binaries"),
} = {}) {
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`Built Local AI sidecar not found: ${sourcePath}`);
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

export function buildLocalAiSidecar({
  execFile = execFileSync,
  targetTriple = getHostTriple(),
  hostTriple = getHostTriple(),
  profile = normalizeBuildProfile(process.env.OPENBRIEF_LOCALAI_PROFILE || "tts"),
  release = true,
  binariesDir = join(rustCrateDir, "binaries"),
  sourceDir = sidecarSourceDir,
  root = buildRoot,
  platform = process.platform,
} = {}) {
  if (release && targetTriple !== hostTriple) {
    throw new Error(
      `PyInstaller cannot cross-compile Local AI sidecars; build ${targetTriple} on its matching host instead of ${hostTriple}`,
    );
  }

  createDevSidecarPlaceholder({
    binariesDir,
    baseName: sidecarBaseName,
    targetTriple,
    message:
      "OpenBrief dev Local AI sidecar placeholder. Build the PyInstaller sidecar before packaging.",
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
  const python = venvPythonPath(venvDir, targetTriple);

  ensureVenvPythonCompatible({ execFile, python, profile, venvDir });

  if (!existsSync(python)) {
    const bootstrapPython = resolveBootstrapPython({ execFile, platform, profile });
    execFile(bootstrapPython, ["-m", "venv", venvDir], { stdio: "inherit" });
  }

  execFile(python, ["-m", "pip", "install", "--upgrade", "pip"], {
    stdio: "inherit",
  });
  execFile(python, ["-m", "pip", "install", "pyinstaller"], {
    stdio: "inherit",
  });
  const torchInstallArgs = torchInstallArgsForTarget(targetTriple);
  if (profile !== "smoke" && torchInstallArgs) {
    execFile(python, torchInstallArgs, {
      stdio: "inherit",
    });
  }
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
  const mlxAudioInstallArgs = mlxAudioInstallArgsForTarget(targetTriple);
  if (profile !== "smoke" && mlxAudioInstallArgs) {
    execFile(python, mlxAudioInstallArgs, {
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
      join(sourceDir, "openbrief_localai.py"),
    ],
    {
      cwd: sourceDir,
      stdio: "inherit",
    },
  );

  return {
    skipped: false,
    ...copyBuiltLocalAiSidecar({
      binariesDir,
      targetTriple,
      sourcePath: pyinstallerOutputPath({ distDir, targetTriple }),
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const result = buildLocalAiSidecar({
    targetTriple: targetTripleFromArgs(args),
    profile: buildProfileFromArgs(args),
    release: releaseModeFromArgs(args),
  });

  if (result.skipped) {
    console.log(`Skipped Local AI sidecar: ${result.reason}`);
  } else {
    console.log(`Copied Local AI sidecar: ${result.destinationName} (${result.size} bytes)`);
  }
}
