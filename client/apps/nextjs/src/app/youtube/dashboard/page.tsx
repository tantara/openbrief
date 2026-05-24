import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  prefetch(trpc.youtube.latestStats.queryOptions());
  prefetch(trpc.youtube.myStreak.queryOptions());

  return (
    <HydrateClient>
      <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Time management</h1>
            <p className="text-muted-foreground text-sm">
              Snapshot of your most recent YouTube screenshot.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/youtube/upload">Upload another</Link>
          </Button>
        </header>
        <DashboardClient />
      </div>
    </HydrateClient>
  );
}
