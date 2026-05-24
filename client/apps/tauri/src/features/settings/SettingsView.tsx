import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { ProviderIcon } from "@/components/provider/ProviderIcon";
import { Textarea } from "@acme/ui/textarea";
import type { CompatibilityFeature } from "@/domain/compatibility";
import type { ProviderKind } from "@/domain/media-library";
import {
  defaultProviderModels,
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import type {
  SettingsSnapshot,
  StorageUsageSnapshot,
  VideoDownloadAccessAction,
} from "@/domain/settings";
import {
  formatStoragePercentage,
  formatStorageSize,
} from "@/domain/settings";
import { useI18n, type LanguageSelection } from "@/i18n";
import {
  defaultAiProviderPreferences,
  type AiProviderPreferences,
  type AiWorkflowProviderConfig,
} from "@/services/aiProviderPreferencesService";
import {
  defaultSystemPromptSettings,
  type SystemPromptSettings,
} from "@/services/systemPromptSettingsService";
import {
  appColorSeedOptions,
  type AppColorSeed,
  type AppTheme,
} from "@/services/themeSettingsService";
import {
  defaultTtsSettings,
  defaultLanguageForModel,
  qwenPresetVoices,
  supertonicPresetVoiceStyles,
  supertonicPresetVoiceStyleLabel,
  ttsEngineForModel,
  type QwenPresetVoiceId,
  type SupertonicVoiceStyleId,
  type TtsLanguageCode,
  type TtsModelId,
  type TtsSettings,
} from "@/services/ttsSettingsService";
import {
  localTtsModelCards,
  synthesisLanguagesForModel,
} from "@acme/model-card";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

type SettingsViewProps = {
  settings?: SettingsSnapshot;
  errorMessage?: string;
  onUpdateAppNow?: () => Promise<void>;
  onSetYtDlpAutoUpdate?: (enabled: boolean) => Promise<void>;
  onUpdateYtDlpNow?: () => Promise<void>;
  onVideoDownloadAccessAction?: (
    action: VideoDownloadAccessAction,
  ) => Promise<void> | void;
  onOpenOnboarding?: () => void;
  onConfigureProvider?: (provider: ProviderKind) => void;
  appTheme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
  appColorSeed?: AppColorSeed;
  onColorSeedChange?: (colorSeed: AppColorSeed) => void;
  aiProviderPreferences?: AiProviderPreferences;
  onAiProviderPreferencesChange?: (preferences: AiProviderPreferences) => void;
  ttsSettings?: TtsSettings;
  onTtsSettingsChange?: (settings: TtsSettings) => void;
  systemPromptSettings?: SystemPromptSettings;
  onSaveSystemPrompts?: (settings: SystemPromptSettings) => Promise<void> | void;
  onResetSystemPrompts?: () => Promise<SystemPromptSettings> | SystemPromptSettings | void;
  onRefreshStorage?: () => Promise<void> | void;
};

export function SettingsView({
  settings,
  errorMessage,
  onUpdateAppNow,
  onSetYtDlpAutoUpdate,
  onUpdateYtDlpNow,
  onVideoDownloadAccessAction,
  onOpenOnboarding,
  onConfigureProvider,
  appTheme = "light",
  onThemeChange,
  appColorSeed = "green",
  onColorSeedChange,
  aiProviderPreferences = defaultAiProviderPreferences,
  onAiProviderPreferencesChange,
  ttsSettings = defaultTtsSettings,
  onTtsSettingsChange,
  systemPromptSettings = defaultSystemPromptSettings,
  onSaveSystemPrompts,
  onResetSystemPrompts,
  onRefreshStorage,
}: SettingsViewProps) {
  const {
    languageSelection,
    localeOptions,
    resolvedLocale,
    setLanguageSelection,
    t,
  } = useI18n();
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [isUpdatingYtDlp, setIsUpdatingYtDlp] = useState(false);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState(false);

  if (errorMessage) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {errorMessage}
      </div>
    );
  }

  async function updateYtDlpNow() {
    if (!onUpdateYtDlpNow) return;
    setIsUpdatingYtDlp(true);
    try {
      await onUpdateYtDlpNow();
    } finally {
      setIsUpdatingYtDlp(false);
    }
  }

  async function updateAppNow() {
    if (!onUpdateAppNow) return;
    setIsUpdatingApp(true);
    try {
      await onUpdateAppNow();
    } finally {
      setIsUpdatingApp(false);
    }
  }

  async function refreshStorage() {
    if (!onRefreshStorage) return;
    setIsRefreshingStorage(true);
    try {
      await onRefreshStorage();
    } finally {
      setIsRefreshingStorage(false);
    }
  }

  function updateAiProviderPreference(
    workflow: keyof AiProviderPreferences,
    config: AiWorkflowProviderConfig,
  ) {
    onAiProviderPreferencesChange?.({
      ...aiProviderPreferences,
      [workflow]: config,
    });
  }

  function updateTtsVoice(voiceStyleId: SupertonicVoiceStyleId) {
    onTtsSettingsChange?.({
      ...ttsSettings,
      voiceStyleId,
      hasSelectedVoice: true,
    });
  }

  function updateQwenPresetVoice(qwenPresetVoiceId: QwenPresetVoiceId) {
    onTtsSettingsChange?.({
      ...ttsSettings,
      qwenPresetVoiceId,
      hasSelectedVoice: true,
    });
  }

  function updateTtsModel(modelId: TtsModelId) {
    onTtsSettingsChange?.({
      ...ttsSettings,
      engine: ttsEngineForModel(modelId),
      modelId,
      languageCode: defaultLanguageForModel(modelId),
      hasSelectedVoice: true,
    });
  }

  function updateTtsLanguage(languageCode: TtsLanguageCode) {
    onTtsSettingsChange?.({
      ...ttsSettings,
      languageCode,
      hasSelectedVoice: true,
    });
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-8">
      <Card className="2xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DescriptionList
            rows={[
              [t("i18n.currentLanguage"), localeLabel(resolvedLocale, localeOptions)],
              [t("settings.appearance.theme"), themeLabel(appTheme, t)],
              [t("settings.appearance.color"), colorSeedLabel(appColorSeed)],
            ]}
          />
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("i18n.language")}</span>
            <select
              value={languageSelection}
              onChange={(event) =>
                setLanguageSelection(event.target.value as LanguageSelection)
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {localeOptions.map((option) => (
                <option key={option.selection} value={option.selection}>
                  {option.selection === "auto"
                    ? `${option.nativeName} (${localeLabel(option.locale, localeOptions)})`
                    : option.nativeName}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{t("settings.appearance.theme")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={appTheme === "light" ? "default" : "outline"}
                onClick={() => onThemeChange?.("light")}
              >
                {t("settings.appearance.light")}
              </Button>
              <Button
                type="button"
                variant={appTheme === "dark" ? "default" : "outline"}
                onClick={() => onThemeChange?.("dark")}
              >
                {t("settings.appearance.dark")}
              </Button>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{t("settings.appearance.color")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {appColorSeedOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={appColorSeed === option.id ? "default" : "outline"}
                  className="relative justify-start overflow-hidden pl-4"
                  onClick={() => onColorSeedChange?.(option.id)}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-1 w-1.5 rounded-full"
                    style={{ backgroundColor: option.swatch }}
                  />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="2xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("settings.version.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <>
              <DescriptionList
                rows={[
                  [t("settings.version.app"), `${settings.versionInfo.appName} ${settings.versionInfo.appVersion}`],
                  [
                    t("settings.version.os"),
                    `${settings.versionInfo.osPlatform} ${settings.versionInfo.osVersion}`,
                  ],
                  [t("settings.version.arch"), settings.versionInfo.osArch],
                  [
                    t("settings.version.updater"),
                    appUpdaterStatusLabel(settings.versionInfo.updater.status, t),
                  ],
                  ...(settings.versionInfo.updater.latestVersion
                    ? ([[t("settings.version.latest"), settings.versionInfo.updater.latestVersion]] as Array<
                        [string, string]
                      >)
                    : []),
                ]}
              />
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t("settings.version.appUpdates")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {settings.versionInfo.updater.status === "available" &&
                      settings.versionInfo.updater.latestVersion
                        ? t("settings.version.availableDescription", {
                            version: settings.versionInfo.updater.latestVersion,
                          })
                        : settings.versionInfo.updater.status === "error" &&
                            settings.versionInfo.updater.errorMessage
                          ? settings.versionInfo.updater.errorMessage
                          : settings.versionInfo.updater.status === "not-checked"
                            ? t("settings.version.notCheckedDescription")
                            : t("settings.version.currentDescription")}
                    </p>
                  </div>
                  <Badge>
                    {appUpdaterStatusLabel(settings.versionInfo.updater.status, t)}
                  </Badge>
                </div>
                {settings.versionInfo.updater.canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    disabled={!onUpdateAppNow || isUpdatingApp}
                    onClick={updateAppNow}
                  >
                    {isUpdatingApp
                      ? t("settings.version.updating")
                      : t("settings.version.updateApp")}
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <SettingsSectionLoading />
          )}
        </CardContent>
      </Card>

      <StorageUsageCard
        storage={settings?.storage}
        onRefresh={onRefreshStorage ? refreshStorage : undefined}
        isRefreshing={isRefreshingStorage}
      />

      <Card className="2xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("settings.compatibility.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <>
              <DescriptionList
                rows={[
                  [
                    t("settings.compatibility.platform"),
                    settings.compatibility.platformLabel,
                  ],
                  [
                    t("settings.compatibility.target"),
                    settings.compatibility.targetTriple ??
                      settings.compatibility.targetKey,
                  ],
                  [
                    t("settings.compatibility.status"),
                    compatibilitySeverityLabel(
                      settings.compatibility.summarySeverity,
                      t,
                    ),
                  ],
                ]}
              />
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-muted-foreground">
                    {settings.compatibility.summaryMessage}
                  </p>
                  <SeverityBadge severity={settings.compatibility.summarySeverity} />
                </div>
              </div>
              <div className="space-y-2">
                {settings.compatibility.features
                  .filter(
                    (feature) =>
                      feature.id !== "target" ||
                      feature.severity !== "supported",
                  )
                  .filter(
                    (feature) =>
                      !String(feature.id).startsWith("stt-model:"),
                  )
                  .map((feature) => (
                    <CompatibilityFeatureRow key={feature.id} feature={feature} />
                  ))}
              </div>
            </>
          ) : (
            <SettingsSectionLoading />
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 2xl:col-span-4">
        <CardHeader>
          <CardTitle>{t("settings.video.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <>
              <DescriptionList
                rows={[
                  [t("settings.video.youtubeApiKey"), t("settings.video.notRequired")],
                  [t("settings.video.downloader"), settings.videoDownload.downloader],
                  [t("settings.video.status"), settings.videoDownload.downloaderStatus],
                  [
                    "yt-dlp",
                    settings.videoDownload.ytdlpUpdate.version ?? t("settings.video.unknown"),
                  ],
                  [
                    t("settings.video.age"),
                    settings.videoDownload.ytdlpUpdate.ageDays === undefined
                      ? t("settings.video.unknown")
                      : t("settings.video.days", {
                          count: settings.videoDownload.ytdlpUpdate.ageDays,
                        }),
                  ],
                  [t("settings.video.protocol"), String(settings.videoDownload.protocolVersion ?? t("settings.video.unknown"))],
                ]}
              />
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t("settings.video.ytdlpUpdates")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("settings.video.staleAfter", {
                        days: settings.videoDownload.ytdlpUpdate.staleAfterDays,
                        source: settings.videoDownload.ytdlpUpdate.source,
                      })}
                    </p>
                  </div>
                  <Badge>
                    {settings.videoDownload.ytdlpUpdate.isStale
                      ? t("settings.video.stale")
                      : t("settings.video.current")}
                  </Badge>
                </div>
                {settings.videoDownload.ytdlpUpdate.lastUpdateError ? (
                  <p className="mt-2 text-xs text-destructive">
                    {settings.videoDownload.ytdlpUpdate.lastUpdateError}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.videoDownload.ytdlpUpdate.autoUpdateEnabled}
                      disabled={!onSetYtDlpAutoUpdate || isUpdatingYtDlp}
                      onChange={(event) =>
                        onSetYtDlpAutoUpdate?.(event.currentTarget.checked)
                      }
                    />
                    {t("settings.video.autoUpdate")}
                  </label>
                  {!settings.videoDownload.ytdlpUpdate.autoUpdateEnabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!onUpdateYtDlpNow || isUpdatingYtDlp}
                      onClick={updateYtDlpNow}
                    >
                      {isUpdatingYtDlp ? t("settings.video.updating") : t("settings.video.updateYtdlp")}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {settings.videoDownload.mediaTools.map((tool) => (
                  <Badge key={tool.tool}>
                    {tool.tool}: {tool.status}
                  </Badge>
                ))}
              </div>
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t("settings.video.accessTitle")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("settings.video.accessDescription")}
                    </p>
                  </div>
                  <Badge>
                    {settings.videoDownload.access.cookiesEnabled ||
                    settings.videoDownload.access.cookiesFileConfigured ||
                    settings.videoDownload.access.poTokenConfigured ||
                    settings.videoDownload.access.extractorArgsConfigured
                      ? t("settings.video.configured")
                      : t("settings.video.notConfigured")}
                  </Badge>
                </div>
                <DescriptionList
                  className="mt-3"
                  rows={[
                    [
                      t("settings.video.cookieSource"),
                      videoCookieSourceLabel(
                        settings.videoDownload.access.cookieSource,
                        t,
                      ),
                    ],
                    [
                      t("settings.video.browser"),
                      settings.videoDownload.access.browserProfile
                        ? `${settings.videoDownload.access.browser ?? t("settings.video.unknown")} (${settings.videoDownload.access.browserProfile})`
                        : settings.videoDownload.access.browser ??
                          t("settings.video.notConfigured"),
                    ],
                    [
                      t("settings.video.cookiesFile"),
                      settings.videoDownload.access.cookiesFileConfigured
                        ? settings.videoDownload.access.cookiesFilePath ??
                          t("settings.video.configured")
                        : t("settings.video.notConfigured"),
                    ],
                    [
                      t("settings.video.poToken"),
                      settings.videoDownload.access.poTokenConfigured
                        ? t("settings.video.configured")
                        : t("settings.video.notConfigured"),
                    ],
                    [
                      t("settings.video.extractorArgs"),
                      settings.videoDownload.access.extractorArgsConfigured
                        ? t("settings.video.configured")
                        : t("settings.video.notConfigured"),
                    ],
                  ]}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onVideoDownloadAccessAction?.("use-browser-cookies")
                    }
                  >
                    {t("settings.video.useBrowserCookies")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onVideoDownloadAccessAction?.("choose-cookies-file")
                    }
                  >
                    {t("settings.video.chooseCookiesFile")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onVideoDownloadAccessAction?.("configure-po-token")
                    }
                  >
                    {t("settings.video.configurePoToken")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onVideoDownloadAccessAction?.("configure-extractor-args")
                    }
                  >
                    {t("settings.video.configureExtractorArgs")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <SettingsSectionLoading />
          )}
        </CardContent>
      </Card>

      <Card className="2xl:col-span-4">
        <CardHeader>
          <CardTitle>{t("settings.stt.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <>
              <DescriptionList
                rows={[
                  [t("settings.stt.storage"), settings.stt.storage],
                  [
                    t("settings.stt.downloadGate"),
                    settings.stt.downloadRequiresUserConfirmation
                      ? t("settings.stt.requiresConfirmation")
                      : t("settings.stt.automatic"),
                  ],
                ]}
              />
              <ModelGrid>
                {settings.stt.models
                  .filter((model) => model.recommended)
                  .map((model) => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      compatibility={settings.compatibility.features.find(
                        (feature) => feature.id === `stt-model:${model.id}`,
                      )}
                    />
                  ))}
              </ModelGrid>
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("settings.stt.advancedModels")}
                </summary>
                <ModelGrid className="mt-2">
                  {settings.stt.models
                    .filter((model) => !model.recommended)
                    .map((model) => (
                      <ModelRow
                        key={model.id}
                        model={model}
                        compatibility={settings.compatibility.features.find(
                          (feature) => feature.id === `stt-model:${model.id}`,
                        )}
                      />
                    ))}
                </ModelGrid>
              </details>
            </>
          ) : (
            <SettingsSectionLoading />
          )}
        </CardContent>
      </Card>

      <Card className="2xl:col-span-4">
        <CardHeader>
          <CardTitle>{t("settings.tts.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DescriptionList
            rows={[
              [t("settings.tts.engine"), ttsEngineLabel(ttsSettings.engine)],
              [t("settings.tts.model"), ttsModelLabel(ttsSettings.modelId)],
              [
                t("settings.tts.language"),
                ttsLanguageLabel(ttsSettings.modelId, ttsSettings.languageCode),
              ],
              [
                t("settings.tts.defaultVoice"),
                ttsVoiceLabel(ttsSettings),
              ],
            ]}
          />
          <label className="grid gap-1 text-sm" htmlFor="settings-tts-model">
            <span className="font-medium">{t("settings.tts.model")}</span>
            <select
              id="settings-tts-model"
              aria-label={t("settings.tts.model")}
              value={ttsSettings.modelId}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                updateTtsModel(event.target.value as TtsModelId)
              }
            >
              {localTtsModelCards.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="settings-tts-voice">
            <span className="font-medium">{t("settings.tts.voice")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.tts.voiceDescription")}
            </span>
            <select
              id="settings-tts-voice"
              aria-label={t("settings.tts.voice")}
              value={
                ttsSettings.engine === "qwen"
                  ? ttsSettings.qwenPresetVoiceId
                  : ttsSettings.voiceStyleId
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                if (ttsSettings.engine === "qwen") {
                  updateQwenPresetVoice(event.target.value as QwenPresetVoiceId);
                } else {
                  updateTtsVoice(event.target.value as SupertonicVoiceStyleId);
                }
              }}
            >
              {ttsSettings.engine === "qwen"
                ? qwenPresetVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))
                : supertonicPresetVoiceStyles.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {supertonicPresetVoiceStyleLabel(voice.id)}
                    </option>
                  ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="settings-tts-language">
            <span className="font-medium">{t("settings.tts.language")}</span>
            <select
              id="settings-tts-language"
              aria-label={t("settings.tts.language")}
              value={ttsSettings.languageCode}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                updateTtsLanguage(event.target.value as TtsLanguageCode)
              }
            >
              {synthesisLanguagesForModel(ttsSettings.modelId).map((language) => (
                <option key={language.code} value={language.code}>
                  {ttsLanguageLabel(ttsSettings.modelId, language.code)}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card className="2xl:col-span-4">
        <CardHeader>
          <CardTitle>{t("settings.providers.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <>
              <DescriptionList
                rows={[
                  [t("settings.providers.default"), settings.llm.defaultProvider],
                  [t("settings.providers.auth"), t("settings.providers.authValue")],
                ]}
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <ProviderPreferenceCard
                  id="summary-provider-preference"
                  title={t("settings.providers.summaryProvider")}
                  config={aiProviderPreferences.summary}
                  streamingLabel={t("workbench.summary.streaming")}
                  streamingModeLabel={t("workbench.summary.streamingMode")}
                  streamingOnLabel={t("workbench.summary.streamingOn")}
                  streamingOffLabel={t("workbench.summary.streamingOff")}
                  streamingDescription={t("workbench.summary.streamingDescription")}
                  onChange={(config) =>
                    updateAiProviderPreference("summary", config)
                  }
                />
                <ProviderPreferenceCard
                  id="chat-provider-preference"
                  title={t("settings.providers.chatProvider")}
                  config={aiProviderPreferences.chat}
                  streamingLabel={t("workbench.chat.streaming")}
                  streamingModeLabel={t("workbench.chat.streamingMode")}
                  streamingOnLabel={t("workbench.chat.streamingOn")}
                  streamingOffLabel={t("workbench.chat.streamingOff")}
                  streamingDescription={t("workbench.chat.streamingDescription")}
                  onChange={(config) => updateAiProviderPreference("chat", config)}
                />
              </div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
                {settings.llm.accounts.map((account) => (
                  <div
                    key={account.provider}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <ProviderIcon
                          provider={account.provider}
                          size={18}
                          decorative
                        />
                        <span className="truncate">{account.label}</span>
                      </span>
                      <Badge>
                        {account.configured
                          ? t("settings.providers.configured")
                          : t("settings.providers.notConfigured")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {settings.llm.defaultModels[account.provider]} ·{" "}
                      {account.authModes.includes("oauth-subscription")
                        ? `${t("settings.providers.openAiAuth")} · ${t("settings.providers.oauthPlanned")}`
                        : t("settings.providers.apiKeyOnly")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => onConfigureProvider?.(account.provider)}
                    >
                      {t("settings.providers.configure")}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <SettingsSectionLoading />
          )}
        </CardContent>
      </Card>

      <SystemPromptsSection
        systemPromptSettings={systemPromptSettings}
        onSaveSystemPrompts={onSaveSystemPrompts}
        onResetSystemPrompts={onResetSystemPrompts}
      />

      {onOpenOnboarding ? (
        <Card className="col-span-full">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.onboarding.title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.onboarding.description")}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onOpenOnboarding}>
              {t("settings.onboarding.action")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ttsEngineLabel(engine: TtsSettings["engine"]) {
  return engine === "qwen" ? "Qwen3-TTS" : "Supertonic";
}

function ttsModelLabel(modelId: TtsModelId) {
  return (
    localTtsModelCards.find((candidate) => candidate.id === modelId)?.name ??
    modelId
  );
}

function ttsVoiceLabel(settings: TtsSettings) {
  if (settings.engine === "qwen") {
    return (
      qwenPresetVoices.find(
        (candidate) => candidate.id === settings.qwenPresetVoiceId,
      )?.label ?? settings.qwenPresetVoiceId
    );
  }
  return supertonicPresetVoiceStyleLabel(settings.voiceStyleId);
}

function ttsLanguageLabel(modelId: TtsModelId, languageCode: string) {
  const language = synthesisLanguagesForModel(modelId).find(
    (candidate) => candidate.code === languageCode,
  );
  return language ? `${language.label} (${language.code})` : languageCode;
}

function SystemPromptsSection({
  systemPromptSettings,
  onSaveSystemPrompts,
  onResetSystemPrompts,
}: {
  systemPromptSettings: SystemPromptSettings;
  onSaveSystemPrompts?: (settings: SystemPromptSettings) => Promise<void> | void;
  onResetSystemPrompts?: () => Promise<SystemPromptSettings> | SystemPromptSettings | void;
}) {
  const { t } = useI18n();
  const [isSavingSystemPrompts, setIsSavingSystemPrompts] = useState(false);
  const [promptDraft, setPromptDraft] = useState(systemPromptSettings);

  useEffect(() => {
    setPromptDraft(systemPromptSettings);
  }, [systemPromptSettings]);

  const promptDirty = useMemo(
    () =>
      promptDraft.videoSummary !== systemPromptSettings.videoSummary ||
      promptDraft.chat !== systemPromptSettings.chat ||
      promptDraft.transcriptReview !== systemPromptSettings.transcriptReview ||
      promptDraft.transcriptTranslation !==
        systemPromptSettings.transcriptTranslation,
    [promptDraft, systemPromptSettings],
  );

  async function saveSystemPrompts() {
    if (!onSaveSystemPrompts) return;
    setIsSavingSystemPrompts(true);
    try {
      await onSaveSystemPrompts(promptDraft);
    } finally {
      setIsSavingSystemPrompts(false);
    }
  }

  async function resetSystemPrompts() {
    const presetPrompts = defaultSystemPromptSettings;
    setPromptDraft(presetPrompts);
    if (!onResetSystemPrompts) return;
    setIsSavingSystemPrompts(true);
    try {
      const resetPrompts = await onResetSystemPrompts();
      setPromptDraft(resetPrompts ?? presetPrompts);
    } finally {
      setIsSavingSystemPrompts(false);
    }
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>{t("settings.prompts.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("settings.prompts.description")}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <SystemPromptEditor
            id="video-summary-system-prompt"
            label={t("settings.prompts.videoSummary")}
            description={t("settings.prompts.videoSummaryDescription")}
            value={promptDraft.videoSummary}
            onChange={(videoSummary) =>
              setPromptDraft((current) => ({ ...current, videoSummary }))
            }
          />
          <SystemPromptEditor
            id="chat-system-prompt"
            label={t("settings.prompts.chat")}
            description={t("settings.prompts.chatDescription")}
            value={promptDraft.chat}
            onChange={(chat) =>
              setPromptDraft((current) => ({ ...current, chat }))
            }
          />
          <SystemPromptEditor
            id="transcript-review-system-prompt"
            label={t("settings.prompts.transcriptReview")}
            description={t("settings.prompts.transcriptReviewDescription")}
            value={promptDraft.transcriptReview}
            onChange={(transcriptReview) =>
              setPromptDraft((current) => ({ ...current, transcriptReview }))
            }
          />
          <SystemPromptEditor
            id="transcript-translation-system-prompt"
            label={t("settings.prompts.transcriptTranslation")}
            description={t("settings.prompts.transcriptTranslationDescription")}
            value={promptDraft.transcriptTranslation}
            onChange={(transcriptTranslation) =>
              setPromptDraft((current) => ({
                ...current,
                transcriptTranslation,
              }))
            }
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSavingSystemPrompts}
            onClick={resetSystemPrompts}
          >
            {t("settings.prompts.reset")}
          </Button>
          <Button
            type="button"
            disabled={
              !onSaveSystemPrompts ||
              !promptDirty ||
              isSavingSystemPrompts ||
              !promptDraft.videoSummary.trim() ||
              !promptDraft.chat.trim() ||
              !promptDraft.transcriptReview.trim() ||
              !promptDraft.transcriptTranslation.trim()
            }
            onClick={saveSystemPrompts}
          >
            {isSavingSystemPrompts
              ? t("settings.prompts.saving")
              : t("settings.prompts.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemPromptEditor({
  id,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label htmlFor={id} className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-80 font-mono text-xs leading-5"
      />
    </label>
  );
}

function ModelGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))] ${className}`}
    >
      {children}
    </div>
  );
}

function SettingsSectionLoading() {
  const { t } = useI18n();

  return (
    <div className="space-y-3" aria-busy="true">
      <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded-full bg-muted" />
        <div className="h-3 w-1/2 rounded-full bg-muted" />
        <div className="h-3 w-2/3 rounded-full bg-muted" />
      </div>
    </div>
  );
}

function StorageUsageCard({
  storage,
  onRefresh,
  isRefreshing = false,
}: {
  storage?: StorageUsageSnapshot;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { t } = useI18n();
  const colors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
  ];
  const hasError = Boolean(storage?.errorMessage);
  const totalLabel = formatStorageSize(storage?.totalBytes ?? 0);

  return (
    <Card className="2xl:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("settings.storage.title")}</CardTitle>
          {onRefresh ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={
                hasError
                  ? t("settings.storage.retry")
                  : t("settings.storage.refresh")
              }
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {hasError
                ? t("settings.storage.retry")
                : t("settings.storage.refresh")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {storage ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {t("settings.storage.description")}
              </p>
              <p className="text-sm font-medium">
                {t("settings.storage.total", { total: totalLabel })}
              </p>
            </div>
            {hasError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p className="font-medium">
                  {t("settings.storage.unavailable")}
                </p>
                <p className="mt-1 break-words text-xs">
                  {storage.errorMessage}
                </p>
              </div>
            ) : null}
            <div
              className="flex h-3 overflow-hidden rounded-full bg-muted"
              aria-label={t("settings.storage.barLabel", { total: totalLabel })}
            >
              {storage.items.map((item, index) => (
                <span
                  key={item.category}
                  className={colors[index % colors.length]}
                  style={{ width: `${Math.max(0, item.percentage)}%` }}
                  title={`${item.label}: ${formatStorageSize(item.sizeBytes)} (${formatStoragePercentage(item.percentage)})`}
                >
                  <span className="sr-only">
                    {item.label}: {formatStorageSize(item.sizeBytes)},{" "}
                    {formatStoragePercentage(item.percentage)}
                  </span>
                </span>
              ))}
            </div>
            <div className="space-y-2">
              {storage.items.map((item, index) => (
                <div
                  key={item.category}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`size-2.5 rounded-full ${colors[index % colors.length]}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="font-medium">
                    {formatStorageSize(item.sizeBytes)}
                  </span>
                  <span className="w-10 text-right text-muted-foreground">
                    {formatStoragePercentage(item.percentage)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <SettingsSectionLoading />
        )}
      </CardContent>
    </Card>
  );
}

function ProviderPreferenceCard({
  id,
  title,
  config,
  streamingLabel,
  streamingModeLabel,
  streamingOnLabel,
  streamingOffLabel,
  streamingDescription,
  onChange,
}: {
  id: string;
  title: string;
  config: AiWorkflowProviderConfig;
  streamingLabel: string;
  streamingModeLabel: string;
  streamingOnLabel: string;
  streamingOffLabel: string;
  streamingDescription: string;
  onChange(config: AiWorkflowProviderConfig): void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ProviderIcon provider={config.provider} size={18} decorative />
        <span>{title}</span>
      </div>
      <label className="grid gap-1" htmlFor={`${id}-provider`}>
        <span className="text-xs font-medium text-muted-foreground">
          {t("setup.provider.provider")}
        </span>
        <select
          id={`${id}-provider`}
          aria-label={`${title} ${t("setup.provider.provider")}`}
          value={config.provider}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) => {
            const provider = event.target.value as ProviderKind;
            onChange({
              provider,
              model: defaultProviderModels[provider],
              streamingMode: config.streamingMode,
            });
          }}
        >
          {providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {providerLabels[provider]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1" htmlFor={`${id}-model`}>
        <span className="text-xs font-medium text-muted-foreground">
          {t("setup.provider.model")}
        </span>
        <select
          id={`${id}-model`}
          aria-label={`${title} ${t("setup.provider.model")}`}
          value={config.model}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...config,
              model: event.target.value,
            })
          }
        >
          {providerModelOptions[config.provider].map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {streamingLabel}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={config.streamingMode}
          aria-label={`${title} ${streamingModeLabel}`}
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
            config.streamingMode
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
          onClick={() =>
            onChange({
              ...config,
              streamingMode: !config.streamingMode,
            })
          }
        >
          <span>{streamingModeLabel}</span>
          <span className="text-xs">
            {config.streamingMode ? streamingOnLabel : streamingOffLabel}
          </span>
        </button>
        <p className="text-xs text-muted-foreground">{streamingDescription}</p>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  compatibility,
}: {
  model: SettingsSnapshot["stt"]["models"][number];
  compatibility?: CompatibilityFeature;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-md border border-border px-3 py-2 text-sm">
      <p className="break-words font-medium">{model.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {compatibility && compatibility.severity !== "supported" ? (
          <SeverityBadge severity={compatibility.severity} />
        ) : null}
        <Badge>
          {model.downloaded
            ? t("settings.stt.downloaded")
            : t("settings.stt.notDownloaded")}
        </Badge>
      </div>
      <p className="mt-1 break-words text-xs text-muted-foreground">
        {model.engine} · {model.fileName} · {model.sizeMb} MB
      </p>
      {compatibility && compatibility.severity !== "supported" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {compatibility.message}
        </p>
      ) : null}
    </div>
  );
}

function CompatibilityFeatureRow({
  feature,
}: {
  feature: CompatibilityFeature;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{feature.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{feature.message}</p>
        </div>
        <SeverityBadge severity={feature.severity} />
      </div>
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: SettingsSnapshot["compatibility"]["summarySeverity"];
}) {
  const { t } = useI18n();
  const className =
    severity === "blocked"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : severity === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : "";

  return (
    <Badge variant="outline" className={className}>
      {compatibilitySeverityLabel(severity, t)}
    </Badge>
  );
}

function localeLabel(
  locale: string,
  options: Array<{ selection: string; locale: string; nativeName: string }>,
) {
  return options.find((option) => option.selection === locale)?.nativeName ?? locale;
}

function themeLabel(theme: AppTheme, t: ReturnType<typeof useI18n>["t"]) {
  return theme === "dark"
    ? t("settings.appearance.dark")
    : t("settings.appearance.light");
}

function colorSeedLabel(colorSeed: AppColorSeed) {
  return (
    appColorSeedOptions.find((option) => option.id === colorSeed)?.label ??
    appColorSeedOptions[0].label
  );
}

function appUpdaterStatusLabel(
  status: SettingsSnapshot["versionInfo"]["updater"]["status"],
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (status) {
    case "available":
      return t("settings.version.updateAvailable");
    case "current":
      return t("settings.version.upToDate");
    case "not-checked":
      return t("settings.version.notChecked");
    case "error":
      return t("settings.version.updateError");
    case "unavailable":
      return t("settings.version.updateUnavailable");
  }
}

function videoCookieSourceLabel(
  source: SettingsSnapshot["videoDownload"]["access"]["cookieSource"],
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (source) {
    case "browser":
      return t("settings.video.cookieSourceBrowser");
    case "cookies-file":
      return t("settings.video.cookieSourceFile");
    case "none":
      return t("settings.video.cookieSourceNone");
  }
}

function compatibilitySeverityLabel(
  severity: SettingsSnapshot["compatibility"]["summarySeverity"],
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (severity) {
    case "supported":
      return t("settings.compatibility.supported");
    case "warning":
      return t("settings.compatibility.warning");
    case "blocked":
      return t("settings.compatibility.blocked");
  }
}

function DescriptionList({
  rows,
  className = "",
}: {
  rows: Array<[string, string]>;
  className?: string;
}) {
  return (
    <dl className={`space-y-2 text-sm ${className}`}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
