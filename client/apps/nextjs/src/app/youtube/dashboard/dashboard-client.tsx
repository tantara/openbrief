"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

export function DashboardClient() {
  const trpc = useTRPC();
  const latest = useQuery(trpc.youtube.latestStats.queryOptions());
  const streak = useQuery(trpc.youtube.myStreak.queryOptions());

  if (latest.isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!latest.data) {
    return (
      <div className="border-border bg-card flex flex-col items-start gap-4 rounded-lg border p-8">
        <h2 className="text-xl font-semibold">No screenshots yet</h2>
        <p className="text-muted-foreground text-sm">
          Upload your first Time management screenshot to see your stats.
        </p>
        <Button asChild>
          <Link href="/youtube/upload">Upload a screenshot</Link>
        </Button>
      </div>
    );
  }

  const { upload, suggestions } = latest.data;
  const pct = upload.pctChangeFromLastWeek
    ? Number(upload.pctChangeFromLastWeek)
    : 0;
  const isDown = pct < 0;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Daily average" value={formatHM(upload.dailyAverageMin ?? 0)} />
        <Stat
          label="vs. last week"
          value={`${isDown ? "↓" : pct > 0 ? "↑" : "→"} ${Math.abs(pct).toFixed(0)}%`}
          tone={isDown ? "good" : pct > 0 ? "bad" : "neutral"}
        />
        <Stat label="Today" value={`${upload.todayMin ?? 0} min`} />
        <Stat label="Last 7 days" value={formatHM(upload.last7DaysMin ?? 0)} />
      </section>

      <section className="border-border bg-card flex flex-col gap-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Last 7 days</h2>
        <BarChart bars={upload.dailyBreakdown ?? []} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Current decreasing streak
          </h3>
          <p className="text-3xl font-semibold">
            {streak.data?.currentStreak ?? 0}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {streak.data?.currentStreak === 1 ? "week" : "weeks"}
            </span>
          </p>
        </div>
        <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Longest streak
          </h3>
          <p className="text-3xl font-semibold">
            {streak.data?.longestStreak ?? 0}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {streak.data?.longestStreak === 1 ? "week" : "weeks"}
            </span>
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Suggested actions</h2>
        {suggestions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing urgent. Keep doing what you are doing.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "border-border bg-card flex flex-col gap-1 rounded-lg border p-4",
                  s.severity === "warn" && "border-amber-400/50 bg-amber-400/5",
                  s.severity === "celebrate" &&
                    "border-emerald-400/50 bg-emerald-400/5",
                )}
              >
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground text-sm">{s.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat(props: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{props.label}</p>
      <p
        className={cn(
          "text-2xl font-semibold",
          props.tone === "good" && "text-emerald-500",
          props.tone === "bad" && "text-rose-500",
        )}
      >
        {props.value}
      </p>
    </div>
  );
}

function BarChart(props: { bars: { label: string; minutes: number }[] }) {
  const max = Math.max(60, ...props.bars.map((b) => b.minutes));
  const niceMax = Math.ceil(max / 60) * 60;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex h-48 items-end gap-3">
        {props.bars.map((b, i) => {
          const heightPct = (b.minutes / niceMax) * 100;
          return (
            <div
              key={`${b.label}-${i}`}
              className="flex flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-muted-foreground text-[10px]">
                {b.minutes}m
              </span>
              <div
                className="w-full rounded-t bg-sky-400/80"
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-3">
        {props.bars.map((b, i) => (
          <span
            key={`label-${b.label}-${i}`}
            className="text-muted-foreground flex-1 text-center text-xs"
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
}
