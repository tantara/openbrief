export type AiRequestErrorKind = "offline" | "provider";

export const aiRequestOfflineMessage =
  "OpenBrief is offline. Check your internet connection and try the AI request again.";

export const aiRequestFailedMessage =
  "The AI request failed. Check your connection or provider settings and try again.";

export function classifyAiRequestError(error: unknown): AiRequestErrorKind {
  return isLikelyNetworkUnavailableError(error) ? "offline" : "provider";
}

export function userFacingAiRequestErrorMessage(error: unknown) {
  return classifyAiRequestError(error) === "offline"
    ? aiRequestOfflineMessage
    : aiRequestFailedMessage;
}

export function isLikelyNetworkUnavailableError(error: unknown) {
  const normalized = diagnosticMessageFor(error).toLowerCase();

  return networkUnavailableFragments.some((fragment) =>
    normalized.includes(fragment),
  );
}

function diagnosticMessageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

const networkUnavailableFragments = [
  "failed to fetch",
  "networkerror",
  "network error",
  "network offline",
  "network is unreachable",
  "internet connection",
  "could not resolve host",
  "could not resolve hostname",
  "temporary failure in name resolution",
  "name or service not known",
  "no route to host",
  "connection refused",
  "connection reset",
  "connection timed out",
  "operation timed out",
  "dns error",
  "enotfound",
  "eai_again",
  "err_internet_disconnected",
  "nsurlerrordomain",
];
