import {
  classifyAiRequestError,
  isLikelyNetworkUnavailableError,
  userFacingAiRequestErrorMessage,
} from "@/domain/user-facing-error";
import { describe, expect, it } from "vitest";

describe("user-facing errors", () => {
  it("classifies offline network failures", () => {
    expect(
      isLikelyNetworkUnavailableError(
        new TypeError("Failed to fetch: ERR_INTERNET_DISCONNECTED"),
      ),
    ).toBe(true);
    expect(
      classifyAiRequestError("Could not resolve host: api.openai.com"),
    ).toBe("offline");
  });

  it("turns provider sentinels into user-facing AI messages", () => {
    expect(userFacingAiRequestErrorMessage("provider_request_failed")).toBe(
      "The AI request failed. Check your connection or provider settings and try again.",
    );
  });
});
