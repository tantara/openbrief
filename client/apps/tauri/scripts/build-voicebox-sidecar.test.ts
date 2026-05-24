import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVoiceboxSidecar,
  copyBuiltVoiceboxSidecar,
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
