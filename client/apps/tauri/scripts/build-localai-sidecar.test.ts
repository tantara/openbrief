import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLocalAiSidecar,
  buildProfileFromArgs,
  copyBuiltLocalAiSidecar,
  ensureVenvPythonCompatible,
  extrasForBuildProfile,
  mlxAudioInstallArgsForTarget,
  pythonExecutableCandidatesForPlatform,
  pyinstallerCollectArgs,
  pyinstallerOutputPath,
  releaseModeFromArgs,
  resolveBootstrapPython,
  supportsQwenPythonVersion,
  targetTripleFromArgs,
  torchInstallArgsForTarget,
  venvPythonPath,
} from "./build-localai-sidecar.js";

describe("Local AI sidecar build script", () => {
  it("defaults to release builds for packaging", () => {
    expect(releaseModeFromArgs([])).toBe(true);
  });

  it("supports debug placeholder builds for development", () => {
    expect(releaseModeFromArgs(["--debug"])).toBe(false);
  });

  it("parses explicit target arguments", () => {
    expect(targetTripleFromArgs(["--target", "x86_64-pc-windows-msvc"])).toBe(
      "x86_64-pc-windows-msvc",
    );
    expect(() => targetTripleFromArgs(["--target"])).toThrow(/requires/);
  });

  it("parses explicit build profiles", () => {
    expect(buildProfileFromArgs(["--profile", "tts"])).toBe("tts");
    expect(buildProfileFromArgs(["--profile", "asr"])).toBe("asr");
    expect(buildProfileFromArgs(["--profile", "smoke"])).toBe("smoke");
    expect(() => buildProfileFromArgs(["--profile"])).toThrow(/requires/);
    expect(() => buildProfileFromArgs(["--profile", "all"])).toThrow(/Unsupported/);
  });

  it("keeps Qwen TTS and ASR dependency profiles separate", () => {
    expect(
      extrasForBuildProfile({
        profile: "tts",
        targetTriple: "x86_64-unknown-linux-gnu",
      }),
    ).toEqual(["qwen-tts"]);
    expect(
      extrasForBuildProfile({
        profile: "asr",
        targetTriple: "x86_64-unknown-linux-gnu",
      }),
    ).toEqual(["qwen-asr"]);
  });

  it("adds MLX dependencies only for native Apple Silicon model profiles", () => {
    expect(
      extrasForBuildProfile({
        profile: "tts",
        targetTriple: "aarch64-apple-darwin",
      }),
    ).toEqual(["mlx"]);
    expect(
      extrasForBuildProfile({
        profile: "asr",
        targetTriple: "aarch64-apple-darwin",
      }),
    ).toEqual(["mlx"]);
    expect(
      extrasForBuildProfile({
        profile: "smoke",
        targetTriple: "aarch64-apple-darwin",
      }),
    ).toEqual([]);
  });

  it("prefers Python versions supported by Qwen dependencies for model profiles", () => {
    expect(
      pythonExecutableCandidatesForPlatform({
        platform: "darwin",
        profile: "tts",
        env: {},
      }),
    ).toEqual(["python3.12", "python3.11", "python3.10", "python3"]);
    expect(supportsQwenPythonVersion([3, 12, 8])).toBe(true);
    expect(supportsQwenPythonVersion([3, 13, 0])).toBe(false);

    const commands: string[][] = [];
    const resolved = resolveBootstrapPython({
      platform: "darwin",
      profile: "tts",
      env: {},
      execFile: (command, args) => {
        commands.push([String(command), ...args.map(String)]);
        if (command === "python3.12") {
          throw new Error("not installed");
        }
        return "3.11.9\n";
      },
    });

    expect(resolved).toBe("python3.11");
    expect(commands[0][0]).toBe("python3.12");
    expect(commands[1][0]).toBe("python3.11");
  });

  it("rebuilds stale model-profile venvs created with Python 3.13", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-stale-"));
    const venvDir = join(root, "venv");
    const python = join(venvDir, "bin", "python");
    mkdirSync(join(venvDir, "bin"), { recursive: true });
    writeFileSync(python, "#!/bin/sh\n");

    ensureVenvPythonCompatible({
      python,
      venvDir,
      profile: "tts",
      execFile: () => "3.13.5\n",
    });

    expect(existsSync(python)).toBe(false);
  });

  it("pins CPU-only Torch wheels for Linux and Windows release sidecars", () => {
    expect(torchInstallArgsForTarget("x86_64-unknown-linux-gnu")).toEqual([
      "-m",
      "pip",
      "install",
      "torch>=2.4",
      "--index-url",
      "https://download.pytorch.org/whl/cpu",
    ]);
    expect(torchInstallArgsForTarget("x86_64-pc-windows-msvc")).toEqual([
      "-m",
      "pip",
      "install",
      "torch>=2.4",
      "--index-url",
      "https://download.pytorch.org/whl/cpu",
    ]);
    expect(torchInstallArgsForTarget("aarch64-apple-darwin")).toBeNull();
  });

  it("pins MLX-Audio explicitly for Apple Silicon after installing explicit runtime deps", () => {
    expect(mlxAudioInstallArgsForTarget("aarch64-apple-darwin")).toEqual([
      "-m",
      "pip",
      "install",
      "--no-deps",
      "mlx-audio==0.4.3",
    ]);
    expect(mlxAudioInstallArgsForTarget("x86_64-apple-darwin")).toBeNull();
    expect(mlxAudioInstallArgsForTarget("x86_64-unknown-linux-gnu")).toBeNull();
  });

  it("collects only installed model modules for PyInstaller", () => {
    const ttsArgs = pyinstallerCollectArgs({
      profile: "tts",
      targetTriple: "x86_64-unknown-linux-gnu",
    });
    const asrArgs = pyinstallerCollectArgs({
      profile: "asr",
      targetTriple: "x86_64-unknown-linux-gnu",
    });

    expect(ttsArgs).toContain("qwen_tts");
    expect(ttsArgs).not.toContain("qwen_asr");
    expect(asrArgs).toContain("qwen_asr");
    expect(asrArgs).not.toContain("qwen_tts");
    const appleSiliconAsrArgs = pyinstallerCollectArgs({
      profile: "asr",
      targetTriple: "aarch64-apple-darwin",
    });
    const appleSiliconTtsArgs = pyinstallerCollectArgs({
      profile: "tts",
      targetTriple: "aarch64-apple-darwin",
    });

    expect(appleSiliconAsrArgs).toEqual(
      expect.arrayContaining([
        "hf_xet",
        "hf-xet",
        "huggingface_hub",
        "huggingface-hub",
        "mlx",
        "mlx_audio",
        "mlx-audio",
        "mlx_lm",
        "mlx-lm",
        "sentencepiece",
        "tokenizers",
        "transformers",
      ]),
    );
    expect(appleSiliconTtsArgs).not.toContain("qwen_tts");
    expect(appleSiliconTtsArgs).not.toContain("qwen-tts");
    expect(appleSiliconTtsArgs).not.toContain("torch");
    expect(appleSiliconAsrArgs).not.toContain("qwen_asr");
    expect(appleSiliconAsrArgs).not.toContain("qwen-asr");
    expect(appleSiliconAsrArgs).not.toContain("torch");
    expect(appleSiliconAsrArgs).not.toContain("soundfile");
    expect(
      pyinstallerCollectArgs({
        profile: "smoke",
        targetTriple: "x86_64-unknown-linux-gnu",
      }),
    ).toEqual([]);
  });

  it("uses platform-specific venv Python paths", () => {
    expect(venvPythonPath("/tmp/venv", "x86_64-unknown-linux-gnu")).toBe(
      "/tmp/venv/bin/python",
    );
    expect(venvPythonPath("C:\\tmp\\venv", "x86_64-pc-windows-msvc")).toMatch(
      /Scripts[/\\]python\.exe$/,
    );
  });

  it("uses the PyInstaller onefile output name for the target", () => {
    expect(
      pyinstallerOutputPath({
        distDir: "/tmp/dist",
        targetTriple: "x86_64-pc-windows-msvc",
      }),
    ).toMatch(/openbrief-localai\.exe$/);
  });

  it("copies built sidecars to the Tauri target-triple name", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-copy-"));
    const sourcePath = join(root, "openbrief-localai");
    const binariesDir = join(root, "binaries");
    writeFileSync(sourcePath, "#!/bin/sh\n");

    const result = copyBuiltLocalAiSidecar({
      sourcePath,
      binariesDir,
      targetTriple: "aarch64-apple-darwin",
    });

    expect(result.destinationName).toBe("openbrief-localai-aarch64-apple-darwin");
    expect(existsSync(result.destinationPath)).toBe(true);
  });

  it("creates a placeholder and skips PyInstaller in debug mode", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-build-"));
    const result = buildLocalAiSidecar({
      root,
      binariesDir: join(root, "binaries"),
      targetTriple: "x86_64-unknown-linux-gnu",
      release: false,
      execFile: () => {
        throw new Error("debug build should not invoke Python");
      },
    });

    expect(result.skipped).toBe(true);
    expect(
      existsSync(join(root, "binaries", "openbrief-localai-x86_64-unknown-linux-gnu")),
    ).toBe(true);
  });

  it("installs CPU Torch before Qwen extras on Linux release builds", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-release-"));
    const sourceDir = join(root, "source");
    const commands: string[][] = [];
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "openbrief_localai.py"), "print('localai')\n");

    const result = buildLocalAiSidecar({
      root,
      sourceDir,
      binariesDir: join(root, "binaries"),
      targetTriple: "x86_64-unknown-linux-gnu",
      hostTriple: "x86_64-unknown-linux-gnu",
      release: true,
      execFile: (_command, args) => {
        commands.push(args.map(String));
        if (args.includes("-c")) {
          return "3.12.8\n";
        }
        if (args.includes("PyInstaller")) {
          const distDir = join(root, "dist", "x86_64-unknown-linux-gnu");
          mkdirSync(distDir, { recursive: true });
          writeFileSync(join(distDir, "openbrief-localai"), "#!/bin/sh\n");
        }
      },
    });

    const torchInstallIndex = commands.findIndex((args) =>
      args.includes("https://download.pytorch.org/whl/cpu"),
    );
    const qwenInstallIndex = commands.findIndex((args) =>
      args.some((arg) => arg.endsWith("[qwen-tts]")),
    );

    expect(result.skipped).toBe(false);
    expect(torchInstallIndex).toBeGreaterThan(-1);
    expect(qwenInstallIndex).toBeGreaterThan(torchInstallIndex);
  });

  it("installs MLX-Audio after Apple Silicon MLX runtime deps", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-mlx-"));
    const sourceDir = join(root, "source");
    const commands: string[][] = [];
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "openbrief_localai.py"), "print('localai')\n");

    const result = buildLocalAiSidecar({
      root,
      sourceDir,
      binariesDir: join(root, "binaries"),
      targetTriple: "aarch64-apple-darwin",
      hostTriple: "aarch64-apple-darwin",
      release: true,
      execFile: (_command, args) => {
        commands.push(args.map(String));
        if (args.includes("-c")) {
          return "3.12.8\n";
        }
        if (args.includes("PyInstaller")) {
          const distDir = join(root, "dist", "aarch64-apple-darwin");
          mkdirSync(distDir, { recursive: true });
          writeFileSync(join(distDir, "openbrief-localai"), "#!/bin/sh\n");
        }
      },
    });

    const mlxDepsInstallIndex = commands.findIndex((args) =>
      args.some((arg) => arg.endsWith("[mlx]")),
    );
    const mlxAudioInstallIndex = commands.findIndex((args) =>
      args.includes("mlx-audio==0.4.3"),
    );

    expect(result.skipped).toBe(false);
    expect(mlxDepsInstallIndex).toBeGreaterThan(-1);
    expect(mlxAudioInstallIndex).toBeGreaterThan(mlxDepsInstallIndex);
  });

  it("rejects cross-target PyInstaller release builds", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-localai-cross-"));

    expect(() =>
      buildLocalAiSidecar({
        root,
        binariesDir: join(root, "binaries"),
        targetTriple: "x86_64-pc-windows-msvc",
        hostTriple: "aarch64-apple-darwin",
        release: true,
        execFile: () => {
          throw new Error("release guard should run before Python");
        },
      }),
    ).toThrow(/cannot cross-compile/);
  });
});
