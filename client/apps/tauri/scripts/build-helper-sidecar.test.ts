import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHelperSidecar,
  builtHelperPath,
  releaseModeFromArgs,
  targetTripleFromArgs,
} from "./build-helper-sidecar.js";

describe("helper sidecar build script", () => {
  it("defaults to release builds for packaging", () => {
    expect(releaseModeFromArgs([])).toBe(true);
  });

  it("supports debug builds for dev startup", () => {
    expect(releaseModeFromArgs(["--debug"])).toBe(false);
  });

  it("allows release mode to be explicit", () => {
    expect(releaseModeFromArgs(["--release"])).toBe(true);
  });

  it("parses explicit target arguments", () => {
    expect(targetTripleFromArgs(["--target", "x86_64-pc-windows-msvc"])).toBe(
      "x86_64-pc-windows-msvc",
    );
    expect(() => targetTripleFromArgs(["--target"])).toThrow(/requires/);
  });

  it("uses target-specific cargo output paths for sidecar binaries", () => {
    expect(
      builtHelperPath({
        profile: "release",
        targetTriple: "x86_64-pc-windows-msvc",
      }),
    ).toMatch(/target[/\\]x86_64-pc-windows-msvc[/\\]release[/\\]openbrief-helper\.exe$/);
  });

  it("creates the expected externalBin placeholder before compiling the helper", () => {
    const root = mkdtempSync(join(tmpdir(), "openbrief-helper-build-"));
    const binariesDir = join(root, "binaries");
    const sourcePath = join(root, "openbrief-helper");
    writeFileSync(sourcePath, "#!/bin/sh\n");

    let placeholderExistedBeforeCompile = false;
    const result = buildHelperSidecar({
      binariesDir,
      sourcePath,
      targetTriple: "aarch64-apple-darwin",
      execFile: (_command, args) => {
        placeholderExistedBeforeCompile = existsSync(
          join(binariesDir, "openbrief-helper-aarch64-apple-darwin"),
        );
        expect(args).toContain("--manifest-path");
        expect(args).toContain("--target-dir");
        expect(args).toContain("aarch64-apple-darwin");
      },
    });

    expect(placeholderExistedBeforeCompile).toBe(true);
    expect(result.destinationName).toBe("openbrief-helper-aarch64-apple-darwin");
  });
});
