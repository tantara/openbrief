import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

describe("resolveLibraryAssetUrl", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("returns relative paths directly outside Tauri", async () => {
    await expect(resolveLibraryAssetUrl("videos/video-1/source.mp4")).resolves.toBe(
      "videos/video-1/source.mp4",
    );
  });

  it("resolves library-relative paths through trusted Tauri command before converting to asset URLs", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const invokeCommand = vi
      .fn()
      .mockResolvedValue("/Users/test/Library/Application Support/openbrief/library/videos/video-1/source.mp4");

    await expect(
      resolveLibraryAssetUrl("videos/video-1/source.mp4", invokeCommand),
    ).resolves.toBe(
      "asset://localhost//Users/test/Library/Application Support/openbrief/library/videos/video-1/source.mp4",
    );

    expect(invokeCommand).toHaveBeenCalledWith("resolve_library_file_path", {
      relativePath: "videos/video-1/source.mp4",
    });
  });
});
