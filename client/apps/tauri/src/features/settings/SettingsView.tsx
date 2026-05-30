import type { CompatibilityFeature } from "@/domain/compatibility";
import type { ProviderKind } from "@/domain/media-library";
import type {
  SettingsSnapshot,
  StorageUsageSnapshot,
  VideoDownloadAccessAction,
} from "@/domain/settings";
import type { LanguageSelection, TranslationKey } from "@/i18n";
import type {
  AiProviderPreferences,
  AiWorkflowProviderConfig,
} from "@/services/aiProviderPreferencesService";
import type { SystemPromptSettings } from "@/services/systemPromptSettingsService";
import type { AppColorSeed, AppTheme } from "@/services/themeSettingsService";
import type {
  QwenPresetVoiceId,
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
  TtsSettings,
} from "@/services/ttsSettingsService";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  faqShortcutDefinitions,
  resolveShortcutKeys,
} from "@/app/navigationShortcuts";
import { ShortcutKbd } from "@/components/keyboard/ShortcutKbd";
import { ProviderIcon } from "@/components/provider/ProviderIcon";
import {
  defaultProviderModels,
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import {
  formatModelSize,
  formatStoragePercentage,
  formatStorageSize,
} from "@/domain/settings";
import { useI18n } from "@/i18n";
import { defaultAiProviderPreferences } from "@/services/aiProviderPreferencesService";
import { defaultSystemPromptSettings } from "@/services/systemPromptSettingsService";
import { appColorSeedOptions } from "@/services/themeSettingsService";
import {
  defaultLanguageForModel,
  defaultTtsSettings,
  qwenPresetVoices,
  supertonicPresetVoiceStyleLabel,
  supertonicPresetVoiceStyles,
  ttsEngineForModel,
} from "@/services/ttsSettingsService";
import {
  BookOpen,
  Bot,
  Download,
  GraduationCap,
  Keyboard,
  MonitorCog,
  Palette,
  PlayCircle,
  RefreshCw,
  Settings2,
} from "lucide-react";

import type { TranscriptionLanguageCode } from "@acme/model-card";
import {
  isLocalSttModelVisible,
  isLocalTtsModelPlatformSupported,
  isLocalTtsModelVisible,
  localTtsModelCards,
  synthesisLanguagesForModel,
} from "@acme/model-card";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import { cn } from "@acme/ui";

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
  onOpenTutorial?: () => void;
  onOpenFaq?: () => void;
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
  onSaveSystemPrompts?: (
    settings: SystemPromptSettings,
  ) => Promise<void> | void;
  onResetSystemPrompts?: () =>
    | Promise<SystemPromptSettings>
    | SystemPromptSettings
    | void;
  onRefreshStorage?: () => Promise<void> | void;
};

type SettingsTabId =
  | "appearance"
  | "system"
  | "video"
  | "speech"
  | "ai"
  | "shortcuts"
  | "help";

const settingsTabs = [
  {
    id: "appearance",
    title: "settings.appearance.title",
    description: "settings.tabs.appearanceDescription",
    icon: Palette,
  },
  {
    id: "system",
    title: "settings.tabs.system",
    description: "settings.tabs.systemDescription",
    icon: MonitorCog,
  },
  {
    id: "video",
    title: "settings.video.title",
    description: "settings.tabs.videoDescription",
    icon: Download,
  },
  {
    id: "speech",
    title: "settings.tabs.speech",
    description: "settings.tabs.speechDescription",
    icon: Settings2,
  },
  {
    id: "ai",
    title: "settings.tabs.ai",
    description: "settings.tabs.aiDescription",
    icon: Bot,
  },
  {
    id: "shortcuts",
    title: "nav.shortcuts",
    description: "nav.shortcuts.description",
    icon: Keyboard,
  },
  {
    id: "help",
    title: "help.menu",
    description: "settings.tabs.helpDescription",
    icon: BookOpen,
  },
] satisfies Array<{
  id: SettingsTabId;
  title: TranslationKey;
  description: TranslationKey;
  icon: typeof Palette;
}>;

export function SettingsView({
  settings,
  errorMessage,
  onUpdateAppNow,
  onSetYtDlpAutoUpdate,
  onUpdateYtDlpNow,
  onVideoDownloadAccessAction,
  onOpenOnboarding,
  onOpenTutorial,
  onOpenFaq,
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
  const [activeTab, setActiveTab] = useState<SettingsTabId>("appearance");

  if (errorMessage) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-4 text-sm">
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

  const localModelPlatform = settings?.versionInfo.osPlatform ?? "macos";
  const speechLanguageCode =
    ttsSettings.languageCode as TranscriptionLanguageCode;
  const recommendedSttModels = useMemo(
    () =>
      settings?.stt.models.filter(
        (model) =>
          model.recommended &&
          isLocalSttModelVisible({
            modelId: model.id,
            languageCode: speechLanguageCode,
            platform: localModelPlatform,
          }),
      ) ?? [],
    [localModelPlatform, settings?.stt.models, speechLanguageCode],
  );
  const advancedSttModels = useMemo(
    () =>
      settings?.stt.models.filter(
        (model) =>
          !model.recommended &&
          isLocalSttModelVisible({
            modelId: model.id,
            languageCode: speechLanguageCode,
            platform: localModelPlatform,
          }),
      ) ?? [],
    [localModelPlatform, settings?.stt.models, speechLanguageCode],
  );
  const visibleTtsModelCards = useMemo(() => {
    const cards = localTtsModelCards.filter((model) =>
      isLocalTtsModelVisible({
        modelId: model.id,
        languageCode: ttsSettings.languageCode,
        platform: localModelPlatform,
      }),
    );
    return cards.length > 0
      ? cards
      : localTtsModelCards.filter((model) =>
          isLocalTtsModelPlatformSupported({
            modelId: model.id,
            platform: localModelPlatform,
          }),
        );
  }, [localModelPlatform, ttsSettings.languageCode]);

  return (
    <div className="grid w-full gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SettingsSubmenu activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="min-w-0">
        {activeTab === "appearance" ? (
          <SettingsPanel tabId="appearance">
            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-8">
              <Card className="2xl:col-span-2">
                <CardHeader>
                  <CardTitle>{t("settings.appearance.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DescriptionList
                    rows={[
                      [
                        t("i18n.currentLanguage"),
                        localeLabel(resolvedLocale, localeOptions),
                      ],
                      [t("settings.appearance.theme"), themeLabel(appTheme, t)],
                      [
                        t("settings.appearance.color"),
                        colorSeedLabel(appColorSeed),
                      ],
                    ]}
                  />
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{t("i18n.language")}</span>
                    <select
                      value={languageSelection}
                      onChange={(event) =>
                        setLanguageSelection(
                          event.target.value as LanguageSelection,
                        )
                      }
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
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
                    <p className="font-medium">
                      {t("settings.appearance.theme")}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
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
                      <Button
                        type="button"
                        variant={appTheme === "auto" ? "default" : "outline"}
                        onClick={() => onThemeChange?.("auto")}
                      >
                        {t("settings.appearance.system")}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">
                      {t("settings.appearance.color")}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {appColorSeedOptions.map((option) => (
                        <Button
                          key={option.id}
                          type="button"
                          variant={
                            appColorSeed === option.id ? "default" : "outline"
                          }
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
            </div>
          </SettingsPanel>
        ) : null}

        {activeTab === "system" ? (
          <SettingsPanel tabId="system">
            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-8">
              <Card className="2xl:col-span-2">
                <CardHeader>
                  <CardTitle>{t("settings.version.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settings ? (
                    <>
                      <DescriptionList
                        rows={[
                          [
                            t("settings.version.app"),
                            `${settings.versionInfo.appName} ${settings.versionInfo.appVersion}`,
                          ],
                          [
                            t("settings.version.os"),
                            `${settings.versionInfo.osPlatform} ${settings.versionInfo.osVersion}`,
                          ],
                          [
                            t("settings.version.arch"),
                            settings.versionInfo.osArch,
                          ],
                          [
                            t("settings.version.updater"),
                            appUpdaterStatusLabel(
                              settings.versionInfo.updater.status,
                              t,
                            ),
                          ],
                          ...(settings.versionInfo.updater.latestVersion
                            ? ([
                                [
                                  t("settings.version.latest"),
                                  settings.versionInfo.updater.latestVersion,
                                ],
                              ] as Array<[string, string]>)
                            : []),
                        ]}
                      />
                      <div className="border-border rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {t("settings.version.appUpdates")}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {settings.versionInfo.updater.status ===
                                "available" &&
                              settings.versionInfo.updater.latestVersion
                                ? t("settings.version.availableDescription", {
                                    version:
                                      settings.versionInfo.updater
                                        .latestVersion,
                                  })
                                : settings.versionInfo.updater.status ===
                                      "error" &&
                                    settings.versionInfo.updater.errorMessage
                                  ? settings.versionInfo.updater.errorMessage
                                  : settings.versionInfo.updater.status ===
                                      "not-checked"
                                    ? t(
                                        "settings.version.notCheckedDescription",
                                      )
                                    : t("settings.version.currentDescription")}
                            </p>
                          </div>
                          <Badge>
                            {appUpdaterStatusLabel(
                              settings.versionInfo.updater.status,
                              t,
                            )}
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
                      <div className="border-border rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-muted-foreground">
                            {settings.compatibility.summaryMessage}
                          </p>
                          <SeverityBadge
                            severity={settings.compatibility.summarySeverity}
                          />
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
                            <CompatibilityFeatureRow
                              key={feature.id}
                              feature={feature}
                            />
                          ))}
                      </div>
                    </>
                  ) : (
                    <SettingsSectionLoading />
                  )}
                </CardContent>
              </Card>
            </div>
          </SettingsPanel>
        ) : null}

        {activeTab === "video" ? (
          <SettingsPanel tabId="video">
            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-8">
              <Card className="lg:col-span-2 2xl:col-span-4">
                <CardHeader>
                  <CardTitle>{t("settings.video.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settings ? (
                    <>
                      <DescriptionList
                        rows={[
                          [
                            t("settings.video.youtubeApiKey"),
                            t("settings.video.notRequired"),
                          ],
                          [
                            t("settings.video.downloader"),
                            settings.videoDownload.downloader,
                          ],
                          [
                            t("settings.video.status"),
                            settings.videoDownload.downloaderStatus,
                          ],
                          [
                            "yt-dlp",
                            settings.videoDownload.ytdlpUpdate.version ??
                              t("settings.video.unknown"),
                          ],
                          [
                            t("settings.video.age"),
                            settings.videoDownload.ytdlpUpdate.ageDays ===
                            undefined
                              ? t("settings.video.unknown")
                              : t("settings.video.days", {
                                  count:
                                    settings.videoDownload.ytdlpUpdate.ageDays,
                                }),
                          ],
                          [
                            t("settings.video.protocol"),
                            String(
                              settings.videoDownload.protocolVersion ??
                                t("settings.video.unknown"),
                            ),
                          ],
                        ]}
                      />
                      <div className="border-border rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {t("settings.video.ytdlpUpdates")}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {t("settings.video.staleAfter", {
                                days: settings.videoDownload.ytdlpUpdate
                                  .staleAfterDays,
                                source:
                                  settings.videoDownload.ytdlpUpdate.source,
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
                          <p className="text-destructive mt-2 text-xs">
                            {settings.videoDownload.ytdlpUpdate.lastUpdateError}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={
                                settings.videoDownload.ytdlpUpdate
                                  .autoUpdateEnabled
                              }
                              disabled={
                                !onSetYtDlpAutoUpdate || isUpdatingYtDlp
                              }
                              onChange={(event) =>
                                onSetYtDlpAutoUpdate?.(
                                  event.currentTarget.checked,
                                )
                              }
                            />
                            {t("settings.video.autoUpdate")}
                          </label>
                          {!settings.videoDownload.ytdlpUpdate
                            .autoUpdateEnabled ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!onUpdateYtDlpNow || isUpdatingYtDlp}
                              onClick={updateYtDlpNow}
                            >
                              {isUpdatingYtDlp
                                ? t("settings.video.updating")
                                : t("settings.video.updateYtdlp")}
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
                      <div className="border-border rounded-md border px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {t("settings.video.accessTitle")}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {t("settings.video.accessDescription")}
                            </p>
                          </div>
                          <Badge>
                            {settings.videoDownload.access.cookiesEnabled ||
                            settings.videoDownload.access
                              .cookiesFileConfigured ||
                            settings.videoDownload.access.poTokenConfigured ||
                            settings.videoDownload.access
                              .extractorArgsConfigured
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
                                : (settings.videoDownload.access.browser ??
                                  t("settings.video.notConfigured")),
                            ],
                            [
                              t("settings.video.cookiesFile"),
                              settings.videoDownload.access
                                .cookiesFileConfigured
                                ? (settings.videoDownload.access
                                    .cookiesFilePath ??
                                  t("settings.video.configured"))
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
                              settings.videoDownload.access
                                .extractorArgsConfigured
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
                              onVideoDownloadAccessAction?.(
                                "use-browser-cookies",
                              )
                            }
                          >
                            {t("settings.video.useBrowserCookies")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onVideoDownloadAccessAction?.(
                                "choose-cookies-file",
                              )
                            }
                          >
                            {t("settings.video.chooseCookiesFile")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onVideoDownloadAccessAction?.(
                                "configure-po-token",
                              )
                            }
                          >
                            {t("settings.video.configurePoToken")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onVideoDownloadAccessAction?.(
                                "configure-extractor-args",
                              )
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
            </div>
          </SettingsPanel>
        ) : null}

        {activeTab === "speech" ? (
          <SettingsPanel tabId="speech">
            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-8">
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
                        {recommendedSttModels.map((model) => (
                          <ModelRow
                            key={model.id}
                            model={model}
                            compatibility={settings.compatibility.features.find(
                              (feature) =>
                                feature.id === `stt-model:${model.id}`,
                            )}
                          />
                        ))}
                      </ModelGrid>
                      <details className="space-y-2">
                        <summary className="cursor-pointer text-sm font-medium">
                          {t("settings.stt.advancedModels")}
                        </summary>
                        <ModelGrid className="mt-2">
                          {advancedSttModels.map((model) => (
                            <ModelRow
                              key={model.id}
                              model={model}
                              compatibility={settings.compatibility.features.find(
                                (feature) =>
                                  feature.id === `stt-model:${model.id}`,
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
                      [
                        t("settings.tts.engine"),
                        ttsEngineLabel(ttsSettings.engine),
                      ],
                      [
                        t("settings.tts.model"),
                        ttsModelLabel(ttsSettings.modelId),
                      ],
                      [
                        t("settings.tts.language"),
                        ttsLanguageLabel(
                          ttsSettings.modelId,
                          ttsSettings.languageCode,
                        ),
                      ],
                      [
                        t("settings.tts.defaultVoice"),
                        ttsVoiceLabel(ttsSettings),
                      ],
                    ]}
                  />
                  <label
                    className="grid gap-1 text-sm"
                    htmlFor="settings-tts-model"
                  >
                    <span className="font-medium">
                      {t("settings.tts.model")}
                    </span>
                    <select
                      id="settings-tts-model"
                      aria-label={t("settings.tts.model")}
                      value={ttsSettings.modelId}
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                      onChange={(event) =>
                        updateTtsModel(event.target.value as TtsModelId)
                      }
                    >
                      {visibleTtsModelCards.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="grid gap-1 text-sm"
                    htmlFor="settings-tts-voice"
                  >
                    <span className="font-medium">
                      {t("settings.tts.voice")}
                    </span>
                    <span className="text-muted-foreground text-xs">
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
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                      onChange={(event) => {
                        if (ttsSettings.engine === "qwen") {
                          updateQwenPresetVoice(
                            event.target.value as QwenPresetVoiceId,
                          );
                        } else {
                          updateTtsVoice(
                            event.target.value as SupertonicVoiceStyleId,
                          );
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
                  <label
                    className="grid gap-1 text-sm"
                    htmlFor="settings-tts-language"
                  >
                    <span className="font-medium">
                      {t("settings.tts.language")}
                    </span>
                    <select
                      id="settings-tts-language"
                      aria-label={t("settings.tts.language")}
                      value={ttsSettings.languageCode}
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                      onChange={(event) =>
                        updateTtsLanguage(event.target.value as TtsLanguageCode)
                      }
                    >
                      {synthesisLanguagesForModel(ttsSettings.modelId).map(
                        (language) => (
                          <option key={language.code} value={language.code}>
                            {ttsLanguageLabel(
                              ttsSettings.modelId,
                              language.code,
                            )}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </CardContent>
              </Card>
            </div>
          </SettingsPanel>
        ) : null}

        {activeTab === "ai" ? (
          <SettingsPanel tabId="ai">
            <div className="space-y-4">
              {settings ? (
                <>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <ProviderPreferenceCard
                      id="summary-provider-preference"
                      title={t("settings.providers.summaryProvider")}
                      config={aiProviderPreferences.summary}
                      streamingLabel={t("workbench.summary.streaming")}
                      streamingModeLabel={t(
                        "workbench.summary.streamingMode",
                      )}
                      streamingDescription={t(
                        "workbench.summary.streamingDescription",
                      )}
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
                      streamingDescription={t(
                        "workbench.chat.streamingDescription",
                      )}
                      onChange={(config) =>
                        updateAiProviderPreference("chat", config)
                      }
                    />
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {t("settings.providers.accounts")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
                        {settings.llm.accounts.map((account) => (
                          <div
                            key={account.provider}
                            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2 font-medium">
                                <ProviderIcon
                                  provider={account.provider}
                                  size={18}
                                  decorative
                                />
                                <span className="truncate">
                                  {account.label}
                                </span>
                              </span>
                              <span
                                role="switch"
                                aria-checked={account.configured}
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  account.configured
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    account.configured
                                      ? "bg-primary"
                                      : "bg-muted-foreground/40",
                                  )}
                                />
                                {account.configured
                                  ? t("settings.providers.configured")
                                  : t("settings.providers.notConfigured")}
                              </span>
                            </div>
                            <p className="text-muted-foreground mt-1 min-h-[2rem] text-xs leading-relaxed">
                              {account.provider === "openai-compatible"
                                ? t("settings.providers.customModel")
                                : settings.llm.defaultModels[account.provider]}{" · "}
                              {account.authModes.includes(
                                "oauth-subscription",
                              )
                                ? `${t("settings.providers.openAiAuth")} · ${t("settings.providers.oauthPlanned")}`
                                : t("settings.providers.apiKeyOnly")}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full"
                              onClick={() =>
                                onConfigureProvider?.(account.provider)
                              }
                            >
                              {t("settings.providers.configure")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <SettingsSectionLoading />
              )}

              <SystemPromptsSection
                systemPromptSettings={systemPromptSettings}
                onSaveSystemPrompts={onSaveSystemPrompts}
                onResetSystemPrompts={onResetSystemPrompts}
              />
            </div>
          </SettingsPanel>
        ) : null}

        {activeTab === "shortcuts" ? <ShortcutSettingsPanel /> : null}
        {activeTab === "help" ? (
          <HelpSettingsPanel
            onOpenOnboarding={onOpenOnboarding}
            onOpenTutorial={onOpenTutorial}
            onOpenFaq={onOpenFaq}
          />
        ) : null}
      </div>
    </div>
  );
}

function SettingsSubmenu({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTabId;
  onTabChange(tabId: SettingsTabId): void;
}) {
  const { t } = useI18n();

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <nav
        aria-label={t("settings.tabs.label")}
        aria-orientation="vertical"
        role="tablist"
        className="border-border bg-card grid gap-1 rounded-md border p-2"
      >
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              id={settingsTabButtonId(tab.id)}
              type="button"
              role="tab"
              aria-controls={settingsTabPanelId(tab.id)}
              aria-label={t(tab.title)}
              aria-selected={selected}
              className={`grid min-h-16 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:border-border hover:bg-muted border-transparent"
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-md ${
                  selected ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {t(tab.title)}
                </span>
                <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                  {t(tab.description)}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function SettingsPanel({
  tabId,
  children,
}: {
  tabId: SettingsTabId;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const tab = settingsTabs.find((candidate) => candidate.id === tabId);

  if (!tab) return null;

  return (
    <section
      id={settingsTabPanelId(tabId)}
      role="tabpanel"
      aria-labelledby={settingsTabButtonId(tabId)}
      className="space-y-4"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t(tab.title)}</h2>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">
          {t(tab.description)}
        </p>
      </div>
      {children}
    </section>
  );
}

function ShortcutSettingsPanel() {
  const { t } = useI18n();

  return (
    <SettingsPanel tabId="shortcuts">
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.shortcuts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">
                    {t("faq.shortcuts.action")}
                  </th>
                  <th className="py-2 font-medium">
                    {t("faq.shortcuts.keys")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {faqShortcutDefinitions.map((shortcut) => (
                  <tr
                    key={shortcut.id}
                    className="border-border border-b last:border-0"
                  >
                    <td className="py-3 pr-4">
                      {t(
                        "faqLabelKey" in shortcut
                          ? shortcut.faqLabelKey
                          : shortcut.labelKey,
                      )}
                    </td>
                    <td className="py-3">
                      <ShortcutKbd keys={resolveShortcutKeys(shortcut.keys)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </SettingsPanel>
  );
}

function HelpSettingsPanel({
  onOpenOnboarding,
  onOpenTutorial,
  onOpenFaq,
}: {
  onOpenOnboarding?: () => void;
  onOpenTutorial?: () => void;
  onOpenFaq?: () => void;
}) {
  const { t } = useI18n();

  return (
    <SettingsPanel tabId="help">
      <Card>
        <CardHeader>
          <CardTitle>{t("help.menu")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={!onOpenOnboarding}
            onClick={onOpenOnboarding}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {t("help.onboarding")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={!onOpenTutorial}
            onClick={onOpenTutorial}
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {t("help.tutorial")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={!onOpenFaq}
            onClick={onOpenFaq}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {t("help.faq")}
          </Button>
        </CardContent>
      </Card>
    </SettingsPanel>
  );
}

function settingsTabButtonId(tabId: SettingsTabId) {
  return `settings-tab-${tabId}`;
}

function settingsTabPanelId(tabId: SettingsTabId) {
  return `settings-panel-${tabId}`;
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
  onSaveSystemPrompts?: (
    settings: SystemPromptSettings,
  ) => Promise<void> | void;
  onResetSystemPrompts?: () =>
    | Promise<SystemPromptSettings>
    | SystemPromptSettings
    | void;
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
      promptDraft.quiz !== systemPromptSettings.quiz ||
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
        <p className="text-muted-foreground text-sm">
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
            id="quiz-system-prompt"
            label={t("settings.prompts.quiz")}
            description={t("settings.prompts.quizDescription")}
            value={promptDraft.quiz}
            onChange={(quiz) =>
              setPromptDraft((current) => ({ ...current, quiz }))
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
              !promptDraft.quiz.trim() ||
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
      <span className="text-muted-foreground block text-xs">{description}</span>
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
      className={`grid [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))] gap-2 ${className}`}
    >
      {children}
    </div>
  );
}

function SettingsSectionLoading() {
  const { t } = useI18n();

  return (
    <div className="space-y-3" aria-busy="true">
      <p className="text-muted-foreground text-sm">{t("settings.loading")}</p>
      <div className="space-y-2">
        <div className="bg-muted h-3 w-3/4 rounded-full" />
        <div className="bg-muted h-3 w-1/2 rounded-full" />
        <div className="bg-muted h-3 w-2/3 rounded-full" />
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
              <p className="text-muted-foreground text-sm">
                {t("settings.storage.description")}
              </p>
              <p className="text-sm font-medium">
                {t("settings.storage.total", { total: totalLabel })}
              </p>
            </div>
            {hasError ? (
              <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">
                  {t("settings.storage.unavailable")}
                </p>
                <p className="mt-1 text-xs break-words">
                  {storage.errorMessage}
                </p>
              </div>
            ) : null}
            <div
              className="bg-muted flex h-3 overflow-hidden rounded-full"
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
                  <span className="text-muted-foreground w-10 text-right">
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
  streamingDescription,
  onChange,
}: {
  id: string;
  title: string;
  config: AiWorkflowProviderConfig;
  streamingLabel: string;
  streamingModeLabel: string;
  streamingDescription: string;
  onChange(config: AiWorkflowProviderConfig): void;
}) {
  const { t } = useI18n();

  return (
    <div className="border-border bg-card grid gap-3 rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ProviderIcon provider={config.provider} size={18} decorative />
        <span>{title}</span>
      </div>
      <label className="grid gap-1" htmlFor={`${id}-provider`}>
        <span className="text-muted-foreground text-xs font-medium">
          {t("setup.provider.provider")}
        </span>
        <select
          id={`${id}-provider`}
          aria-label={`${title} ${t("setup.provider.provider")}`}
          value={config.provider}
          className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
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
        <span className="text-muted-foreground text-xs font-medium">
          {t("setup.provider.model")}
        </span>
        {config.provider === "openai-compatible" ? (
          <Input
            id={`${id}-model`}
            aria-label={`${title} ${t("setup.provider.model")}`}
            value={config.model}
            className="h-10 w-full"
            onChange={(event) =>
              onChange({
                ...config,
                model: event.target.value,
              })
            }
          />
        ) : (
          <select
            id={`${id}-model`}
            aria-label={`${title} ${t("setup.provider.model")}`}
            value={config.model}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
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
        )}
      </label>
      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs font-medium">
          {streamingLabel}
        </span>
        <div className="flex items-center justify-between">
          <span className="text-sm">{streamingModeLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={config.streamingMode}
            aria-label={`${title} ${streamingModeLabel}`}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              config.streamingMode ? "bg-primary" : "bg-input"
            }`}
            onClick={() =>
              onChange({
                ...config,
                streamingMode: !config.streamingMode,
              })
            }
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                config.streamingMode ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="text-muted-foreground min-h-[2.5rem] text-xs">{streamingDescription}</p>
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
    <div className="border-border rounded-md border px-3 py-2 text-sm">
      <p className="font-medium break-words">{model.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {compatibility && compatibility.severity !== "supported" ? (
          <SeverityBadge severity={compatibility.severity} />
        ) : null}
        <Badge>
          {model.downloaded
            ? t("settings.stt.downloaded")
            : model.downloadsOnDemand
              ? t("settings.stt.downloadsOnDemand")
              : t("settings.stt.notDownloaded")}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs break-words">
        {model.engine} · {model.fileName} · {formatModelSize(model.sizeMb)}
      </p>
      {compatibility && compatibility.severity !== "supported" ? (
        <p className="text-muted-foreground mt-2 text-xs">
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
    <div className="border-border rounded-md border px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{feature.label}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {feature.message}
          </p>
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
  return (
    options.find((option) => option.selection === locale)?.nativeName ?? locale
  );
}

function themeLabel(theme: AppTheme, t: ReturnType<typeof useI18n>["t"]) {
  if (theme === "dark") return t("settings.appearance.dark");
  if (theme === "auto") return t("settings.appearance.system");
  return t("settings.appearance.light");
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
