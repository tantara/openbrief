import type { Qwen3TtsLanguageCode, Supertonic3LanguageCode } from "@acme/model-card";
import { isSynthesisLanguageSupportedByModel } from "@acme/model-card";
import type { PodcastLengthMode, PodcastOutputMode } from "@/domain/podcast";

export type TtsEngine = "supertonic" | "qwen";
export type TtsModelId =
  | "Supertone/supertonic-3"
  | "qwen-tts-0.6B"
  | "qwen-tts-1.7B";
export type TtsLanguageCode = Supertonic3LanguageCode | Qwen3TtsLanguageCode;
export type SupertonicVoiceStyleId =
  | "M1"
  | "M2"
  | "M3"
  | "M4"
  | "M5"
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5";

export type SupertonicPresetVoiceStyle = {
  id: SupertonicVoiceStyleId;
  label: string;
};

export type QwenPresetVoiceId = "default";

export type QwenPresetVoice = {
  id: QwenPresetVoiceId;
  label: string;
};

export type TtsSettings = {
  engine: TtsEngine;
  modelId: TtsModelId;
  voiceStyleId: SupertonicVoiceStyleId;
  qwenPresetVoiceId: QwenPresetVoiceId;
  languageCode: TtsLanguageCode;
  hasSelectedVoice: boolean;
};

export type PodcastTtsSettings = {
  mode: PodcastOutputMode;
  lengthMode: PodcastLengthMode;
  speakerAVoiceStyleId: SupertonicVoiceStyleId;
  speakerBVoiceStyleId: SupertonicVoiceStyleId;
  languageCode: TtsLanguageCode;
};

export const supertonicPresetVoiceStyles: SupertonicPresetVoiceStyle[] = [
  { id: "M1", label: "Mark (M1)" },
  { id: "M2", label: "David (M2)" },
  { id: "M3", label: "Daniel (M3)" },
  { id: "M4", label: "James (M4)" },
  { id: "M5", label: "Lucas (M5)" },
  { id: "F1", label: "Emma (F1)" },
  { id: "F2", label: "Sophia (F2)" },
  { id: "F3", label: "Olivia (F3)" },
  { id: "F4", label: "Ava (F4)" },
  { id: "F5", label: "Mia (F5)" },
];

export const qwenPresetVoices: QwenPresetVoice[] = [
  { id: "default", label: "Default" },
];

export const defaultTtsSettings: TtsSettings = {
  engine: "qwen",
  modelId: "qwen-tts-0.6B",
  voiceStyleId: "M1",
  qwenPresetVoiceId: "default",
  languageCode: "en",
  hasSelectedVoice: false,
};

export const defaultPodcastTtsSettings: PodcastTtsSettings = {
  mode: "podcast-summary",
  lengthMode: "default",
  speakerAVoiceStyleId: "M1",
  speakerBVoiceStyleId: "F2",
  languageCode: "en",
};

const storageKey = "openbrief.tts-settings";
const podcastStorageKey = "openbrief.podcast-tts-settings";

export function loadTtsSettings(storage = browserLocalStorage()): TtsSettings {
  if (!storage) return defaultTtsSettings;

  try {
    return normalizeTtsSettings(JSON.parse(storage.getItem(storageKey) ?? "{}"));
  } catch {
    return defaultTtsSettings;
  }
}

export function saveTtsSettings(
  settings: TtsSettings,
  storage = browserLocalStorage(),
): TtsSettings {
  const normalized = normalizeTtsSettings(settings);
  storage?.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}

export function loadPodcastTtsSettings(
  storage = browserLocalStorage(),
): PodcastTtsSettings {
  if (!storage) return defaultPodcastTtsSettings;

  try {
    return normalizePodcastTtsSettings(
      JSON.parse(storage.getItem(podcastStorageKey) ?? "{}"),
    );
  } catch {
    return defaultPodcastTtsSettings;
  }
}

export function savePodcastTtsSettings(
  settings: PodcastTtsSettings,
  storage = browserLocalStorage(),
): PodcastTtsSettings {
  const normalized = normalizePodcastTtsSettings(settings);
  storage?.setItem(podcastStorageKey, JSON.stringify(normalized));
  return normalized;
}

function normalizeTtsSettings(value: unknown): TtsSettings {
  if (!value || typeof value !== "object") return defaultTtsSettings;

  const candidate = value as Partial<Record<keyof TtsSettings, unknown>>;
  const rawModelId = candidate.modelId;
  const modelWasValid = isTtsModelId(rawModelId);
  const modelId: TtsModelId = modelWasValid
    ? rawModelId
    : defaultTtsSettings.modelId;

  return {
    engine: ttsEngineForModel(modelId),
    modelId,
    voiceStyleId: isSupertonicVoiceStyleId(candidate.voiceStyleId)
      ? candidate.voiceStyleId
      : defaultTtsSettings.voiceStyleId,
    qwenPresetVoiceId: isQwenPresetVoiceId(candidate.qwenPresetVoiceId)
      ? candidate.qwenPresetVoiceId
      : defaultTtsSettings.qwenPresetVoiceId,
    languageCode: modelWasValid && isTtsLanguageCode(modelId, candidate.languageCode)
      ? candidate.languageCode
      : defaultLanguageForModel(modelId),
    hasSelectedVoice:
      typeof candidate.hasSelectedVoice === "boolean"
        ? candidate.hasSelectedVoice
        : defaultTtsSettings.hasSelectedVoice,
  };
}

function normalizePodcastTtsSettings(value: unknown): PodcastTtsSettings {
  if (!value || typeof value !== "object") return defaultPodcastTtsSettings;

  const candidate = value as Partial<Record<keyof PodcastTtsSettings, unknown>>;

  return {
    mode:
      candidate.mode === "audiobook-brief" ||
      candidate.mode === "podcast-summary"
        ? candidate.mode
        : defaultPodcastTtsSettings.mode,
    lengthMode:
      candidate.lengthMode === "short" ||
      candidate.lengthMode === "default" ||
      candidate.lengthMode === "long"
        ? candidate.lengthMode
        : defaultPodcastTtsSettings.lengthMode,
    speakerAVoiceStyleId: isSupertonicVoiceStyleId(candidate.speakerAVoiceStyleId)
      ? candidate.speakerAVoiceStyleId
      : defaultPodcastTtsSettings.speakerAVoiceStyleId,
    speakerBVoiceStyleId: isSupertonicVoiceStyleId(candidate.speakerBVoiceStyleId)
      ? candidate.speakerBVoiceStyleId
      : defaultPodcastTtsSettings.speakerBVoiceStyleId,
    languageCode: isTtsLanguageCode("Supertone/supertonic-3", candidate.languageCode)
      ? candidate.languageCode
      : defaultPodcastTtsSettings.languageCode,
  };
}

function isSupertonicVoiceStyleId(
  value: unknown,
): value is SupertonicVoiceStyleId {
  return supertonicPresetVoiceStyles.some((voice) => voice.id === value);
}

function isQwenPresetVoiceId(value: unknown): value is QwenPresetVoiceId {
  return qwenPresetVoices.some((voice) => voice.id === value);
}

function isTtsModelId(value: unknown): value is TtsModelId {
  return (
    value === "Supertone/supertonic-3" ||
    value === "qwen-tts-0.6B" ||
    value === "qwen-tts-1.7B"
  );
}

export function ttsEngineForModel(modelId: TtsModelId): TtsEngine {
  return modelId.startsWith("qwen-") ? "qwen" : "supertonic";
}

export function supertonicPresetVoiceStyleLabel(
  voiceStyleId: SupertonicVoiceStyleId,
): string {
  return (
    supertonicPresetVoiceStyles.find((voice) => voice.id === voiceStyleId)
      ?.label ?? voiceStyleId
  );
}

export function defaultLanguageForModel(modelId: TtsModelId): TtsLanguageCode {
  return isSynthesisLanguageSupportedByModel(modelId, "en")
    ? "en"
    : defaultTtsSettings.languageCode;
}

function isTtsLanguageCode(
  modelId: TtsModelId,
  value: unknown,
): value is TtsLanguageCode {
  return (
    typeof value === "string" &&
    isSynthesisLanguageSupportedByModel(modelId, value)
  );
}

function browserLocalStorage() {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
