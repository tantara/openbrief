import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVoiceboxSidecar,
  buildProfileFromArgs,
  copyBuiltVoiceboxSidecar,
  extrasForBuildProfile,
  pyinstallerCollectArgs,
  pyinstallerOutputPath,
  releaseModeFromArgs,
  targetTripleFromArgs,
  venvPythonPath,
} from "./build-voicebox-sidecar.js";

describe("Voicebox sidecar build script", () => {
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
    ).toEqual(["qwen-tts", "torch"]);
    expect(
      extrasForBuildProfile({
        profile: "asr",
        targetTriple: "x86_64-unknown-linux-gnu",
      }),
    ).toEqual(["qwen-asr", "torch"]);
  });

  it("adds MLX dependencies only for native Apple Silicon model profiles", () => {
    expect(
      extrasForBuildProfile({
        profile: "tts",
        targetTriple: "aarch64-apple-darwin",
      }),
    ).toEqual(["qwen-tts", "torch", "mlx"]);
    expect(
      extrasForBuildProfile({
        profile: "smoke",
        targetTriple: "aarch64-apple-darwin",
      }),
    ).toEqual([]);
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
    ).toMatch(/openbrief-voicebox\.exe$/);
  });

  it("copies built sidecars to the Tauri target-triple name", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-voicebox-copy-"));
    const sourcePath = join(root, "openbrief-voicebox");
    const binariesDir = join(root, "binaries");
    writeFileSync(sourcePath, "#!/bin/sh\n");

    const result = copyBuiltVoiceboxSidecar({
      sourcePath,
      binariesDir,
      targetTriple: "aarch64-apple-darwin",
    });

    expect(result.destinationName).toBe("openbrief-voicebox-aarch64-apple-darwin");
    expect(existsSync(result.destinationPath)).toBe(true);
  });

  it("creates a placeholder and skips PyInstaller in debug mode", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-voicebox-build-"));
    const result = buildVoiceboxSidecar({
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
      existsSync(join(root, "binaries", "openbrief-voicebox-x86_64-unknown-linux-gnu")),
    ).toBe(true);
  });

  it("rejects cross-target PyInstaller release builds", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-voicebox-cross-"));

    expect(() =>
      buildVoiceboxSidecar({
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
