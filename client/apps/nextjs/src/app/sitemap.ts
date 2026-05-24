import type { MetadataRoute } from "next";

import {
  defaultLocale,
  getLocalizedPath,
  supportedLocales,
} from "~/app/_lib/i18n";

const baseUrl = "https://openbrief.app";
const pages = ["/", "/download"] as const;

function absolute(path: string) {
  return `${baseUrl}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of pages) {
    // Every language variant of a page shares the same hreflang alternates set.
    const languages: Record<string, string> = {};
    for (const item of supportedLocales) {
      languages[item.code] = absolute(getLocalizedPath(item.code, page));
    }
    languages["x-default"] = absolute(getLocalizedPath(defaultLocale, page));

    for (const item of supportedLocales) {
      entries.push({
        url: absolute(getLocalizedPath(item.code, page)),
        lastModified,
        changeFrequency: "monthly",
        priority: page === "/" ? (item.code === defaultLocale ? 1 : 0.8) : 0.6,
        alternates: { languages },
      });
    }
  }

  return entries;
}
