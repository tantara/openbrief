import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDevSidecarPlaceholder,
  getHostTriple,
  setupDevSidecars,
  sidecarFileName,
  SUPPORTED_HELPER_TARGET_TRIPLES,
} from "./setup-dev-sidecars.js";

function createTempBinariesDirForTests() {
  return mkdtempSync(join(tmpdir(), "openbrief-sidecars-"));
}

describe("dev sidecar placeholder setup", () => {
  it("creates Tauri target-triple placeholder names without PyInstaller", () => {
    const binariesDir = createTempBinariesDirForTests();
    const [result] = setupDevSidecars({
      binariesDir,
      targetTriple: "aarch64-apple-darwin",
    });

    expect(result.fileName).toBe("openbrief-helper-aarch64-apple-darwin");
    expect(statSync(result.filePath).size).toBeGreaterThan(0);
    if (process.platform !== "win32") {
      expect(statSync(result.filePath).mode & 0o111).toBeGreaterThan(0);
    }
  });

  it("adds the Windows executable suffix for placeholder sidecars", () => {
    expect(sidecarFileName("openbrief-helper", "x86_64-pc-windows-msvc")).toBe(
      "openbrief-helper-x86_64-pc-windows-msvc.exe",
    );
  });

  it("preserves real helper binaries over the minimum size threshold", () => {
    const binariesDir = createTempBinariesDirForTests();
    const first = createDevSidecarPlaceholder({
      binariesDir,
      baseName: "openbrief-helper",
      targetTriple: "x86_64-unknown-linux-gnu",
    });
    writeFileSync(first.filePath, Buffer.alloc(10001));

    const second = createDevSidecarPlaceholder({
      binariesDir,
      baseName: "openbrief-helper",
      targetTriple: "x86_64-unknown-linux-gnu",
    });

    expect(second.created).toBe(false);
    expect(second.preservedRealBinary).toBe(true);
  });

  it("falls back to platform detection when rustc is unavailable", () => {
    expect(
      getHostTriple({
        execFile: () => {
          throw new Error("rustc unavailable");
        },
        platform: "darwin",
        arch: "arm64",
      }),
    ).toBe("aarch64-apple-darwin");
  });

  it("documents helper names for macOS, Windows, and Linux smoke checks", () => {
    const helperNames = SUPPORTED_HELPER_TARGET_TRIPLES.map((targetTriple) =>
      sidecarFileName("openbrief-helper", targetTriple),
    );

    expect(helperNames).toContain("openbrief-helper-aarch64-apple-darwin");
    expect(helperNames).toContain("openbrief-helper-x86_64-apple-darwin");
    expect(helperNames).toContain("openbrief-helper-x86_64-pc-windows-msvc.exe");
    expect(helperNames).toContain("openbrief-helper-x86_64-unknown-linux-gnu");
    expect(helperNames).toContain("openbrief-helper-aarch64-unknown-linux-gnu");
  });
});
