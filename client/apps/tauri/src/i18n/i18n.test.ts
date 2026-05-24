import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
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
import { ar_ma } from "@/i18n/locales/ar_ma";
import { de_de } from "@/i18n/locales/de_de";
import { el_gr } from "@/i18n/locales/el_gr";
import { en_us, type TranslationMessages } from "@/i18n/locales/en_us";
import { es_es } from "@/i18n/locales/es_es";
import { fr_fr } from "@/i18n/locales/fr_fr";
import { it_it } from "@/i18n/locales/it_it";
import { ja_jp } from "@/i18n/locales/ja_jp";
import { ko_kr } from "@/i18n/locales/ko_kr";
import { pl_pl } from "@/i18n/locales/pl_pl";
import { pt_br } from "@/i18n/locales/pt_br";
import { ru_ru } from "@/i18n/locales/ru_ru";
import { uk_ua } from "@/i18n/locales/uk_ua";
import { zh_cn } from "@/i18n/locales/zh_cn";
import { zh_tw } from "@/i18n/locales/zh_tw";

const localeCatalogs = {
  "ar-MA": ar_ma,
  "de-DE": de_de,
  "el-GR": el_gr,
  "en-US": en_us,
  "es-ES": es_es,
  "fr-FR": fr_fr,
  "it-IT": it_it,
  "ja-JP": ja_jp,
  "ko-KR": ko_kr,
  "pl-PL": pl_pl,
  "pt-BR": pt_br,
  "ru-RU": ru_ru,
  "uk-UA": uk_ua,
  "zh-CN": zh_cn,
  "zh-TW": zh_tw,
} satisfies Record<string, Partial<TranslationMessages>>;

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

  it("uses locale translations for completed catalogs", () => {
    expect(translate("ja-JP", "settings.version.title")).toBe("バージョン情報");
    expect(translate("ja-JP", "settings.providers.openAiAuth")).toBe(
      "ChatGPT Plus/Pro または API キー",
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

  it("registers every static translation key used by renderer source", () => {
    const usedKeys = collectStaticTranslationKeys();
    const missingKeys = [...usedKeys].filter((key) => !(key in en_us)).sort();

    expect(missingKeys).toEqual([]);
  });

  it("keeps locale catalogs complete, known, and placeholder-compatible", () => {
    const englishKeys = Object.keys(en_us);
    const englishKeySet = new Set(englishKeys);
    const catalogProblems: string[] = [];

    for (const [locale, catalog] of Object.entries(localeCatalogs)) {
      const catalogKeys = new Set(Object.keys(catalog));
      for (const key of englishKeys) {
        if (!catalogKeys.has(key)) {
          catalogProblems.push(`${locale}.${key} is missing`);
        }
      }

      for (const [key, message] of Object.entries(catalog)) {
        const englishMessage = en_us[key as TranslationKey];
        if (!englishKeySet.has(key)) {
          catalogProblems.push(`${locale}.${key} is not registered in en-US`);
          continue;
        }

        const expectedPlaceholders = extractPlaceholders(englishMessage);
        const actualPlaceholders = extractPlaceholders(message);
        if (!sameStringSet(expectedPlaceholders, actualPlaceholders)) {
          catalogProblems.push(
            `${locale}.${key} placeholders ${formatSet(actualPlaceholders)} do not match en-US ${formatSet(expectedPlaceholders)}`,
          );
        }
      }
    }

    expect(catalogProblems).toEqual([]);
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

function collectStaticTranslationKeys() {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const keys = new Set<string>();

  for (const filePath of listSourceFiles(srcRoot)) {
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    visitTranslationCalls(source, keys);
  }

  return keys;
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (entry === "i18n") return [];
      return listSourceFiles(path);
    }

    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
      return [];
    }

    return [path];
  });
}

function visitTranslationCalls(node: ts.Node, keys: Set<string>) {
  if (ts.isCallExpression(node)) {
    const keyArgument = translationKeyArgument(node);
    if (keyArgument) {
      for (const key of staticStringValues(keyArgument)) {
        keys.add(key);
      }
    }
  }

  ts.forEachChild(node, (child) => visitTranslationCalls(child, keys));
}

function translationKeyArgument(node: ts.CallExpression) {
  if (ts.isIdentifier(node.expression) && node.expression.text === "t") {
    return node.arguments[0];
  }

  if (
    ts.isIdentifier(node.expression) &&
    ["translate", "hasLocaleTranslation"].includes(node.expression.text)
  ) {
    return node.arguments[1];
  }

  return undefined;
}

function staticStringValues(node: ts.Expression): string[] {
  if (ts.isStringLiteralLike(node)) {
    return [node.text];
  }

  if (ts.isParenthesizedExpression(node)) {
    return staticStringValues(node.expression);
  }

  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return staticStringValues(node.expression);
  }

  if (ts.isConditionalExpression(node)) {
    return [
      ...staticStringValues(node.whenTrue),
      ...staticStringValues(node.whenFalse),
    ];
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return [
      ...staticStringValues(node.left),
      ...staticStringValues(node.right),
    ];
  }

  return [];
}

function extractPlaceholders(message: string) {
  return new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
}

function sameStringSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  return [...left].every((value) => right.has(value));
}

function formatSet(values: Set<string>) {
  return `{${[...values].sort().join(", ")}}`;
}
