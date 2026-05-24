import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultSystemPromptSettings,
  loadSystemPromptSettings,
  resetSystemPromptSettings,
  saveSystemPromptSettings,
} from "@/services/systemPromptSettingsService";

describe("system prompt settings service", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads preset prompts by default", () => {
    expect(loadSystemPromptSettings()).toEqual(defaultSystemPromptSettings);
  });

  it("persists user prompt overrides", () => {
    saveSystemPromptSettings({
      videoSummary: "Custom summary prompt",
      chat: "Custom chat prompt",
      transcriptReview: "Custom review prompt",
      transcriptTranslation: "Custom translation prompt",
    });

    expect(loadSystemPromptSettings()).toEqual({
      videoSummary: "Custom summary prompt",
      chat: "Custom chat prompt",
      transcriptReview: "Custom review prompt",
      transcriptTranslation: "Custom translation prompt",
    });
  });

  it("resets back to preset prompts", () => {
    saveSystemPromptSettings({
      videoSummary: "Custom summary prompt",
      chat: "Custom chat prompt",
      transcriptReview: "Custom review prompt",
      transcriptTranslation: "Custom translation prompt",
    });

    expect(resetSystemPromptSettings()).toEqual(defaultSystemPromptSettings);
    expect(loadSystemPromptSettings()).toEqual(defaultSystemPromptSettings);
  });

  it("backfills new prompt slots when older settings are loaded", () => {
    localStorage.setItem(
      "openbrief.system-prompts",
      JSON.stringify({
        videoSummary: "Legacy summary prompt",
        chat: "Legacy chat prompt",
      }),
    );

    expect(loadSystemPromptSettings()).toEqual({
      ...defaultSystemPromptSettings,
      videoSummary: "Legacy summary prompt",
      chat: "Legacy chat prompt",
    });
  });
});
