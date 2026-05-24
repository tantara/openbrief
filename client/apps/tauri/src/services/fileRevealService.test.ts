import { afterEach, describe, expect, it, vi } from "vitest";
import { revealExportedFile } from "@/services/fileRevealService";

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

describe("fileRevealService", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("reveals exported files through the Tauri opener plugin", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const revealer = vi.fn().mockResolvedValue(undefined);

    await revealExportedFile("/Users/test/Downloads/video.mp4", revealer);

    expect(revealer).toHaveBeenCalledWith("/Users/test/Downloads/video.mp4");
  });

  it("rejects file reveal outside the Tauri runtime", async () => {
    await expect(
      revealExportedFile("/Users/test/Downloads/video.mp4", vi.fn()),
    ).rejects.toThrow("file_reveal_unavailable");
  });
});
