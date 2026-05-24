import type { VideoDownloadAccessAction } from "@/domain/settings";
import type { TranslationKey } from "@/i18n";

export type VideoDownloadAccessNotice = {
  action: VideoDownloadAccessAction;
  implemented: boolean;
  offlineSafe: true;
  noticeKey: TranslationKey;
  values?: Record<string, string>;
  plannedYtDlpFlags: string[];
};

export function describeVideoDownloadAccessAction(
  action: VideoDownloadAccessAction,
  target = "video downloads",
): VideoDownloadAccessNotice {
  switch (action) {
    case "use-browser-cookies":
      return {
        action,
        implemented: false,
        offlineSafe: true,
        noticeKey: "notice.downloadAccess.browserCookies",
        values: { target },
        plannedYtDlpFlags: ["--cookies-from-browser"],
      };
    case "choose-cookies-file":
      return {
        action,
        implemented: false,
        offlineSafe: true,
        noticeKey: "notice.downloadAccess.cookiesFile",
        values: { target },
        plannedYtDlpFlags: ["--cookies"],
      };
    case "configure-po-token":
      return {
        action,
        implemented: false,
        offlineSafe: true,
        noticeKey: "notice.downloadAccess.poToken",
        plannedYtDlpFlags: ["--extractor-args", "youtube:po_token=..."],
      };
    case "configure-extractor-args":
      return {
        action,
        implemented: false,
        offlineSafe: true,
        noticeKey: "notice.downloadAccess.extractorArgs",
        plannedYtDlpFlags: ["--extractor-args"],
      };
  }
}
