import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";

import { cn } from "@acme/ui";
import { ColorThemeToggle, ThemeProvider, ThemeToggle } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";
import { defaultLocale, isSupportedLocale } from "~/app/_lib/i18n";
import { TRPCReactProvider } from "~/trpc/react";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://openbrief.app"
      : "http://localhost:3000",
  ),
  title: "OpenBrief",
  description: "Turn videos and audio into clear, listenable briefings.",
  openGraph: {
    type: "website",
    title: "OpenBrief",
    description: "Turn videos and audio into clear, listenable briefings.",
    url: "https://openbrief.app",
    siteName: "OpenBrief",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: [
      { url: "/openbrief-logo.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/openbrief-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

function resolveLocale(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment && isSupportedLocale(segment) ? segment : defaultLocale;
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const locale = resolveLocale(pathname);

  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : undefined}
      suppressHydrationWarning
    >
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <div className="fixed right-4 bottom-4 z-50 hidden items-center gap-2 sm:flex">
            <ColorThemeToggle />
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
