import type { Metadata } from "next";
import Link from "next/link";

import { getSession } from "~/auth/server";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function FeedbackPage() {
  const session = await getSession();
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-base font-semibold">
            ← OpenBrief
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Send feedback</h1>
          <p className="text-muted-foreground text-sm">
            Report a bug or request a feature. The more specific the better.
          </p>
        </header>
        <FeedbackForm defaultEmail={session?.user.email ?? ""} />
      </div>
    </main>
  );
}
