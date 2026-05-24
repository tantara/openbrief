import { describe, expect, it, vi } from "vitest";
import {
  createLocaleOptions,
  hasLocaleTranslation,
  normalizeLocale,
  resolveLanguageSelection,
  supportedLocales,
  translate,
  type TranslationKey,
} from "@/i18n";

describe("i18n", () => {
  it("supports the requested locale set", () => {
    expect(supportedLocales).toEqual([
      "ar-MA",
      "de-DE",
      "el-GR",
      "en-US",
      "es-ES",
      "fr-FR",
      "it-IT",
      "ja-JP",
      "ko-KR",
      "pl-PL",
      "pt-BR",
      "ru-RU",
      "uk-UA",
      "zh-CN",
      "zh-TW",
    ]);
  });

  it("normalizes browser language tags to supported locales", () => {
    expect(normalizeLocale("de")).toBe("de-DE");
    expect(normalizeLocale("pt_BR")).toBe("pt-BR");
    expect(normalizeLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeLocale("unknown")).toBeUndefined();
  });

  it("falls back to English for missing translated keys", () => {
    expect(translate("ja-JP", "settings.version.title")).toBe("バージョン情報");
    expect(translate("ja-JP", "settings.providers.openAiAuth")).toBe(
      "ChatGPT Plus/Pro or API key",
    );
  });

  it("translates high-visibility product strings in every locale", () => {
    const keys: TranslationKey[] = [
      "download.error.rate-limited",
      "download.error.private-video",
      "download.recovery.provide-cookies.label",
      "download.recovery.open-webview-cookies.description",
      "finder.actions.openProvider",
      "finder.howTo.description",
      "finder.import.title",
      "finder.job.copy",
      "finder.job.copyFailedUrl",
      "finder.job.retry",
      "finder.job.retryFailed",
      "finder.job.status.failed",
      "finder.noMatches",
      "finder.search.placeholder",
      "nav.workbench",
      "notice.downloadRecovery.cookies",
      "notice.artifactExport.success",
      "notice.ytdlp.update.failed",
      "page.video",
      "settings.appearance.theme",
      "settings.providers.summaryProvider",
      "settings.providers.chatProvider",
      "settings.providers.configure",
      "setup.provider.authMethod",
      "status.notConfigured",
      "video.player.cannotPlay",
      "workbench.chat.send",
      "workbench.chat.streaming",
      "workbench.chat.streamingMode",
      "workbench.chat.streamingOn",
      "workbench.chat.streamingOff",
      "workbench.chat.streamingDescription",
      "workbench.extractTranscript",
      "workbench.link.copyLink",
      "workbench.summary.transcriptRequired",
      "workbench.tabs.videos",
      "workbench.tabs.addVideo",
      "workbench.tabs.summary",
      "workbench.transcript.edit",
      "workbench.transcript.exampleBadge",
      "workbench.transcript.jumpTo",
      "transcript.languageDialog.description",
      "transcript.languageDialog.title",
    ];

    for (const locale of supportedLocales) {
      for (const key of keys) {
        expect(hasLocaleTranslation(locale, key), `${locale} missing ${key}`).toBe(
          true,
        );
      }
    }
  });

  it("creates an auto option plus every locale option", () => {
    expect(createLocaleOptions()).toHaveLength(supportedLocales.length + 1);
    expect(createLocaleOptions()[0]).toMatchObject({ selection: "auto" });
  });

  it("resolves auto selection from navigator languages", () => {
    vi.stubGlobal("navigator", {
      language: "es-MX",
      languages: ["es-MX", "en-US"],
    });

    expect(resolveLanguageSelection("auto")).toBe("es-ES");

    vi.unstubAllGlobals();
  });
});
