export type DownloadErrorKind =
  | "yt-dlp-outdated"
  | "youtube-sabr-forbidden"
  | "rate-limited"
  | "private-video"
  | "cookies-required"
  | "credentials-required"
  | "video-password-required"
  | "geo-restricted"
  | "not-found"
  | "forbidden"
  | "helper-unavailable"
  | "unknown";

export type DownloadRecoveryActionKind =
  | "update-yt-dlp"
  | "retry-later"
  | "provide-cookies"
  | "open-webview-cookies"
  | "provide-credentials"
  | "provide-video-password"
  | "change-network"
  | "check-url"
  | "restart-helper";

export type DownloadRecoveryAction = {
  kind: DownloadRecoveryActionKind;
  label: string;
  description: string;
};

export type ClassifiedDownloadError = {
  kind: DownloadErrorKind;
  userMessage: string;
  diagnosticMessage: string;
  recoveryActions: DownloadRecoveryAction[];
};

export function classifyDownloadError(error: unknown): ClassifiedDownloadError {
  const diagnosticMessage = diagnosticMessageFor(error);
  const normalized = diagnosticMessage.toLowerCase();

  if (normalized.includes("helper_unavailable")) {
    return {
      kind: "helper-unavailable",
      userMessage:
        "The download helper is unavailable. Restart OpenBrief and try again.",
      diagnosticMessage,
      recoveryActions: [recoveryActions.restartHelper],
    };
  }

  if (
    normalized.includes("older than 90 days") ||
    normalized.includes("your yt-dlp version") ||
    normalized.includes("yt-dlp is out of date")
  ) {
    return {
      kind: "yt-dlp-outdated",
      userMessage: "yt-dlp is outdated. Update yt-dlp in Settings and retry.",
      diagnosticMessage,
      recoveryActions: [recoveryActions.updateYtDlp],
    };
  }

  if (normalized.includes("sabr") && normalized.includes("403")) {
    return {
      kind: "youtube-sabr-forbidden",
      userMessage:
        "YouTube denied this download. Update yt-dlp first; if it still fails, use cookies from a signed-in browser session.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.updateYtDlp,
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
      ],
    };
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("http error 429") ||
    normalized.includes("429:") ||
    normalized.includes("rate-limited") ||
    normalized.includes("rate limited") ||
    normalized.includes("exceeding the rate limit") ||
    normalized.includes("confirm you're not a bot") ||
    normalized.includes("confirm you’re not a bot")
  ) {
    return {
      kind: "rate-limited",
      userMessage:
        "The video host is rate limiting this download. Try again later or use cookies from a signed-in browser session.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.retryLater,
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
      ],
    };
  }

  if (
    normalized.includes("private video") ||
    normalized.includes("this video is private") ||
    normalized.includes("members-only") ||
    normalized.includes("members only") ||
    normalized.includes("join this channel") ||
    normalized.includes("only available to") ||
    normalized.includes("subscribers only")
  ) {
    return {
      kind: "private-video",
      userMessage:
        "This video is private or restricted. Use cookies from an account that can watch it.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
        recoveryActions.provideCredentials,
      ],
    };
  }

  if (
    normalized.includes("password-protected") ||
    normalized.includes("wrong video password") ||
    normalized.includes("video password") ||
    normalized.includes("--video-password")
  ) {
    return {
      kind: "video-password-required",
      userMessage: "This video requires a video password.",
      diagnosticMessage,
      recoveryActions: [recoveryActions.provideVideoPassword],
    };
  }

  if (
    normalized.includes("login required") ||
    normalized.includes("requires authentication") ||
    normalized.includes("authentication required") ||
    normalized.includes("not logged in") ||
    normalized.includes("login with") ||
    normalized.includes("use --username") ||
    normalized.includes("use --password")
  ) {
    return {
      kind: "credentials-required",
      userMessage:
        "This download requires an account. Add credentials or use cookies from a signed-in browser session.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.provideCredentials,
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
      ],
    };
  }

  if (
    normalized.includes("use --cookies") ||
    normalized.includes("cookies") ||
    normalized.includes("sign in to confirm") ||
    normalized.includes("sign in") ||
    normalized.includes("not available without account")
  ) {
    return {
      kind: "cookies-required",
      userMessage:
        "This download needs cookies from a browser session that can access the video.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
      ],
    };
  }

  if (
    normalized.includes("geo-restricted") ||
    normalized.includes("georestricted") ||
    normalized.includes("geo restricted") ||
    normalized.includes("not available in your country") ||
    normalized.includes("blocked in your country")
  ) {
    return {
      kind: "geo-restricted",
      userMessage:
        "This video is not available from your current region or network.",
      diagnosticMessage,
      recoveryActions: [recoveryActions.changeNetwork],
    };
  }

  if (
    normalized.includes("video unavailable") ||
    normalized.includes("has been removed") ||
    normalized.includes("does not exist") ||
    normalized.includes("http error 404") ||
    normalized.includes("404:")
  ) {
    return {
      kind: "not-found",
      userMessage:
        "This video is unavailable. Check the URL or try opening it in a browser.",
      diagnosticMessage,
      recoveryActions: [recoveryActions.checkUrl],
    };
  }

  if (normalized.includes("http error 403") || normalized.includes("forbidden")) {
    return {
      kind: "forbidden",
      userMessage:
        "The video host denied this download. Update yt-dlp or use cookies from a browser session that can access it.",
      diagnosticMessage,
      recoveryActions: [
        recoveryActions.updateYtDlp,
        recoveryActions.provideCookies,
        recoveryActions.openWebviewCookies,
      ],
    };
  }

  return {
    kind: "unknown",
    userMessage: diagnosticMessage || "The video download failed.",
    diagnosticMessage,
    recoveryActions: [],
  };
}

function diagnosticMessageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "helper_unavailable";
}

export const recoveryActions = {
  updateYtDlp: {
    kind: "update-yt-dlp",
    label: "Update yt-dlp",
    description: "Download the latest bundled yt-dlp executable and retry.",
  },
  retryLater: {
    kind: "retry-later",
    label: "Try later",
    description: "Wait for the host rate limit to cool down before retrying.",
  },
  provideCookies: {
    kind: "provide-cookies",
    label: "Use cookies",
    description: "Choose a cookies.txt file exported from a signed-in browser.",
  },
  openWebviewCookies: {
    kind: "open-webview-cookies",
    label: "Open login window",
    description: "Open a browser login flow so OpenBrief can capture cookies.",
  },
  provideCredentials: {
    kind: "provide-credentials",
    label: "Add credentials",
    description: "Store a username and password securely before retrying.",
  },
  provideVideoPassword: {
    kind: "provide-video-password",
    label: "Add video password",
    description: "Store the video-specific password securely before retrying.",
  },
  changeNetwork: {
    kind: "change-network",
    label: "Change network",
    description: "Use a network or account that can access this region.",
  },
  checkUrl: {
    kind: "check-url",
    label: "Check URL",
    description: "Open the page in a browser and confirm the video is available.",
  },
  restartHelper: {
    kind: "restart-helper",
    label: "Restart helper",
    description: "Restart OpenBrief so the bundled download helper can relaunch.",
  },
} satisfies Record<string, DownloadRecoveryAction>;
