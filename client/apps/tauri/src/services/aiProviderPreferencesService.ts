import type { ProviderKind } from "@/domain/media-library";
import {
  defaultProviderModels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import {
  getWorkspaceStorageItem,
  setWorkspaceStorageItem,
} from "@/services/workspaceStorage";

export type AiWorkflowProviderConfig = {
  provider: ProviderKind;
  model: string;
  streamingMode: boolean;
};

export type AiProviderPreferences = {
  summary: AiWorkflowProviderConfig;
  chat: AiWorkflowProviderConfig;
};

export const defaultAiProviderPreferences: AiProviderPreferences = {
  summary: {
    provider: "openai",
    model: defaultProviderModels.openai,
    streamingMode: false,
  },
  chat: {
    provider: "openai",
    model: defaultProviderModels.openai,
    streamingMode: false,
  },
};

const storageKey = "openbrief.ai-provider-preferences";

export function loadAiProviderPreferences(
  storage = browserLocalStorage(),
): AiProviderPreferences {
  if (!storage) return defaultAiProviderPreferences;

  try {
    return normalizeAiProviderPreferences(
      JSON.parse(getWorkspaceStorageItem(storageKey, storage) ?? "{}"),
    );
  } catch {
    return defaultAiProviderPreferences;
  }
}

export function saveAiProviderPreferences(
  preferences: AiProviderPreferences,
  storage = browserLocalStorage(),
): AiProviderPreferences {
  const normalized = normalizeAiProviderPreferences(preferences);
  setWorkspaceStorageItem(storageKey, JSON.stringify(normalized), storage);
  return normalized;
}

function normalizeAiProviderPreferences(value: unknown): AiProviderPreferences {
  if (!value || typeof value !== "object") return defaultAiProviderPreferences;

  const candidate = value as Partial<
    Record<keyof AiProviderPreferences, unknown>
  >;

  return {
    summary: normalizeWorkflowConfig(
      candidate.summary,
      defaultAiProviderPreferences.summary,
    ),
    chat: normalizeWorkflowConfig(
      candidate.chat,
      defaultAiProviderPreferences.chat,
    ),
  };
}

function normalizeWorkflowConfig(
  value: unknown,
  fallback: AiWorkflowProviderConfig,
): AiWorkflowProviderConfig {
  if (!value || typeof value !== "object") return fallback;

  const candidate = value as Partial<
    Record<keyof AiWorkflowProviderConfig, unknown>
  >;
  const provider = providerOptions.includes(candidate.provider as ProviderKind)
    ? (candidate.provider as ProviderKind)
    : fallback.provider;
  const model =
    typeof candidate.model === "string" &&
    candidate.model.length > 0 &&
    (provider === "openai-compatible" ||
      providerModelOptions[provider].includes(candidate.model))
      ? candidate.model
      : defaultProviderModels[provider];

  return {
    provider,
    model,
    streamingMode:
      typeof candidate.streamingMode === "boolean"
        ? candidate.streamingMode
        : fallback.streamingMode,
  };
}

function browserLocalStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
