import type { SettingsSnapshot } from "@/domain/settings";
import { createPlatformCompatibilityReport } from "@/domain/compatibility";
import { SettingsView } from "@/features/settings/SettingsView";
import { defaultAiProviderPreferences } from "@/services/aiProviderPreferencesService";
import { defaultSystemPromptSettings } from "@/services/systemPromptSettingsService";
import { defaultTtsSettings } from "@/services/ttsSettingsService";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const settings: SettingsSnapshot = {
  versionInfo: {
    appName: "OpenBrief",
    appVersion: "0.1.0",
    tauriVersion: "2.11.2",
    osPlatform: "macos",
    osVersion: "15.5",
    osArch: "aarch64",
    updater: {
      status: "available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      canUpdate: true,
    },
  },
  videoDownload: {
    youtubeApiKeyRequired: false,
    keyStatus: "not-required",
    downloader: "yt-dlp",
    downloaderStatus: "available",
    protocolVersion: 1,
    ytdlpUpdate: {
      tool: "yt-dlp",
      version: "2026.03.17",
      versionDate: "2026.03.17",
      ageDays: 12,
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
    mediaTools: [
      { tool: "yt-dlp", status: "configured" },
      { tool: "ffmpeg", status: "configured" },
      { tool: "ffprobe", status: "configured" },
    ],
  },
  stt: {
    downloadRequiresUserConfirmation: true,
    storage: "app-data/models",
    models: [
      {
        id: "qwen3-asr-0.6B",
        name: "Qwen3-ASR 0.6B + ForcedAligner",
        engine: "qwen3-asr",
        fileName: "localai/qwen3-asr-0.6B",
        sizeMb: 2400,
        downloaded: false,
        downloadsOnDemand: true,
        recommended: true,
      },
      {
        id: "parakeet-tdt-0.6b-v3",
        name: "Parakeet v3",
        engine: "fluidaudio",
        fileName: "fluid/parakeet-tdt-0.6b-v3",
        sizeMb: 1200,
        downloaded: false,
        recommended: true,
      },
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
        downloaded: false,
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
        configured: true,
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
  storage: {
    totalBytes: 1_536,
    measuredAtIso: "2026-05-24T00:00:00.000Z",
    items: [
      {
        category: "database",
        label: "Database",
        sizeBytes: 512,
        percentage: 33.3,
      },
      {
        category: "video",
        label: "Video",
        sizeBytes: 1_024,
        percentage: 66.7,
      },
      {
        category: "audio",
        label: "Audio",
        sizeBytes: 0,
        percentage: 0,
      },
      {
        category: "pdf",
        label: "PDF",
        sizeBytes: 0,
        percentage: 0,
      },
      {
        category: "model-checkpoint",
        label: "Model checkpoint",
        sizeBytes: 0,
        percentage: 0,
      },
    ],
  },
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
      {
        id: "qwen3-asr-0.6B",
        name: "Qwen3-ASR 0.6B + ForcedAligner",
        sizeMb: 2400,
      },
      { id: "parakeet-tdt-0.6b-v3", name: "Parakeet v3", sizeMb: 1200 },
      { id: "whisper-small", name: "Whisper Small", sizeMb: 466 },
      { id: "whisper-base", name: "Whisper Base", sizeMb: 142 },
    ],
  }),
};

function openSettingsTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("SettingsView", () => {
  it("renders section cards while settings are loading", () => {
    render(<SettingsView />);

    expect(
      screen.getByRole("tablist", { name: "Settings sections" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "System" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Video Download" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Speech" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Help" })).toBeInTheDocument();
    openSettingsTab("System");
    expect(screen.getAllByText("Loading settings...").length).toBeGreaterThan(
      0,
    );
  });

  it("renders version, video download, STT, and AI provider sections", () => {
    render(<SettingsView settings={settings} />);

    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "System" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Video Download" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Speech" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Help" })).toBeInTheDocument();

    openSettingsTab("System");
    expect(screen.getByText("Version Info")).toBeInTheDocument();
    expect(screen.getAllByText("Storage").length).toBeGreaterThan(0);
    expect(screen.getByText("Compatibility")).toBeInTheDocument();
    expect(screen.getByText("OpenBrief 0.1.0")).toBeInTheDocument();
    expect(screen.queryByText("2.11.2")).not.toBeInTheDocument();
    expect(screen.getAllByText("update available").length).toBeGreaterThan(0);
    expect(screen.getByText("0.2.0")).toBeInTheDocument();
    expect(screen.getByText("Total: 1.5 KB")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("Model checkpoint")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("macOS ARM64")).toBeInTheDocument();
    expect(screen.getAllByText("supported").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();

    openSettingsTab("Video Download");
    expect(screen.getAllByText("Video Download").length).toBeGreaterThan(0);
    expect(screen.getByText("Not required")).toBeInTheDocument();
    expect(screen.getByText("available")).toBeInTheDocument();
    expect(screen.getByText("2026.03.17")).toBeInTheDocument();
    expect(screen.getByText("Update yt-dlp")).toBeInTheDocument();
    expect(screen.getByText("yt-dlp: configured")).toBeInTheDocument();
    expect(screen.getByText("Authentication & cookies")).toBeInTheDocument();
    expect(screen.getByText("Use browser cookies")).toBeInTheDocument();
    expect(screen.getByText("Choose cookies.txt")).toBeInTheDocument();

    openSettingsTab("Speech");
    expect(screen.getByText("STT")).toBeInTheDocument();
    expect(screen.getByText("TTS")).toBeInTheDocument();
    expect(screen.getByText("Whisper Small")).toBeInTheDocument();
    expect(screen.getByText("Advanced models")).toBeInTheDocument();
    expect(screen.getByText("on demand")).toBeInTheDocument();
    expect(screen.getAllByText("not downloaded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Qwen3-TTS 0.6B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("English (en)").length).toBeGreaterThan(0);

    openSettingsTab("AI");
    expect(screen.getByText("AI Providers")).toBeInTheDocument();
    expect(screen.getByText("System Prompts")).toBeInTheDocument();
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
    expect(screen.getAllByText("configured").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Configure" })).toHaveLength(
      4,
    );

    openSettingsTab("Shortcuts");
    expect(screen.getByText("Open Library")).toBeInTheDocument();
    expect(screen.getByText("Focus Library search")).toBeInTheDocument();
  });

  it("changes the app theme from settings", () => {
    const onThemeChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        appTheme="light"
        onThemeChange={onThemeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("refreshes storage usage from settings", async () => {
    const onRefreshStorage = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsView settings={settings} onRefreshStorage={onRefreshStorage} />,
    );

    openSettingsTab("System");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(onRefreshStorage).toHaveBeenCalledTimes(1));
  });

  it("shows storage errors without hiding the rest of settings", () => {
    render(
      <SettingsView
        settings={{
          ...settings,
          storage: {
            ...settings.storage,
            errorMessage: "storage_read_dir_failed:denied",
          },
        }}
      />,
    );

    openSettingsTab("System");
    expect(screen.getByText("Storage usage unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("storage_read_dir_failed:denied"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Video Download" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
  });

  it("surfaces platform compatibility warnings", () => {
    render(
      <SettingsView
        settings={{
          ...settings,
          compatibility: createPlatformCompatibilityReport({
            platform: "linux",
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
              { id: "whisper-medium", name: "Whisper Medium", sizeMb: 1536 },
            ],
          }),
          stt: {
            ...settings.stt,
            models: [
              ...settings.stt.models,
              {
                id: "whisper-medium",
                name: "Whisper Medium",
                engine: "whisper.cpp",
                fileName: "ggml-medium.bin",
                sizeMb: 1536,
                downloaded: false,
                recommended: false,
              },
            ],
          },
        }}
      />,
    );

    openSettingsTab("System");
    expect(screen.getByText("Linux ARM64")).toBeInTheDocument();
    expect(screen.getAllByText("warning").length).toBeGreaterThan(0);
    openSettingsTab("Speech");
    expect(screen.getByText(/blocked on Linux ARM64/i)).toBeInTheDocument();
  });

  it("changes the color seed from settings", () => {
    const onColorSeedChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        appColorSeed="green"
        onColorSeedChange={onColorSeedChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));

    expect(onColorSeedChange).toHaveBeenCalledWith("blue");
  });

  it("opens provider setup from an AI provider row", () => {
    const onConfigureProvider = vi.fn();

    render(
      <SettingsView
        settings={settings}
        onConfigureProvider={onConfigureProvider}
      />,
    );

    openSettingsTab("AI");
    fireEvent.click(screen.getAllByRole("button", { name: "Configure" })[1]);

    expect(onConfigureProvider).toHaveBeenCalledWith("anthropic");
  });

  it("updates workflow provider preferences from settings", () => {
    const onAiProviderPreferencesChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        aiProviderPreferences={defaultAiProviderPreferences}
        onAiProviderPreferencesChange={onAiProviderPreferencesChange}
      />,
    );

    openSettingsTab("AI");
    fireEvent.change(screen.getByLabelText("Summarize provider Provider"), {
      target: { value: "anthropic" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Summarize provider Streaming mode",
      }),
    );
    fireEvent.change(screen.getByLabelText("Chat provider Provider"), {
      target: { value: "gemini" },
    });
    fireEvent.change(screen.getByLabelText("Editor agent provider Provider"), {
      target: { value: "openrouter" },
    });

    expect(onAiProviderPreferencesChange).toHaveBeenNthCalledWith(1, {
      ...defaultAiProviderPreferences,
      summary: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        streamingMode: false,
      },
    });
    expect(onAiProviderPreferencesChange).toHaveBeenNthCalledWith(2, {
      ...defaultAiProviderPreferences,
      summary: {
        provider: "openai",
        model: "gpt-5.4-mini",
        streamingMode: true,
      },
    });
    expect(onAiProviderPreferencesChange).toHaveBeenNthCalledWith(3, {
      ...defaultAiProviderPreferences,
      chat: {
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        streamingMode: false,
      },
    });
    expect(onAiProviderPreferencesChange).toHaveBeenNthCalledWith(4, {
      ...defaultAiProviderPreferences,
      editorAgent: {
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        streamingMode: false,
      },
    });
  });

  it("changes the default TTS voice from settings", () => {
    const onTtsSettingsChange = vi.fn();
    const ttsSettings = {
      ...defaultTtsSettings,
      engine: "supertonic" as const,
      modelId: "Supertone/supertonic-3" as const,
      languageCode: "en" as const,
    };

    render(
      <SettingsView
        settings={settings}
        ttsSettings={ttsSettings}
        onTtsSettingsChange={onTtsSettingsChange}
      />,
    );

    openSettingsTab("Speech");
    expect(screen.getAllByText("Mark (M1)").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("option", { name: "Sophia (F2)" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Voice"), {
      target: { value: "F2" },
    });

    expect(onTtsSettingsChange).toHaveBeenCalledWith({
      ...ttsSettings,
      voiceStyleId: "F2",
      hasSelectedVoice: true,
    });
  });

  it("changes the Qwen3-TTS model and language from settings", () => {
    const onTtsSettingsChange = vi.fn();

    render(
      <SettingsView
        settings={settings}
        ttsSettings={defaultTtsSettings}
        onTtsSettingsChange={onTtsSettingsChange}
      />,
    );

    openSettingsTab("Speech");
    fireEvent.change(
      screen.getByLabelText("Model", { selector: "#settings-tts-model" }),
      {
        target: { value: "qwen-tts-1.7B" },
      },
    );
    fireEvent.change(screen.getByLabelText("Speech language"), {
      target: { value: "zh" },
    });

    expect(onTtsSettingsChange).toHaveBeenNthCalledWith(1, {
      ...defaultTtsSettings,
      engine: "qwen",
      modelId: "qwen-tts-1.7B",
      languageCode: "en",
      hasSelectedVoice: true,
    });
    expect(onTtsSettingsChange).toHaveBeenNthCalledWith(2, {
      ...defaultTtsSettings,
      languageCode: "zh",
      hasSelectedVoice: true,
    });
  });

  it("gates Qwen speech options by language and desktop platform", () => {
    const { unmount } = render(
      <SettingsView
        settings={settings}
        ttsSettings={{
          ...defaultTtsSettings,
          engine: "supertonic",
          modelId: "Supertone/supertonic-3",
          languageCode: "ar",
        }}
      />,
    );

    openSettingsTab("Speech");
    expect(
      screen.queryByRole("option", { name: "Qwen3-TTS 0.6B" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Qwen3-ASR 0.6B + ForcedAligner"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Supertonic 3" }),
    ).toBeInTheDocument();
    unmount();

    render(
      <SettingsView
        settings={{
          ...settings,
          versionInfo: {
            ...settings.versionInfo,
            osPlatform: "windows",
          },
        }}
        ttsSettings={{
          ...defaultTtsSettings,
          engine: "qwen",
          modelId: "qwen-tts-0.6B",
          languageCode: "zh",
        }}
      />,
    );

    openSettingsTab("Speech");
    expect(
      screen.getByRole("option", { name: "Qwen3-TTS 0.6B" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Qwen3-ASR 0.6B + ForcedAligner"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Supertonic 3" }),
    ).not.toBeInTheDocument();
  });

  it("runs video download access workflows from settings", () => {
    const onVideoDownloadAccessAction = vi.fn();

    render(
      <SettingsView
        settings={settings}
        onVideoDownloadAccessAction={onVideoDownloadAccessAction}
      />,
    );

    openSettingsTab("Video Download");
    fireEvent.click(
      screen.getByRole("button", { name: "Use browser cookies" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose cookies.txt" }));
    fireEvent.click(screen.getByRole("button", { name: "Configure PO token" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Configure extractor args" }),
    );

    expect(onVideoDownloadAccessAction).toHaveBeenNthCalledWith(
      1,
      "use-browser-cookies",
    );
    expect(onVideoDownloadAccessAction).toHaveBeenNthCalledWith(
      2,
      "choose-cookies-file",
    );
    expect(onVideoDownloadAccessAction).toHaveBeenNthCalledWith(
      3,
      "configure-po-token",
    );
    expect(onVideoDownloadAccessAction).toHaveBeenNthCalledWith(
      4,
      "configure-extractor-args",
    );
  });

  it("runs the app updater from Version Info when an update is available", async () => {
    const onUpdateAppNow = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsView settings={settings} onUpdateAppNow={onUpdateAppNow} />,
    );

    openSettingsTab("System");
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(onUpdateAppNow).toHaveBeenCalledTimes(1));
  });

  it("hides the app update button when the app is current", () => {
    render(
      <SettingsView
        settings={{
          ...settings,
          versionInfo: {
            ...settings.versionInfo,
            updater: {
              status: "current",
              currentVersion: "0.1.0",
              canUpdate: false,
            },
          },
        }}
      />,
    );

    openSettingsTab("System");
    expect(screen.getAllByText("up to date").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
  });

  it("opens help destinations from settings", () => {
    const onOpenOnboarding = vi.fn();
    const onOpenTutorial = vi.fn();
    const onOpenFaq = vi.fn();

    render(
      <SettingsView
        settings={settings}
        onOpenOnboarding={onOpenOnboarding}
        onOpenTutorial={onOpenTutorial}
        onOpenFaq={onOpenFaq}
      />,
    );

    openSettingsTab("Help");
    fireEvent.click(screen.getByRole("button", { name: "Onboarding" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "FAQ" }));

    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);
    expect(onOpenTutorial).toHaveBeenCalledTimes(1);
    expect(onOpenFaq).toHaveBeenCalledTimes(1);
  });

  it("edits and resets system prompts", async () => {
    const onSaveSystemPrompts = vi.fn();
    const onResetSystemPrompts = vi
      .fn()
      .mockReturnValue(defaultSystemPromptSettings);

    render(
      <SettingsView
        settings={settings}
        systemPromptSettings={defaultSystemPromptSettings}
        onSaveSystemPrompts={onSaveSystemPrompts}
        onResetSystemPrompts={onResetSystemPrompts}
      />,
    );

    openSettingsTab("AI");
    expect(screen.getByText("System Prompts")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /quiz/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/transcript review/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/transcript translation/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/video summary/i), {
      target: { value: "Custom summary prompt" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Chat\b/i }), {
      target: { value: "Custom chat prompt" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /quiz/i }), {
      target: { value: "Custom quiz prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save prompts" }));

    await waitFor(() =>
      expect(onSaveSystemPrompts).toHaveBeenCalledWith(
        expect.objectContaining({
          videoSummary: "Custom summary prompt",
          chat: "Custom chat prompt",
          quiz: "Custom quiz prompt",
          transcriptReview: defaultSystemPromptSettings.transcriptReview,
          transcriptTranslation:
            defaultSystemPromptSettings.transcriptTranslation,
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset to preset" }));

    expect(onResetSystemPrompts).toHaveBeenCalledTimes(1);
  });
});
