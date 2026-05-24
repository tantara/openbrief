import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adHocSignMacOSBinary,
  describePreparedTool,
  executableName,
  mediaToolTargetSources,
  mediaToolsDirForTarget,
  prepareMediaAssets,
  resolvePackageJsonPath,
  targetTripleFromArgs,
  YTDLP_VERSION,
} from "./prepare-media-assets.js";
import { getHostTriple } from "./setup-dev-sidecars.js";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "openbrief-media-tools-"));
}

describe("media asset preparation", () => {
  it("maps supported Rust triples to concrete yt-dlp and ffmpeg sources", () => {
    expect(mediaToolTargetSources["aarch64-apple-darwin"].ytdlpAsset).toBe(
      "yt-dlp_macos",
    );
    expect(mediaToolTargetSources["x86_64-pc-windows-msvc"].ytdlpAsset).toBe(
      "yt-dlp.exe",
    );
    expect(mediaToolTargetSources["aarch64-unknown-linux-gnu"].ffmpegPackage).toBe(
      "@ffmpeg-installer/linux-arm64",
    );
  });

  it("uses Windows executable suffixes only for Windows targets", () => {
    expect(executableName("ffprobe", "x86_64-pc-windows-msvc")).toBe("ffprobe.exe");
    expect(executableName("ffprobe", "aarch64-apple-darwin")).toBe("ffprobe");
  });

  it("resolves nested installer package metadata under pnpm", () => {
    const targetSources = mediaToolTargetSources[getHostTriple()];

    expect(resolvePackageJsonPath(targetSources.ffmpegPackage)).toContain(
      targetSources.ffmpegPackage.split("/")[1],
    );
    expect(resolvePackageJsonPath(targetSources.ffprobePackage)).toContain(
      targetSources.ffprobePackage.split("/")[1],
    );
  });

  it("describes prepared tools with checksums and relative bundle paths", () => {
    const root = tempDir();
    const filePath = join(root, "yt-dlp");
    writeFileSync(filePath, "fixture");

    const tool = describePreparedTool({
      tool: "yt-dlp",
      targetTriple: "aarch64-apple-darwin",
      filePath,
      source: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`,
      sourceVersion: YTDLP_VERSION,
      license: "Unlicense",
    });

    expect(tool.relativePath).toBe("aarch64-apple-darwin/yt-dlp");
    expect(tool.sha256).toHaveLength(64);
    expect(tool.executablePermission).toBe("required-on-unix");
  });

  it("prepares a manifest when downloads and package copies are injected", async () => {
    const resourcesDir = tempDir();
    const targetTriple = getHostTriple();
    const targetDir = mediaToolsDirForTarget({ resourcesDir, targetTriple });
    mkdirSync(targetDir, { recursive: true });

    const manifest = await prepareMediaAssets({
      resourcesDir,
      targetTriple,
      download: async (_url, destinationPath) => {
        writeFileSync(destinationPath, "downloaded yt-dlp");
      },
      signMacOSBinary: () => {},
    });

    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      "yt-dlp",
      "ffmpeg",
      "ffprobe",
    ]);
    const ytdlpPath = join(targetDir, executableName("yt-dlp", targetTriple));
    expect(statSync(ytdlpPath).size).toBeGreaterThan(0);
    if (!targetTriple.includes("windows")) {
      expect(statSync(ytdlpPath).mode & 0o111).toBeGreaterThan(0);
    }
    expect(
      JSON.parse(readFileSync(join(targetDir, "manifest.json"), "utf8")).targetTriple,
    ).toBe(targetTriple);
  });

  it("parses explicit target arguments", () => {
    expect(targetTripleFromArgs(["--target", "x86_64-unknown-linux-gnu"])).toBe(
      "x86_64-unknown-linux-gnu",
    );
    expect(() => targetTripleFromArgs(["--target"])).toThrow(/requires/);
  });

  it("ad-hoc signs macOS binaries with codesign", () => {
    const calls: unknown[] = [];

    adHocSignMacOSBinary("/tmp/yt-dlp", {
      spawn: (command, args) => {
        calls.push([command, args]);
        return { status: 0 };
      },
    });

    if (process.platform === "darwin") {
      expect(calls).toEqual([
        ["codesign", ["--force", "--sign", "-", "/tmp/yt-dlp"]],
      ]);
    } else {
      expect(calls).toEqual([]);
    }
  });
});
