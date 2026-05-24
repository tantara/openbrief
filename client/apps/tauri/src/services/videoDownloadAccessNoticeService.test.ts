import { describe, expect, it } from "vitest";
import { describeVideoDownloadAccessAction } from "@/services/videoDownloadAccessNoticeService";

describe("video download access notice service", () => {
  it.each([
    ["use-browser-cookies", "notice.downloadAccess.browserCookies", "--cookies-from-browser"],
    ["choose-cookies-file", "notice.downloadAccess.cookiesFile", "--cookies"],
    ["configure-po-token", "notice.downloadAccess.poToken", "youtube:po_token=..."],
    ["configure-extractor-args", "notice.downloadAccess.extractorArgs", "--extractor-args"],
  ] as const)(
    "keeps %s offline-safe until the trusted Rust flow is implemented",
    (action, noticeKey, expectedFlag) => {
      const notice = describeVideoDownloadAccessAction(action);

      expect(notice).toMatchObject({
        action,
        implemented: false,
        offlineSafe: true,
        noticeKey,
      });
      expect(notice.plannedYtDlpFlags).toContain(expectedFlag);
    },
  );

  it("keeps browser-cookie target text outside the helper payload", () => {
    const notice = describeVideoDownloadAccessAction(
      "use-browser-cookies",
      "YouTube imports",
    );

    expect(notice.values).toEqual({ target: "YouTube imports" });
    expect(notice.plannedYtDlpFlags).toEqual(["--cookies-from-browser"]);
  });
});
