import type { Metadata } from "next";

import { Button } from "@acme/ui/button";

import type { SupportedLocale } from "~/app/_lib/i18n";
import { MarketingShell } from "~/app/_components/marketing-shell";
import { defaultLocale, getMarketingCopy } from "~/app/_lib/i18n";
import { buildMarketingMetadata } from "~/app/_lib/seo";

const version = "0.4.0";
const releaseBase = `https://github.com/tantara/openbrief/releases/download/v${version}`;
const sourceUrl = "https://github.com/tantara/openbrief";

const releaseDownloads = [
  // macOS: Apple Silicon, Intel (x64)
  [
    `${releaseBase}/OpenBrief_${version}_aarch64.dmg`,
    `${releaseBase}/OpenBrief_${version}_x64.dmg`,
  ],
  // Windows: 64-bit
  [`${releaseBase}/OpenBrief_${version}_x64-setup.exe`],
  // Linux: Debian, Build from source
  [`${releaseBase}/OpenBrief_${version}_amd64.deb`, sourceUrl],
] as const;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata(defaultLocale, "/download");
}

function DownloadButton({
  label,
  href,
  actionLabel,
  comingSoon,
}: {
  label: string;
  href?: string;
  actionLabel: string;
  comingSoon: string;
}) {
  if (href) {
    return (
      <Button asChild variant="outline" size="sm" className="justify-between">
        <a href={href}>
          <span>{label}</span>
          <span className="text-muted-foreground text-xs">{actionLabel}</span>
        </a>
      </Button>
    );
  }

  return (
    <Button
      disabled
      variant="outline"
      size="sm"
      className="justify-between text-left"
    >
      <span>{label}</span>
      <span className="text-muted-foreground text-xs">{comingSoon}</span>
    </Button>
  );
}

export default function DownloadPage({
  locale = defaultLocale,
}: {
  locale?: SupportedLocale;
}) {
  const copy = getMarketingCopy(locale);

  return (
    <MarketingShell sectionBaseHref="/" locale={locale}>
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-16 text-center sm:px-6 sm:pt-20">
        <p className="bg-muted text-muted-foreground mx-auto mb-5 w-fit rounded-md border px-3 py-1 text-xs font-medium">
          {copy.download.hero.badge}
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-normal text-balance sm:text-7xl">
          {copy.download.hero.title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base leading-7 sm:text-lg">
          {copy.download.hero.body}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {copy.download.hero.platforms.map((platform) => (
            <span
              key={platform}
              className="border-primary/25 bg-primary/5 rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              {platform} {copy.download.hero.availabilitySuffix}
            </span>
          ))}
        </div>
      </section>

      <section
        id="release-builds"
        className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 sm:px-6 lg:grid-cols-3"
      >
        {copy.download.platformGroups.map((group, groupIndex) => (
          <article key={group.name} className="bg-card rounded-md border p-5">
            <h2 className="text-xl font-semibold">{group.name}</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {copy.download.releaseDescription}
            </p>
            <div className="mt-5 grid gap-2">
              {group.builds.map((build, buildIndex) => (
                <DownloadButton
                  key={build}
                  label={build}
                  href={releaseDownloads[groupIndex]?.[buildIndex]}
                  actionLabel={copy.nav.download}
                  comingSoon={copy.download.comingSoon}
                />
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="bg-muted/35 border-y py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              {copy.download.openSource.title}
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-6">
              {copy.download.openSource.body}
            </p>
          </div>
          <div className="bg-card rounded-md border p-5 shadow-sm">
            <p className="text-sm font-medium">
              {copy.download.openSource.cardTitle}
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {copy.download.openSource.body}
            </p>
            <Button asChild className="mt-5">
              <a
                href="https://github.com/tantara/openbrief"
                target="_blank"
                rel="noreferrer"
              >
                {copy.download.openSource.cta}
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              {copy.download.requirements.title}
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-6">
              {copy.download.requirements.body}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {copy.download.requirements.items.map((requirement) => (
              <li
                key={requirement}
                className="bg-background text-muted-foreground rounded-md border p-4 text-sm"
              >
                {requirement}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}
