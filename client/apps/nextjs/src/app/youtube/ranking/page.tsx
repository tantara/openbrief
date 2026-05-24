import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { RankingClient } from "./ranking-client";

export default async function RankingPage() {
  const session = await getSession();
  if (!session) redirect("/");

  prefetch(trpc.youtube.rankingBiggestDecrease.queryOptions({ limit: 20 }));
  prefetch(trpc.youtube.rankingLongestStreak.queryOptions({ limit: 20 }));

  return (
    <HydrateClient>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Ranking</h1>
          <p className="text-muted-foreground text-sm">
            Only users who opt in are shown. Rankings refresh weekly.
          </p>
        </header>
        <RankingClient />
      </div>
    </HydrateClient>
  );
}
