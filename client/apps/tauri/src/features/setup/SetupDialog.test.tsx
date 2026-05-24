import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SetupDialog } from "@/features/setup/SetupDialog";
import { createPlatformCompatibilityReport } from "@/domain/compatibility";
import {
  createZeroStorageUsageSnapshot,
  type SettingsSnapshot,
} from "@/domain/settings";

describe("SetupDialog", () => {
  it("gates transcription until the selected Whisper model is downloaded", async () => {
    const onDownloadWhisperModel = vi.fn().mockResolvedValue(undefined);
    const onContinue = vi.fn().mockResolvedValue(undefined);

    render(
      <SetupDialog
        {...defaultProps({
          mode: "transcription",
          selectedWhisperModelId: "whisper-small",
          onDownloadWhisperModel,
          onContinue,
        })}
      />,
    );

    expect(screen.getByText("Transcription Setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(onDownloadWhisperModel).toHaveBeenCalled());
    expect(onDownloadWhisperModel.mock.calls[0][0]).toBe("whisper-small");
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("saves an AI provider key before summary or chat can continue", async () => {
    const onSaveProviderApiKey = vi.fn().mockResolvedValue(undefined);

    render(
      <SetupDialog
        {...defaultProps({
          mode: "summary",
          onSaveProviderApiKey,
        })}
      />,
    );

    expect(screen.getByText("Summary Setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/api key/i), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(onSaveProviderApiKey).toHaveBeenCalledWith("openai", "sk-test"),
    );
  });

  it("shows OpenAI auth method choices like the connect flow", () => {
    render(
      <SetupDialog
        {...defaultProps({
          mode: "provider",
          provider: "openai",
        })}
      />,
    );

    expect(screen.getByText("Select auth method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chatgpt plus\/pro/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manually enter api key/i }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /chatgpt plus\/pro/i }));

    expect(screen.getByRole("button", { name: /connect chatgpt plus\/pro/i }))
      .toBeDisabled();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it("keeps non-OpenAI providers on API-key auth only", () => {
    render(
      <SetupDialog
        {...defaultProps({
          mode: "provider",
          provider: "anthropic",
          providerModel: "claude-sonnet-4-6",
        })}
      />,
    );

    expect(screen.queryByText("Select auth method")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /chatgpt plus\/pro/i }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
  });

  it("reuses provider setup for Settings configuration", () => {
    render(
      <SetupDialog
        {...defaultProps({
          mode: "provider",
          provider: "gemini",
          providerModel: "gemini-3.1-flash-lite",
        })}
      />,
    );

    expect(screen.getByText("AI Provider Setup")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("gemini");
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("shows Whisper model download progress while the download is running", async () => {
    let resolveDownload: (() => void) | undefined;
    const onDownloadWhisperModel = vi.fn((_modelId, options) => {
      options?.onProgress({
        modelId: "whisper-small",
        fileName: "ggml-small.bin",
        downloadedBytes: 43,
        totalBytes: 100,
        progress: 0.43,
        progressPercent: 43,
      });

      return new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
    });

    render(
      <SetupDialog
        {...defaultProps({
          mode: "transcription",
          selectedWhisperModelId: "whisper-small",
          onDownloadWhisperModel,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(screen.getAllByText("43%").length).toBeGreaterThan(0));
    expect(screen.getByText("downloading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await act(async () => {
      resolveDownload?.();
    });
  });

  it("asks for confirmation before downloading a warning-level model", async () => {
    const onDownloadWhisperModel = vi.fn().mockResolvedValue(undefined);

    render(
      <SetupDialog
        {...defaultProps({
          mode: "transcription",
          settings: {
            ...settings,
            compatibility: createPlatformCompatibilityReport({
              platform: "windows",
              architecture: "x86_64",
              downloaderStatus: "available",
              ytdlpIsStale: false,
              mediaTools: configuredMediaTools,
              sttModels: [
                { id: "whisper-small", name: "Whisper Small", sizeMb: 466 },
                { id: "whisper-base", name: "Whisper Base", sizeMb: 142 },
              ],
            }),
          },
          selectedWhisperModelId: "whisper-small",
          onDownloadWhisperModel,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(screen.getByText("Compatibility warning")).toBeInTheDocument();
    expect(onDownloadWhisperModel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue anyway/i }));

    await waitFor(() =>
      expect(onDownloadWhisperModel).toHaveBeenCalledWith(
        "whisper-small",
        expect.any(Object),
      ),
    );
  });

  it("blocks model downloads that are incompatible with the platform", () => {
    const onDownloadWhisperModel = vi.fn().mockResolvedValue(undefined);
    const blockedSettings: SettingsSnapshot = {
      ...settings,
      stt: {
        ...settings.stt,
        models: [
          {
            id: "whisper-medium",
            name: "Whisper Medium",
            engine: "whisper.cpp",
            fileName: "ggml-medium.bin",
            sizeMb: 1536,
            downloaded: false,
            recommended: true,
          },
        ],
      },
      compatibility: createPlatformCompatibilityReport({
        platform: "linux",
        architecture: "aarch64",
        downloaderStatus: "available",
        ytdlpIsStale: false,
        mediaTools: configuredMediaTools,
        sttModels: [
          { id: "whisper-medium", name: "Whisper Medium", sizeMb: 1536 },
        ],
      }),
    };

    render(
      <SetupDialog
        {...defaultProps({
          mode: "transcription",
          settings: blockedSettings,
          selectedWhisperModelId: "whisper-medium",
          onDownloadWhisperModel,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled();
    expect(screen.getByText(/blocked on Linux ARM64/i)).toBeInTheDocument();
  });
});

const settings: SettingsSnapshot = {
  versionInfo: {
    appName: "OpenBrief",
    appVersion: "0.1.0",
    osPlatform: "macos",
    osVersion: "15.5",
    osArch: "aarch64",
    updater: {
      status: "current",
      currentVersion: "0.1.0",
      canUpdate: false,
    },
  },
  videoDownload: {
    youtubeApiKeyRequired: false,
    keyStatus: "not-required",
    downloader: "yt-dlp",
    downloaderStatus: "available",
    ytdlpUpdate: {
      tool: "yt-dlp",
      staleAfterDays: 30,
      isStale: false,
      autoUpdateEnabled: false,
      source: "bundled-resource",
      canUpdate: true,
    },
    access: {
      cookiesEnabled: false,
      cookieSource: "none",
      browser: undefined,
      browserProfile: undefined,
      cookiesFileConfigured: false,
      cookiesFilePath: undefined,
      poTokenConfigured: false,
      extractorArgsConfigured: false,
    },
    mediaTools: [],
  },
  stt: {
    downloadRequiresUserConfirmation: true,
    storage: "app-data/models",
    models: [
      {
        id: "whisper-small",
        name: "Whisper Small",
        engine: "whisper.cpp",
        fileName: "ggml-small.bin",
        sizeMb: 466,
        downloaded: false,
        recommended: true,
      },
      {
        id: "whisper-base",
        name: "Whisper Base",
        engine: "whisper.cpp",
        fileName: "ggml-base.bin",
        sizeMb: 142,
        downloaded: true,
        recommended: false,
      },
    ],
  },
  llm: {
    defaultProvider: "openai",
    defaultModels: {
      openai: "gpt-5.4-mini",
      anthropic: "claude-sonnet-4-6",
      gemini: "gemini-3.1-flash-lite",
      openrouter: "deepseek/deepseek-v4-flash",
    },
    accounts: [
      {
        provider: "openai",
        label: "OpenAI",
        configured: false,
        authModes: ["api-key", "oauth-subscription"],
        credentialPolicy: "os-keychain-preferred",
        oauthStatus: "planned",
      },
      {
        provider: "anthropic",
        label: "Claude",
        configured: false,
        authModes: ["api-key", "oauth-subscription"],
        credentialPolicy: "os-keychain-preferred",
        oauthStatus: "planned",
      },
      {
        provider: "gemini",
        label: "Gemini",
        configured: false,
        authModes: ["api-key", "oauth-subscription"],
        credentialPolicy: "os-keychain-preferred",
        oauthStatus: "planned",
      },
      {
        provider: "openrouter",
        label: "OpenRouter",
        configured: false,
        authModes: ["api-key", "oauth-subscription"],
        credentialPolicy: "os-keychain-preferred",
        oauthStatus: "planned",
      },
    ],
  },
  storage: createZeroStorageUsageSnapshot("2026-05-24T00:00:00.000Z"),
  compatibility: createPlatformCompatibilityReport({
    platform: "macos",
    architecture: "aarch64",
    downloaderStatus: "available",
    ytdlpIsStale: false,
    mediaTools: [
      { tool: "yt-dlp", status: "configured" },
      { tool: "ffmpeg", status: "configured" },
      { tool: "ffprobe", status: "configured" },
    ],
    sttModels: [
      { id: "whisper-small", name: "Whisper Small", sizeMb: 466 },
      { id: "whisper-base", name: "Whisper Base", sizeMb: 142 },
    ],
  }),
};

const configuredMediaTools = [
  { tool: "yt-dlp", status: "configured" as const },
  { tool: "ffmpeg", status: "configured" as const },
  { tool: "ffprobe", status: "configured" as const },
];

function defaultProps(overrides: Partial<ComponentProps<typeof SetupDialog>> = {}) {
  return {
    open: true,
    mode: "transcription" as const,
    settings,
    selectedWhisperModelId: "whisper-small",
    provider: "openai" as const,
    providerModel: "gpt-5.4-mini",
    onClose: vi.fn(),
    onWhisperModelChange: vi.fn(),
    onProviderChange: vi.fn(),
    onProviderModelChange: vi.fn(),
    onDownloadWhisperModel: vi.fn().mockResolvedValue(undefined),
    onSaveProviderApiKey: vi.fn().mockResolvedValue(undefined),
    onContinue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
