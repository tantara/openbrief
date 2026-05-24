"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@acme/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";

import {
  defaultLocale,
  getLocalizedPath,
  isSupportedLocale,
  supportedLocales,
} from "~/app/_lib/i18n";
import type { SupportedLocale } from "~/app/_lib/i18n";

function getPathParts(pathname: string) {
  return pathname.split("/").filter(Boolean);
}

function getActiveLocale(pathname: string): SupportedLocale {
  const [firstSegment] = getPathParts(pathname);
  return firstSegment && isSupportedLocale(firstSegment)
    ? firstSegment
    : defaultLocale;
}

function getLocalizedHref(pathname: string, locale: SupportedLocale) {
  const parts = getPathParts(pathname);
  const pathWithoutLocale =
    parts[0] && isSupportedLocale(parts[0]) ? parts.slice(1) : parts;
  const basePath = pathWithoutLocale.length
    ? `/${pathWithoutLocale.join("/")}`
    : "/";

  // Keep the default locale unprefixed ("/", "/download") and avoid trailing
  // slashes so links match canonical URLs instead of 308-redirecting.
  return getLocalizedPath(locale, basePath);
}

export function LanguageMenu() {
  const pathname = usePathname();
  const activeLocale = getActiveLocale(pathname);
  const activeLabel =
    supportedLocales.find((locale) => locale.code === activeLocale)?.label ??
    "English";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label="Change language"
        >
          {activeLocale.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[420px] min-w-[200px] rounded-xl border-neutral-100 bg-white p-2 text-neutral-950 shadow-lg [scrollbar-color:#d6d8cf_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 [&::-webkit-scrollbar-track]:border-none [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {supportedLocales.map((locale) => (
          <DropdownMenuItem
            key={locale.code}
            asChild
            className={
              locale.code === activeLocale
                ? "rounded-lg bg-neutral-100 px-3 py-2 text-sm leading-[1.6] font-semibold text-neutral-950"
                : "rounded-lg px-3 py-2 text-sm leading-[1.6] text-neutral-950 hover:bg-neutral-100"
            }
          >
            <Link
              href={getLocalizedHref(pathname, locale.code)}
              hrefLang={locale.code}
              aria-current={locale.code === activeLocale ? "true" : undefined}
            >
              <span className="flex-1">{locale.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <span className="sr-only">Current language: {activeLabel}</span>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
