import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ar_ma } from "@/i18n/locales/ar_ma";
import { de_de } from "@/i18n/locales/de_de";
import { el_gr } from "@/i18n/locales/el_gr";
import { en_us, type TranslationKey, type TranslationMessages } from "@/i18n/locales/en_us";
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

export type { TranslationKey } from "@/i18n/locales/en_us";

export type LocaleCode =
  | "ar-MA"
  | "de-DE"
  | "el-GR"
  | "en-US"
  | "es-ES"
  | "fr-FR"
  | "it-IT"
  | "ja-JP"
  | "ko-KR"
  | "pl-PL"
  | "pt-BR"
  | "ru-RU"
  | "uk-UA"
  | "zh-CN"
  | "zh-TW";

export type LanguageSelection = "auto" | LocaleCode;

export type LocaleOption = {
  selection: LanguageSelection;
  locale: LocaleCode;
  nativeName: string;
};

type TranslationValues = Record<string, string | number | undefined>;

type I18nContextValue = {
  languageSelection: LanguageSelection;
  resolvedLocale: LocaleCode;
  localeOptions: LocaleOption[];
  setLanguageSelection(selection: LanguageSelection): void;
  t(key: TranslationKey, values?: TranslationValues): string;
};

const storageKey = "openbrief.language-selection";
const localeModules: Record<LocaleCode, Partial<TranslationMessages>> = {
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
};

export const supportedLocales = Object.keys(localeModules) as LocaleCode[];

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [languageSelection, setLanguageSelectionState] =
    useState<LanguageSelection>(() => readStoredLanguageSelection());
  const resolvedLocale = resolveLanguageSelection(languageSelection);

  useEffect(() => {
    document.documentElement.lang = resolvedLocale;
    document.documentElement.dir = resolvedLocale === "ar-MA" ? "rtl" : "ltr";
  }, [resolvedLocale]);

  const setLanguageSelection = useCallback((selection: LanguageSelection) => {
    setLanguageSelectionState(selection);
    try {
      window.localStorage.setItem(storageKey, selection);
    } catch {
      // Keep the in-memory language if localStorage is unavailable.
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      languageSelection,
      resolvedLocale,
      localeOptions: createLocaleOptions(),
      setLanguageSelection,
      t: (key, values) => translate(resolvedLocale, key, values),
    }),
    [languageSelection, resolvedLocale, setLanguageSelection],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    return createFallbackI18nContext();
  }

  return context;
}

export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  values: TranslationValues = {},
) {
  const text = localeModules[locale][key] ?? en_us[key] ?? key;
  return interpolate(text, values);
}

export function hasLocaleTranslation(locale: LocaleCode, key: TranslationKey) {
  return Object.prototype.hasOwnProperty.call(localeModules[locale], key);
}

export function resolveLanguageSelection(selection: LanguageSelection): LocaleCode {
  if (selection !== "auto") return selection;

  const languageTags =
    typeof navigator === "undefined"
      ? []
      : [navigator.language, ...(navigator.languages ?? [])];

  for (const languageTag of languageTags) {
    const locale = normalizeLocale(languageTag);
    if (locale) return locale;
  }

  return "en-US";
}

export function normalizeLocale(languageTag: string | undefined): LocaleCode | undefined {
  if (!languageTag) return undefined;

  const normalized = languageTag.replace("_", "-").toLowerCase();
  const exactMatch = supportedLocales.find(
    (locale) => locale.toLowerCase() === normalized,
  );

  if (exactMatch) return exactMatch;

  const language = normalized.split("-")[0];
  return supportedLocales.find((locale) => locale.toLowerCase().startsWith(`${language}-`));
}

export function createLocaleOptions(): LocaleOption[] {
  return [
    {
      selection: "auto",
      locale: resolveLanguageSelection("auto"),
      nativeName: translate(resolveLanguageSelection("auto"), "i18n.autoDetect"),
    },
    ...supportedLocales.map((locale) => ({
      selection: locale,
      locale,
      nativeName: translate(locale, "i18n.nativeName"),
    })),
  ];
}

function createFallbackI18nContext(): I18nContextValue {
  return {
    languageSelection: "auto",
    resolvedLocale: "en-US",
    localeOptions: createLocaleOptions(),
    setLanguageSelection() {},
    t: (key, values) => translate("en-US", key, values),
  };
}

function readStoredLanguageSelection(): LanguageSelection {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "auto" || supportedLocales.includes(stored as LocaleCode)) {
      return stored as LanguageSelection;
    }
  } catch {
    // Default below when localStorage is unavailable.
  }

  return "auto";
}

function interpolate(text: string, values: TranslationValues) {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
