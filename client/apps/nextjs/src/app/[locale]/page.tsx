import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import HomePage from "~/app/page";
import {
  defaultLocale,
  isSupportedLocale,
  supportedLocales,
} from "~/app/_lib/i18n";
import { buildMarketingMetadata } from "~/app/_lib/seo";

export function generateStaticParams() {
  // The default locale is served at "/" (not "/en"), so don't generate it here.
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
  return buildMarketingMetadata(locale, "/");
}

export default async function LocalizedHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale === "cn") {
    redirect("/zh");
  }

  // The default locale lives at "/"; redirect "/en" to avoid duplicate content.
  if (locale === defaultLocale) {
    redirect("/");
  }

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return <HomePage locale={locale} />;
}
