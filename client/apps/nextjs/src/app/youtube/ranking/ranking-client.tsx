"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";

export function RankingClient() {
  const trpc = useTRPC();
  const decrease = useQuery(
    trpc.youtube.rankingBiggestDecrease.queryOptions({ limit: 20 }),
  );
  const streak = useQuery(
    trpc.youtube.rankingLongestStreak.queryOptions({ limit: 20 }),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Board
        title="Biggest decrease this week"
        subtitle={
          decrease.data?.weekStart
            ? `Week of ${decrease.data.weekStart}`
            : "Waiting for first uploads"
        }
        loading={decrease.isLoading}
        rows={
          decrease.data?.entries.map((e) => ({
            rank: e.rank,
            userId: e.userId,
            name: e.name,
            image: e.image,
            primary:
              e.deltaPct === null
                ? "—"
                : `${e.deltaPct > 0 ? "+" : ""}${e.deltaPct.toFixed(1)}%`,
            primaryTone:
              e.deltaPct !== null && e.deltaPct < 0 ? "good" : "neutral",
            secondary: `${e.dailyAverageMin} min/day avg`,
          })) ?? []
        }
      />
      <Board
        title="Longest decreasing streak"
        subtitle="Consecutive weeks of going down"
        loading={streak.isLoading}
        rows={
          streak.data?.entries.map((e) => ({
            rank: e.rank,
            userId: e.userId,
            name: e.name,
            image: e.image,
            primary: `${e.streak} ${e.streak === 1 ? "week" : "weeks"}`,
            primaryTone: "good",
            secondary: undefined,
          })) ?? []
        }
      />
    </div>
  );
}

interface BoardRow {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  primary: string;
  primaryTone: "good" | "neutral";
  secondary?: string;
}

function Board(props: {
  title: string;
  subtitle: string;
  loading: boolean;
  rows: BoardRow[];
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-4 rounded-lg border p-6">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        <p className="text-muted-foreground text-xs">{props.subtitle}</p>
      </header>
      {props.loading && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      {!props.loading && props.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No entries yet.</p>
      )}
      {props.rows.length > 0 && (
        <ol className="flex flex-col gap-2">
          {props.rows.map((row) => (
            <li
              key={row.userId}
              className="border-border flex items-center gap-3 rounded-md border p-3"
            >
              <span className="text-muted-foreground w-6 text-right text-sm font-mono">
                {row.rank}
              </span>
              {row.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.image}
                  alt=""
                  className="size-8 rounded-full"
                />
              ) : (
                <span className="bg-muted size-8 rounded-full" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{row.name}</p>
                {row.secondary && (
                  <p className="text-muted-foreground text-xs">{row.secondary}</p>
                )}
              </div>
              <span
                className={
                  row.primaryTone === "good"
                    ? "text-sm font-semibold text-emerald-500"
                    : "text-sm font-semibold"
                }
              >
                {row.primary}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
