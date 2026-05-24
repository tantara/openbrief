import { describe, expect, it } from "vitest";
import {
  defaultPodcastTtsSettings,
  defaultTtsSettings,
  loadPodcastTtsSettings,
  loadTtsSettings,
  savePodcastTtsSettings,
  saveTtsSettings,
  supertonicPresetVoiceStyleLabel,
} from "@/services/ttsSettingsService";

function createMemoryStorage(initialValue?: string, key = "openbrief.tts-settings"): Storage {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(key, initialValue);
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

describe("ttsSettingsService", () => {
  it("uses human-readable Supertonic preset voice labels", () => {
    expect(supertonicPresetVoiceStyleLabel("M1")).toBe("Mark (M1)");
    expect(supertonicPresetVoiceStyleLabel("F2")).toBe("Sophia (F2)");
  });

  it("loads defaults when no settings are saved", () => {
    expect(loadTtsSettings(createMemoryStorage())).toEqual(defaultTtsSettings);
  });

  it("persists the selected Supertonic voice", () => {
    const storage = createMemoryStorage();

    const saved = saveTtsSettings(
      {
        engine: "supertonic",
        modelId: "Supertone/supertonic-3",
        voiceStyleId: "F3",
        qwenPresetVoiceId: "default",
        languageCode: "ko",
        hasSelectedVoice: true,
      },
      storage,
    );

    expect(loadTtsSettings(storage)).toEqual(saved);
  });

  it("repairs invalid saved values", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        engine: "missing",
        modelId: "Supertone/supertonic-2",
        voiceStyleId: "X1",
        qwenPresetVoiceId: "missing",
        languageCode: "zh",
        hasSelectedVoice: "yes",
      }),
    );

    expect(loadTtsSettings(storage)).toEqual(defaultTtsSettings);
  });

  it("persists Qwen3-TTS settings", () => {
    const storage = createMemoryStorage();

    const saved = saveTtsSettings(
      {
        ...defaultTtsSettings,
        engine: "qwen",
        modelId: "qwen-tts-1.7B",
        qwenPresetVoiceId: "default",
        languageCode: "zh",
        hasSelectedVoice: true,
      },
      storage,
    );

    expect(loadTtsSettings(storage)).toEqual(saved);
  });

  it("persists podcast TTS settings separately", () => {
    const storage = createMemoryStorage();
    const saved = savePodcastTtsSettings(
      {
        mode: "audiobook-brief",
        lengthMode: "long",
        speakerAVoiceStyleId: "M3",
        speakerBVoiceStyleId: "F4",
        languageCode: "fr",
      },
      storage,
    );

    expect(loadPodcastTtsSettings(storage)).toEqual(saved);
  });

  it("repairs invalid podcast TTS settings", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        mode: "radio",
        lengthMode: "forever",
        speakerAVoiceStyleId: "X",
        speakerBVoiceStyleId: "Y",
        languageCode: "zz",
      }),
      "openbrief.podcast-tts-settings",
    );

    expect(loadPodcastTtsSettings(storage)).toEqual(defaultPodcastTtsSettings);
  });
});
