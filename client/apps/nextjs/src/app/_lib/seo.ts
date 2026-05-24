import type { Metadata } from "next";

import {
  defaultLocale,
  getLocalizedPath,
  getMarketingCopy,
  supportedLocales,
} from "~/app/_lib/i18n";
import type { SupportedLocale } from "~/app/_lib/i18n";

type MarketingPage = "/" | "/download";

// Open Graph wants language_TERRITORY; map our short locale codes to it.
const ogLocales: Record<SupportedLocale, string> = {
  en: "en_US",
  ko: "ko_KR",
  ja: "ja_JP",
  zh: "zh_CN",
  es: "es_ES",
  de: "de_DE",
  fr: "fr_FR",
  id: "id_ID",
  it: "it_IT",
  pt: "pt_BR",
  vi: "vi_VN",
  ar: "ar_AR",
};

/**
 * Per-page, per-locale metadata: a localized title/description, a
 * self-referencing canonical, and the full hreflang alternates set so Google
 * connects all language versions of the same page. Paths are root-relative and
 * resolved against `metadataBase` (set in the root layout).
 */
export function buildMarketingMetadata(
  locale: SupportedLocale,
  page: MarketingPage,
): Metadata {
  const copy = getMarketingCopy(locale);
  const isHome = page === "/";

  const heroTitle = isHome ? copy.home.hero.title : copy.download.hero.title;
  const title = heroTitle.includes("OpenBrief")
    ? heroTitle
    : `${heroTitle} — OpenBrief`;
  const description = isHome
    ? copy.home.hero.secondary
    : copy.download.hero.body;

  const canonical = getLocalizedPath(locale, page);

  const languages: Record<string, string> = {};
  for (const item of supportedLocales) {
    languages[item.code] = getLocalizedPath(item.code, page);
  }
  languages["x-default"] = getLocalizedPath(defaultLocale, page);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      type: "website",
      siteName: "OpenBrief",
      title,
      description,
      url: canonical,
      locale: ogLocales[locale],
      alternateLocale: supportedLocales
        .filter((item) => item.code !== locale)
        .map((item) => ogLocales[item.code]),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
