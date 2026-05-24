import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@acme/ui";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const TABS = [
  { href: "/youtube/upload", label: "Upload" },
  { href: "/youtube/dashboard", label: "Dashboard" },
  { href: "/youtube/ranking", label: "Ranking" },
];

export default function YoutubeLayout(props: { children: React.ReactNode }) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-5 py-4">
          <Link href="/" className="text-base font-semibold">
            ← OpenBrief
          </Link>
          <nav className="flex items-center gap-2">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "hover:bg-muted",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8">{props.children}</div>
    </main>
  );
}
