import { describe, expect, it } from "vitest";
import {
  bundledMediaToolContracts,
  getTarget,
  helperExternalBinPath,
  helperSidecarBaseName,
  mediaToolBinaryName,
  sidecarBinaryPath,
  sidecarBinaryName,
  supportedTargets,
} from "@/domain/platform";

describe("platform target contracts", () => {
  it("defines macOS, Windows, and Linux targets", () => {
    expect(supportedTargets.map((target) => target.platform)).toEqual(
      expect.arrayContaining(["macos", "windows", "linux"]),
    );
  });

  it("uses Tauri sidecar target triple names", () => {
    const windows = getTarget("windows", "x86_64");

    expect(windows).toBeDefined();
    expect(sidecarBinaryName("openbrief-helper", windows!)).toBe(
      "openbrief-helper-x86_64-pc-windows-msvc.exe",
    );
  });

  it("uses Tauri externalBin base names without target triples", () => {
    expect(helperExternalBinPath).toBe("openbrief-helper");
  });

  it("computes sidecar paths for every supported target", () => {
    for (const target of supportedTargets) {
      expect(sidecarBinaryPath(helperSidecarBaseName, target)).toContain(
        `openbrief-helper-${target.rustTriple}`,
      );
      expect(sidecarBinaryPath(helperSidecarBaseName, target).endsWith(".exe")).toBe(
        target.platform === "windows",
      );
    }
  });

  it("adds executable suffixes only where needed", () => {
    expect(mediaToolBinaryName("ffmpeg", getTarget("macos", "aarch64")!)).toBe(
      "ffmpeg",
    );
    expect(mediaToolBinaryName("ffmpeg", getTarget("windows", "x86_64")!)).toBe(
      "ffmpeg.exe",
    );
  });

  it("declares bundled media tool version and discovery contracts for every target", () => {
    for (const target of supportedTargets) {
      const contracts = bundledMediaToolContracts(target);

      expect(contracts.map((contract) => contract.tool)).toEqual([
        "yt-dlp",
        "ffmpeg",
        "ffprobe",
      ]);
      expect(contracts.every((contract) => contract.versionArgs.length > 0)).toBe(true);
      expect(contracts.every((contract) => contract.relativePath.includes(target.rustTriple))).toBe(
        true,
      );
      expect(contracts.every((contract) => !contract.relativePath.includes("latest"))).toBe(true);
    }
  });
});
