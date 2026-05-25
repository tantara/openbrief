import { describe, expect, it } from "vitest";
import { classifyDownloadError } from "@/domain/download-error";

describe("classifyDownloadError", () => {
  it("turns outdated yt-dlp warnings into an update action", () => {
    const error = classifyDownloadError(
      "WARNING: Your yt-dlp version (2025.12.08) is older than 90 days!",
    );

    expect(error.kind).toBe("yt-dlp-outdated");
    expect(error.userMessage).toContain("Update yt-dlp");
    expect(error.diagnosticMessage).toContain("2025.12.08");
    expect(error.recoveryActions.map((action) => action.kind)).toEqual([
      "update-yt-dlp",
    ]);
  });

  it("turns YouTube SABR 403 failures into a retryable update message", () => {
    const error = classifyDownloadError(
      "WARNING: [youtube] web client https formats have been skipped. YouTube is forcing SABR streaming. ERROR: unable to download video data: HTTP Error 403: Forbidden",
    );

    expect(error.kind).toBe("youtube-sabr-forbidden");
    expect(error.userMessage).toContain("Update yt-dlp first");
    expect(error.recoveryActions.map((action) => action.kind)).toEqual([
      "update-yt-dlp",
      "provide-cookies",
      "open-webview-cookies",
    ]);
  });

  it("detects host rate limits and offers cookie recovery", () => {
    const error = classifyDownloadError(
      "ERROR: [youtube] Sign in to confirm you're not a bot. This helps protect our community. HTTP Error 429: Too Many Requests",
    );

    expect(error.kind).toBe("rate-limited");
    expect(error.userMessage).toContain("rate limiting");
    expect(error.recoveryActions.map((action) => action.kind)).toEqual([
      "retry-later",
      "provide-cookies",
      "open-webview-cookies",
    ]);
  });

  it("detects private videos and points users to account cookies", () => {
    const error = classifyDownloadError(
      "ERROR: [youtube] This video is private. If you have been granted access, use --cookies.",
    );

    expect(error.kind).toBe("private-video");
    expect(error.userMessage).toContain("private or restricted");
    expect(error.recoveryActions.map((action) => action.kind)).toEqual([
      "provide-cookies",
      "open-webview-cookies",
      "provide-credentials",
    ]);
  });

  it("detects login and cookie required failures", () => {
    const loginError = classifyDownloadError(
      "ERROR: Login required. Use --username and --password or --cookies",
    );
    const cookieError = classifyDownloadError(
      "ERROR: Sign in to confirm your age. You may want to use --cookies.",
    );

    expect(loginError.kind).toBe("credentials-required");
    expect(loginError.recoveryActions.map((action) => action.kind)).toContain(
      "provide-credentials",
    );
    expect(cookieError.kind).toBe("cookies-required");
    expect(cookieError.recoveryActions.map((action) => action.kind)).toEqual([
      "provide-cookies",
      "open-webview-cookies",
    ]);
  });

  it("detects password, geo, and unavailable videos", () => {
    expect(classifyDownloadError("ERROR: Wrong video password").kind).toBe(
      "video-password-required",
    );
    expect(
      classifyDownloadError("ERROR: This video is not available in your country")
        .kind,
    ).toBe("geo-restricted");
    expect(classifyDownloadError("ERROR: Video unavailable").kind).toBe(
      "not-found",
    );
  });

  it("classifies offline network failures", () => {
    const error = classifyDownloadError("network offline");

    expect(error.kind).toBe("network-offline");
    expect(error.userMessage).toContain("offline");
    expect(error.recoveryActions.map((action) => action.kind)).toEqual([
      "change-network",
      "retry-later",
    ]);
  });

  it("keeps unknown diagnostics when no classifier matches", () => {
    const error = classifyDownloadError("unexpected download failure");

    expect(error.kind).toBe("unknown");
    expect(error.userMessage).toBe("unexpected download failure");
    expect(error.recoveryActions).toEqual([]);
  });
});
