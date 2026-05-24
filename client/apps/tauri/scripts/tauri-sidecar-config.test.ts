import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Tauri sidecar configuration", () => {
  it("keeps FluidAudio out of the default cross-platform sidecar list", () => {
    const config = readJson(join(process.cwd(), "src-tauri", "tauri.conf.json"));

    expect(config.bundle.externalBin).toEqual([
      "binaries/openbrief-helper",
      "binaries/openbrief-supertonic",
      "binaries/openbrief-voicebox",
    ]);
    expect(config.bundle.externalBin).not.toContain("binaries/openbrief-fluidaudio");
  });

  it("adds FluidAudio only in the macOS sidecar config override", () => {
    const macosConfig = readJson(
      join(process.cwd(), "src-tauri", "tauri.macos.conf.json"),
    );

    expect(macosConfig.bundle.externalBin).toEqual([
      "binaries/openbrief-helper",
      "binaries/openbrief-supertonic",
      "binaries/openbrief-voicebox",
      "binaries/openbrief-fluidaudio",
    ]);
  });
});
