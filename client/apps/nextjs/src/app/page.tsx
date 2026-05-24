import type { Metadata } from "next";
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
      className="bg-card relative mx-auto aspect-video max-w-5xl overflow-hidden rounded-md border shadow-xl"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_13%,transparent),transparent_32%),radial-gradient(circle_at_72%_24%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_28%)]" />
      <div className="absolute inset-4 rounded-md border bg-background/90 p-3 shadow-sm sm:inset-6 sm:p-4">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="bg-primary size-2.5 rounded-full" />
              <span className="bg-muted size-2.5 rounded-full" />
              <span className="bg-muted size-2.5 rounded-full" />
            </div>
            <span className="bg-muted h-5 w-24 rounded-full" />
          </div>

          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1.05fr_0.95fr]">
            <div className="flex min-h-0 flex-col rounded-md border bg-black p-3">
              <div className="relative grid flex-1 place-items-center overflow-hidden rounded border border-white/10 bg-white/10">
                <div className="absolute inset-x-6 top-5 flex gap-2">
                  <span className="h-2 w-20 rounded-full bg-white/40" />
                  <span className="bg-primary h-2 w-10 rounded-full" />
                </div>
                <div className="bg-background/95 grid size-16 place-items-center rounded-full border shadow-sm">
                  <span className="ml-1 block size-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-foreground" />
                </div>
                <div className="absolute inset-x-6 bottom-5 space-y-2">
                  <span className="block h-2 rounded-full bg-white/65" />
                  <span className="block h-2 w-3/5 rounded-full bg-white/30" />
                </div>
              </div>
            </div>

            <div className="grid min-h-0 gap-3">
              <div className="rounded-md border bg-card p-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="bg-foreground/15 h-3 w-28 rounded-full" />
                  <span className="bg-primary/30 h-5 w-16 rounded-full" />
                </div>
                <div className="space-y-2">
                  <span className="bg-muted block h-2 rounded-full" />
                  <span className="bg-muted block h-2 rounded-full" />
                  <span className="bg-muted block h-2 w-2/3 rounded-full" />
                </div>
              </div>
              <div className="grid gap-2 rounded-md border bg-card p-4">
                <span className="bg-primary/25 h-7 rounded-md" />
                <span className="bg-muted h-7 rounded-md" />
                <span className="bg-muted h-7 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
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

function ProductWindow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className="bg-card w-full min-w-0 overflow-hidden rounded-md border shadow-xl"
    >
      <div className="flex items-center justify-between border-b bg-background/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary size-2.5 rounded-full" />
          <span className="bg-muted size-2.5 rounded-full" />
          <span className="bg-muted size-2.5 rounded-full" />
        </div>
        <span className="bg-muted h-4 w-28 rounded-full" />
      </div>
      {children}
    </div>
  );
}

function LibraryPagePreview({ label }: { label: string }) {
  return (
    <ProductWindow label={label}>
      <div className="grid min-h-[19rem] grid-cols-[3.25rem_minmax(0,1fr)] bg-background sm:min-h-[22rem] sm:grid-cols-[4rem_minmax(0,1fr)]">
        <div className="border-r p-2 sm:p-3">
          <div className="bg-primary mb-4 size-9 rounded-md sm:mb-5 sm:size-10" />
          <div className="grid gap-3">
            <span className="bg-primary/25 size-8 rounded-md sm:size-9" />
            <span className="bg-muted size-8 rounded-md sm:size-9" />
            <span className="bg-muted size-8 rounded-md sm:size-9" />
          </div>
        </div>
        <div className="min-w-0 p-3 sm:p-4">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3 sm:mb-5">
            <div className="min-w-0">
              <span className="bg-foreground/20 block h-4 w-28 max-w-full rounded-full sm:w-32" />
              <span className="bg-muted mt-2 block h-3 w-32 max-w-full rounded-full sm:w-48" />
            </div>
            <span className="bg-primary h-8 w-20 shrink-0 rounded-md sm:h-9 sm:w-24" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Research call", "Product demo", "Lecture clip", "Interview"].map(
              (item, index) => (
                <div key={item} className="rounded-md border bg-card p-3">
                  <div className="bg-secondary/20 aspect-video rounded-sm" />
                  <span className="bg-foreground/20 mt-3 block h-3 w-3/4 rounded-full" />
                  <span className="bg-muted mt-2 block h-3 w-1/2 rounded-full" />
                  <div className="mt-3 flex gap-2">
                    <span className="bg-primary/25 h-5 w-16 rounded-full" />
                    {index === 0 ? (
                      <span className="bg-muted h-5 w-14 rounded-full" />
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </ProductWindow>
  );
}

function NotePagePreview({ label }: { label: string }) {
  return (
    <ProductWindow label={label}>
      <div className="grid min-h-[19rem] min-w-0 gap-3 bg-background p-3 sm:min-h-[22rem] sm:p-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="grid gap-3">
          <div className="rounded-md border bg-black p-3">
            <div className="relative grid aspect-video place-items-center rounded border border-white/10 bg-white/10">
              <div className="bg-background/95 grid size-14 place-items-center rounded-full border shadow-sm">
                <span className="ml-1 block size-0 border-y-[8px] border-l-[12px] border-y-transparent border-l-foreground" />
              </div>
              <div className="absolute inset-x-4 bottom-4 space-y-2">
                <span className="block h-2 rounded-full bg-white/65" />
                <span className="block h-2 w-3/5 rounded-full bg-white/30" />
              </div>
            </div>
          </div>
          <div className="grid gap-2 rounded-md border bg-card p-3">
            <span className="bg-primary/25 h-8 rounded-md" />
            <span className="bg-muted h-8 rounded-md" />
            <span className="bg-muted h-8 rounded-md" />
          </div>
        </div>
        <div className="grid gap-3">
          <div className="rounded-md border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="bg-foreground/20 h-4 w-32 rounded-full" />
              <span className="bg-primary/30 h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <span className="bg-muted block h-2.5 rounded-full" />
              <span className="bg-muted block h-2.5 rounded-full" />
              <span className="bg-muted block h-2.5 w-2/3 rounded-full" />
            </div>
          </div>
          <div className="rounded-md border bg-card p-4">
            <div className="space-y-3">
              <span className="bg-primary/20 block h-10 rounded-md" />
              <span className="bg-muted block h-10 rounded-md" />
              <span className="bg-muted block h-10 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </ProductWindow>
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
    </MarketingShell>
  );
}
