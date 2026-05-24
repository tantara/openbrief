import { describe, expect, it, vi } from "vitest";
import {
  isOpenableWebUrl,
  openExternalWebUrl,
  providerLabelForWebUrl,
} from "@/services/externalUrlService";

describe("externalUrlService", () => {
  it("only treats http and https URLs as openable web URLs", () => {
    expect(isOpenableWebUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isOpenableWebUrl("http://vimeo.com/123")).toBe(true);
    expect(isOpenableWebUrl("file:///tmp/source.mp4")).toBe(false);
    expect(isOpenableWebUrl("/tmp/source.mp4")).toBe(false);
    expect(isOpenableWebUrl(undefined)).toBe(false);
  });

  it("opens web URLs through the browser fallback outside Tauri", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await openExternalWebUrl("https://www.youtube.com/watch?v=abc");

    expect(open).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("labels known video providers from web URLs", () => {
    expect(providerLabelForWebUrl("https://www.youtube.com/watch?v=abc")).toBe("YouTube");
    expect(providerLabelForWebUrl("https://youtu.be/abc")).toBe("YouTube");
    expect(providerLabelForWebUrl("https://www.tiktok.com/@samplecreator/video/1")).toBe("TikTok");
    expect(providerLabelForWebUrl("https://clips.twitch.tv/example")).toBe("Twitch");
    expect(providerLabelForWebUrl("https://vimeo.com/123")).toBe("Vimeo");
    expect(providerLabelForWebUrl("https://example.com/video")).toBe("example.com");
    expect(providerLabelForWebUrl("/tmp/source.mp4")).toBeUndefined();
  });
});
