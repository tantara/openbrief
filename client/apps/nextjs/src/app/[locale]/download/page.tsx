import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import DownloadPage from "~/app/download/page";
import {
  defaultLocale,
  isSupportedLocale,
  supportedLocales,
} from "~/app/_lib/i18n";
import { buildMarketingMetadata } from "~/app/_lib/seo";

export function generateStaticParams() {
  // The default locale is served at "/download" (not "/en/download").
  return supportedLocales
    .filter((locale) => locale.code !== defaultLocale)
    .map((locale) => ({ locale: locale.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    return {};
  }
  return buildMarketingMetadata(locale, "/download");
}

export default async function LocalizedDownloadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale === "cn") {
    redirect("/zh/download");
  }

  // The default locale lives at "/download"; redirect "/en/download".
  if (locale === defaultLocale) {
    redirect("/download");
  }

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <DownloadPage locale={locale} />;
}
