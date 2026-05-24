import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageMenu } from "~/app/_components/language-menu";
import {
  defaultLocale,
  getLocalizedPath,
  getMarketingCopy,
} from "~/app/_lib/i18n";
import type { SupportedLocale } from "~/app/_lib/i18n";
import { Button } from "@acme/ui/button";
import { OpenBriefMark } from "@acme/ui/openbrief-mark";

interface MarketingNavProps {
  sectionBaseHref?: "" | "/";
  locale?: SupportedLocale;
}

interface MarketingShellProps extends MarketingNavProps {
  children: ReactNode;
}

function sectionHref(baseHref: "" | "/", id: string, locale: SupportedLocale) {
  return baseHref === "" ? `#${id}` : `${getLocalizedPath(locale, "/")}#${id}`;
}

export function MarketingNav({
  sectionBaseHref = "",
  locale = defaultLocale,
}: MarketingNavProps) {
  const copy = getMarketingCopy(locale);

  return (
    <header className="border-border bg-background/90 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href={getLocalizedPath(locale, "/")}
          className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3"
          aria-label="OpenBrief"
        >
          <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg font-semibold shadow sm:size-10">
            <OpenBriefMark className="size-5" />
          </span>
          <span className="text-base font-semibold">OpenBrief</span>
        </Link>
        <nav
          className="flex min-w-0 items-center gap-0.5 sm:gap-1"
          aria-label="Primary"
        >
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href={sectionHref(sectionBaseHref, "features", locale)}>
              {copy.nav.features}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={getLocalizedPath(locale, "/download")}>
              {copy.nav.download}
            </Link>
          </Button>
          <LanguageMenu />
        </nav>
      </div>
    </header>
  );
}

function MarketingFooter({
  sectionBaseHref = "",
  locale = defaultLocale,
}: MarketingNavProps) {
  const copy = getMarketingCopy(locale);

  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 text-sm sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Link
            href={getLocalizedPath(locale, "/")}
            className="inline-flex items-center gap-2"
            aria-label="OpenBrief"
          >
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg font-semibold shadow">
              <OpenBriefMark className="size-4" />
            </span>
            <span className="font-semibold">OpenBrief</span>
          </Link>
          <p className="text-muted-foreground mt-3 max-w-md leading-6">
            {copy.footer.description}
          </p>
        </div>

        <nav
          className="flex flex-wrap gap-x-5 gap-y-3 md:justify-end"
          aria-label="Footer"
        >
          <Link
            href={sectionHref(sectionBaseHref, "features", locale)}
            className="text-muted-foreground hover:text-foreground"
          >
            {copy.nav.features}
          </Link>
          <Link
            href={getLocalizedPath(locale, "/download")}
            className="text-muted-foreground hover:text-foreground"
          >
            {copy.nav.download}
          </Link>
          <Link
            href="https://github.com/tantara/openclip"
            className="text-muted-foreground hover:text-foreground"
          >
            {copy.nav.github}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function MarketingShell({
  children,
  sectionBaseHref = "",
  locale = defaultLocale,
}: MarketingShellProps) {
  return (
    <div
      lang={locale}
      dir={locale === "ar" ? "rtl" : undefined}
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      <MarketingNav sectionBaseHref={sectionBaseHref} locale={locale} />
      <main className="flex-1">{children}</main>
      <MarketingFooter sectionBaseHref={sectionBaseHref} locale={locale} />
    </div>
  );
}
