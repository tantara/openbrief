import { describe, expect, it } from "vitest";
import {
  defaultAiProviderPreferences,
  loadAiProviderPreferences,
  saveAiProviderPreferences,
} from "@/services/aiProviderPreferencesService";

function createMemoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set("openbrief.ai-provider-preferences", initialValue);
  }

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("aiProviderPreferencesService", () => {
  it("loads defaults when no preferences are saved", () => {
    expect(loadAiProviderPreferences(createMemoryStorage())).toEqual(
      defaultAiProviderPreferences,
    );
  });

  it("persists separate workflow provider preferences", () => {
    const storage = createMemoryStorage();

    const saved = saveAiProviderPreferences(
      {
        summary: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          streamingMode: true,
        },
        chat: {
          provider: "gemini",
          model: "gemini-3.5-flash",
          streamingMode: false,
        },
        editorAgent: {
          provider: "openrouter",
          model: "deepseek/deepseek-v4-flash",
          streamingMode: true,
        },
      },
      storage,
    );

    expect(loadAiProviderPreferences(storage)).toEqual(saved);
  });

  it("repairs invalid provider models", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        summary: {
          provider: "anthropic",
          model: "gpt-5.4-mini",
          streamingMode: true,
        },
        chat: {
          provider: "unknown",
          model: "missing",
          streamingMode: "yes",
        },
        editorAgent: {
          provider: "openrouter",
          model: "missing",
          streamingMode: true,
        },
      }),
    );

    expect(loadAiProviderPreferences(storage)).toEqual({
      summary: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        streamingMode: true,
      },
      chat: defaultAiProviderPreferences.chat,
      editorAgent: {
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        streamingMode: true,
      },
    });
  });
});
