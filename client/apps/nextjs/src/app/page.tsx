import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { MarketingShell } from "~/app/_components/marketing-shell";
import { HomeStructuredData } from "~/app/_components/structured-data";
import {
  defaultLocale,
  getLocalizedPath,
  getMarketingCopy,
} from "~/app/_lib/i18n";
import type { MarketingCopy, SupportedLocale } from "~/app/_lib/i18n";
import { buildMarketingMetadata } from "~/app/_lib/seo";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";

export function generateMetadata(): Metadata {
  return buildMarketingMetadata(defaultLocale, "/");
}

function Hero({
  copy,
  locale,
}: {
  copy: MarketingCopy["home"];
  locale: SupportedLocale;
}) {
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-6xl px-5 pt-12 pb-16 sm:px-6 sm:pt-16 lg:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="outline" className="mb-5 shadow-none">
            {copy.hero.badge}
          </Badge>
          <h1 className="text-5xl leading-none font-semibold text-balance sm:text-7xl lg:text-8xl">
            {copy.hero.title}
          </h1>
        </div>

        <div className="mt-10">
          <DemoVideo label={copy.hero.demoLabel} />
        </div>

        <div className="mx-auto mt-9 grid max-w-4xl gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-5 text-base leading-7 sm:text-lg sm:leading-8">
            <p>
              <span className="font-semibold">{copy.hero.bodyStrong}</span>{" "}
              {copy.hero.body}
            </p>
            <p className="text-muted-foreground">
              {copy.hero.secondary}
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:min-w-56">
            <Button asChild size="lg" className="px-7 text-base">
              <Link href={getLocalizedPath(locale, "/download")}>
                {copy.hero.cta}
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {copy.hero.platforms.map((platform) => (
                <Badge
                  key={platform}
                  variant="outline"
                  className="bg-background"
                >
                  {platform}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 border-t pt-8 sm:grid-cols-3">
          {copy.stats.map((stat) => (
            <div key={stat.title}>
              <h2 className="text-base leading-6 font-semibold">
                {stat.title}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {stat.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoVideo({ label }: { label: string }) {
  return (
    <div
      className="bg-card relative mx-auto aspect-[960/602] max-w-5xl overflow-hidden rounded-md border shadow-xl"
      aria-label={label}
    >
      <video
        aria-label={label}
        autoPlay
        className="size-full bg-black object-contain"
        loop
        muted
        playsInline
        poster="https://cdn.openbrief.app/assets/openbrief-demo-poster.jpg"
        preload="metadata"
      >
        <source
          src="https://cdn.openbrief.app/assets/openbrief-demo-landing.mp4"
          type="video/mp4"
        />
      </video>
    </div>
  );
}

function FeatureSection({ copy }: { copy: MarketingCopy["home"]["features"] }) {
  return (
    <section
      id="features"
      className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:py-20"
      aria-labelledby="features-title"
    >
      <div className="max-w-3xl">
        <Badge variant="outline" className="mb-4">
          {copy.badge}
        </Badge>
        <h2
          id="features-title"
          className="text-3xl leading-tight font-semibold text-balance sm:text-4xl"
        >
          {copy.title}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
          {copy.body}
        </p>
      </div>
      <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {copy.items.map((feature) => (
          <article key={feature.title}>
            <h3 className="text-lg leading-7 font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {feature.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductFlowSection({
  copy,
}: {
  copy: MarketingCopy["home"]["workflow"];
}) {
  return (
    <section id="workflow" className="border-t">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-4">
            {copy.badge}
          </Badge>
          <h2 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            {copy.title}
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-sm leading-6">
            {copy.body}
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-12">
          <ProductSubsection title={copy.libraryTitle} body={copy.libraryBody}>
            <LibraryPagePreview label={copy.libraryLabel} />
          </ProductSubsection>
          <ProductSubsection title={copy.noteTitle} body={copy.noteBody}>
            <NotePagePreview label={copy.noteLabel} />
          </ProductSubsection>
        </div>
      </div>
    </section>
  );
}

function ProductSubsection({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="max-w-2xl">
        <h3 className="text-2xl leading-tight font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
      </div>
      {children}
    </div>
  );
}

function LibraryPagePreview({ label }: { label: string }) {
  return (
    <ScreenshotPreview
      alt={label}
      label={label}
      src="/screenshot_library.png"
    />
  );
}

function NotePagePreview({ label }: { label: string }) {
  return (
    <ScreenshotPreview alt={label} label={label} src="/screenshot_note.png" />
  );
}

function ScreenshotPreview({
  alt,
  label,
  src,
}: {
  alt: string;
  label: string;
  src: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      aria-label={label}
      width={1840}
      height={1196}
      sizes="(min-width: 1024px) 896px, calc(100vw - 40px)"
      className="h-auto w-full"
    />
  );
}

function BottomDownloadCta({
  copy,
  locale,
}: {
  copy: MarketingCopy;
  locale: SupportedLocale;
}) {
  return (
    <section className="border-t">
      <div className="mx-auto grid max-w-3xl justify-items-center px-5 py-16 text-center sm:px-6 lg:py-20">
        <Badge variant="outline" className="mb-4">
          {copy.download.hero.badge}
        </Badge>
        <h2 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">
          {copy.download.hero.title}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
          {copy.download.hero.body}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {copy.download.hero.platforms.map((platform) => (
            <Badge key={platform} variant="outline" className="bg-background">
              {platform}
            </Badge>
          ))}
        </div>
        <Button asChild size="lg" className="mt-8 px-7 text-base">
          <Link href={getLocalizedPath(locale, "/download")}>
            {copy.home.hero.cta}
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default function HomePage({
  locale = defaultLocale,
}: {
  locale?: SupportedLocale;
}) {
  const copy = getMarketingCopy(locale);

  return (
    <MarketingShell locale={locale}>
      <HomeStructuredData locale={locale} />
      <Hero copy={copy.home} locale={locale} />
      <FeatureSection copy={copy.home.features} />
      <ProductFlowSection copy={copy.home.workflow} />
      <BottomDownloadCta copy={copy} locale={locale} />
    </MarketingShell>
  );
}
