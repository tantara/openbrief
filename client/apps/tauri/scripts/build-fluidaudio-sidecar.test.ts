import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFluidAudioSidecar,
  releaseModeFromArgs,
  SUPPORTED_FLUIDAUDIO_TARGET_TRIPLE,
  targetTripleFromArgs,
} from "./build-fluidaudio-sidecar.js";

describe("FluidAudio sidecar build script", () => {
  it("defaults to release builds for packaging", () => {
    expect(releaseModeFromArgs([])).toBe(true);
  });

  it("supports debug builds for dev startup", () => {
    expect(releaseModeFromArgs(["--debug"])).toBe(false);
  });

  it("parses explicit target arguments", () => {
    expect(targetTripleFromArgs(["--target", "x86_64-apple-darwin"])).toBe(
      "x86_64-apple-darwin",
    );
    expect(() => targetTripleFromArgs(["--target"])).toThrow(/requires/);
  });

  it("skips FluidAudio for macOS Intel, Windows, and Linux targets", () => {
    const unsupportedTargets = [
      "x86_64-apple-darwin",
      "x86_64-pc-windows-msvc",
      "x86_64-unknown-linux-gnu",
      "aarch64-unknown-linux-gnu",
    ];

    for (const targetTriple of unsupportedTargets) {
      const binariesDir = mkdtempSync(join(tmpdir(), "openbrief-fluidaudio-skip-"));
      const result = buildFluidAudioSidecar({
        binariesDir,
        targetTriple,
        execFile: () => {
          throw new Error(`swift should not run for ${targetTriple}`);
        },
      });

      expect(result).toMatchObject({
        skipped: true,
        targetTriple,
      });
      expect(existsSync(join(binariesDir, `openbrief-fluidaudio-${targetTriple}`))).toBe(false);
      expect(
        existsSync(join(binariesDir, `openbrief-fluidaudio-${targetTriple}.exe`)),
      ).toBe(false);
    }
  });

  it("copies a real FluidAudio binary only for macOS Apple Silicon", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-fluidaudio-build-"));
    const binariesDir = join(root, "binaries");
    const packageDir = join(root, "fluidaudio-swift");
    const builtBinary = join(
      packageDir,
      ".build",
      "arm64-apple-macosx",
      "debug",
      "openbrief-fluidaudio",
    );
    mkdirSync(dirname(builtBinary), { recursive: true });
    writeFileSync(builtBinary, "#!/bin/sh\n");

    const result = buildFluidAudioSidecar({
      binariesDir,
      packageDir,
      targetTriple: SUPPORTED_FLUIDAUDIO_TARGET_TRIPLE,
      release: false,
      execFile: (_command, args) => {
        expect(args).toEqual(
          expect.arrayContaining(["build", "-c", "debug", "--arch", "arm64"]),
        );
      },
    });

    if (result.skipped) {
      throw new Error("expected FluidAudio sidecar build to run");
    }

    expect(result.destinationName).toBe(
      "openbrief-fluidaudio-aarch64-apple-darwin",
    );
    expect(existsSync(join(binariesDir, result.destinationName))).toBe(true);
  });
});
