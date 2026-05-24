import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gte, isNull, lte, sql } from "@acme/db";
import type { db } from "@acme/db/client";
import {
  user,
  youtubeUpload,
  youtubeWeeklyStat,
} from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

type Db = typeof db;

export interface ConsultingSuggestion {
  id:
    | "enable_break_reminder"
    | "enable_bedtime_reminder"
    | "lower_daily_average"
    | "limit_shorts_weekend"
    | "celebrate_decrease";
  severity: "info" | "warn" | "celebrate";
  title: string;
  body: string;
}

export const youtubeRouter = {
  myUploads: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: youtubeUpload.id,
        status: youtubeUpload.status,
        createdAt: youtubeUpload.createdAt,
        completedAt: youtubeUpload.completedAt,
        capturedAt: youtubeUpload.capturedAt,
        dailyAverageMin: youtubeUpload.dailyAverageMin,
        extractionError: youtubeUpload.extractionError,
      })
      .from(youtubeUpload)
      .where(
        and(
          eq(youtubeUpload.userId, ctx.session.user.id),
          isNull(youtubeUpload.deletedAt),
        ),
      )
      .orderBy(desc(youtubeUpload.createdAt))
      .limit(20);
  }),

  uploadById: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(youtubeUpload)
        .where(
          and(
            eq(youtubeUpload.id, input.id),
            eq(youtubeUpload.userId, ctx.session.user.id),
            isNull(youtubeUpload.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    }),

  latestStats: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(youtubeUpload)
      .where(
        and(
          eq(youtubeUpload.userId, ctx.session.user.id),
          eq(youtubeUpload.status, "succeeded"),
          isNull(youtubeUpload.deletedAt),
        ),
      )
      .orderBy(desc(youtubeUpload.completedAt))
      .limit(1);

    if (!row) return null;
    return { upload: row, suggestions: buildSuggestions(row) };
  }),

  myStreak: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        weekStart: youtubeWeeklyStat.weekStart,
        deltaVsPrevWeekPct: youtubeWeeklyStat.deltaVsPrevWeekPct,
      })
      .from(youtubeWeeklyStat)
      .where(eq(youtubeWeeklyStat.userId, ctx.session.user.id))
      .orderBy(desc(youtubeWeeklyStat.weekStart))
      .limit(52);

    let currentStreak = 0;
    let longestStreak = 0;
    let run = 0;
    let isCurrentRun = true;
    for (const row of rows) {
      const delta =
        row.deltaVsPrevWeekPct === null ? null : Number(row.deltaVsPrevWeekPct);
      if (delta !== null && delta < 0) {
        run += 1;
        if (isCurrentRun) currentStreak = run;
        longestStreak = Math.max(longestStreak, run);
      } else {
        isCurrentRun = false;
        run = 0;
      }
    }
    return { currentStreak, longestStreak };
  }),

  rankingBiggestDecrease: protectedProcedure
    .input(
      z
        .object({
          weekStart: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .default({ limit: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const weekStart = input.weekStart ?? (await latestWeekStart(ctx.db));
      if (!weekStart) return { weekStart: null, entries: [] };
      const rows = await ctx.db
        .select({
          userId: youtubeWeeklyStat.userId,
          name: user.name,
          image: user.image,
          deltaVsPrevWeekPct: youtubeWeeklyStat.deltaVsPrevWeekPct,
          dailyAverageMin: youtubeWeeklyStat.dailyAverageMin,
        })
        .from(youtubeWeeklyStat)
        .innerJoin(user, eq(user.id, youtubeWeeklyStat.userId))
        .where(
          and(
            eq(youtubeWeeklyStat.weekStart, weekStart),
            eq(youtubeWeeklyStat.optInRanking, true),
          ),
        )
        .orderBy(sql`${youtubeWeeklyStat.deltaVsPrevWeekPct} ASC NULLS LAST`)
        .limit(input.limit);
      return {
        weekStart,
        entries: rows.map((r, i) => ({
          rank: i + 1,
          userId: r.userId,
          name: r.name,
          image: r.image,
          deltaPct:
            r.deltaVsPrevWeekPct === null ? null : Number(r.deltaVsPrevWeekPct),
          dailyAverageMin: r.dailyAverageMin,
        })),
      };
    }),

  rankingLongestStreak: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(20),
        })
        .default({ limit: 20 }),
    )
    .query(async ({ ctx, input }) => {
      const weekStart = await latestWeekStart(ctx.db);
      if (!weekStart) return { weekStart: null, entries: [] };
      const earliest = shiftDays(weekStart, -52 * 7);
      const rows = await ctx.db
        .select({
          userId: youtubeWeeklyStat.userId,
          weekStart: youtubeWeeklyStat.weekStart,
          deltaVsPrevWeekPct: youtubeWeeklyStat.deltaVsPrevWeekPct,
          name: user.name,
          image: user.image,
          optInRanking: youtubeWeeklyStat.optInRanking,
        })
        .from(youtubeWeeklyStat)
        .innerJoin(user, eq(user.id, youtubeWeeklyStat.userId))
        .where(
          and(
            gte(youtubeWeeklyStat.weekStart, earliest),
            lte(youtubeWeeklyStat.weekStart, weekStart),
          ),
        )
        .orderBy(youtubeWeeklyStat.userId, desc(youtubeWeeklyStat.weekStart));

      interface StreakEntry {
        name: string;
        image: string | null;
        optIn: boolean;
        streak: number;
        broken: boolean;
      }
      const byUser = new Map<string, StreakEntry>();
      for (const row of rows) {
        let entry = byUser.get(row.userId);
        if (!entry) {
          entry = {
            name: row.name,
            image: row.image,
            optIn: row.optInRanking,
            streak: 0,
            broken: false,
          };
          byUser.set(row.userId, entry);
        }
        if (entry.broken) continue;
        const delta =
          row.deltaVsPrevWeekPct === null
            ? null
            : Number(row.deltaVsPrevWeekPct);
        if (delta !== null && delta < 0) entry.streak += 1;
        else entry.broken = true;
      }

      const sorted = [...byUser.entries()]
        .filter(([, v]) => v.optIn && v.streak > 0)
        .sort((a, b) => b[1].streak - a[1].streak)
        .slice(0, input.limit)
        .map(([userId, v], i) => ({
          rank: i + 1,
          userId,
          name: v.name,
          image: v.image,
          streak: v.streak,
        }));

      return { weekStart, entries: sorted };
    }),

  setRankingOptIn: protectedProcedure
    .input(z.object({ uploadId: z.uuid(), optInRanking: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(youtubeUpload)
        .set({ optInRanking: input.optInRanking })
        .where(
          and(
            eq(youtubeUpload.id, input.uploadId),
            eq(youtubeUpload.userId, ctx.session.user.id),
          ),
        );
      await ctx.db
        .update(youtubeWeeklyStat)
        .set({ optInRanking: input.optInRanking })
        .where(
          and(
            eq(youtubeWeeklyStat.sourceUploadId, input.uploadId),
            eq(youtubeWeeklyStat.userId, ctx.session.user.id),
          ),
        );
      return { ok: true };
    }),
} satisfies TRPCRouterRecord;

type YoutubeUploadRow = typeof youtubeUpload.$inferSelect;

function buildSuggestions(row: YoutubeUploadRow): ConsultingSuggestion[] {
  const out: ConsultingSuggestion[] = [];
  const dailyAvg = row.dailyAverageMin ?? 0;
  const pct = row.pctChangeFromLastWeek
    ? Number(row.pctChangeFromLastWeek)
    : 0;
  const reminders = row.remindersJson;
  const limits = row.dailyLimitsJson;

  if (pct < 0) {
    out.push({
      id: "celebrate_decrease",
      severity: "celebrate",
      title: `Watch time is down ${Math.abs(pct).toFixed(0)}% from last week`,
      body: "Keep the streak going by lowering your daily limit a little further this week.",
    });
  }

  if (dailyAvg > 180 && reminders?.bedtimeStart == null) {
    out.push({
      id: "enable_bedtime_reminder",
      severity: "warn",
      title: "Turn on the bedtime reminder",
      body: "Your daily average is over 3 hours. A 23:00–05:00 bedtime reminder cuts late-night sessions.",
    });
  }

  if (reminders?.takeBreakEveryMin == null) {
    out.push({
      id: "enable_break_reminder",
      severity: "info",
      title: "Enable 30-minute break reminders",
      body: "YouTube can prompt you to step away every 30 minutes. It is the lightest possible nudge.",
    });
  }

  if (pct > 0 && dailyAvg > 60) {
    const target = Math.max(15, Math.round((dailyAvg * 0.85) / 5) * 5);
    out.push({
      id: "lower_daily_average",
      severity: "warn",
      title: `Set a daily limit of ${target} min`,
      body: `Your daily average is ${dailyAvg} min and rising. A ${target}-min cap (≈15% lower) is a reachable first step.`,
    });
  }

  const weekend = (row.dailyBreakdown ?? []).filter((d) =>
    /sat|sun/i.test(d.label),
  );
  if (
    weekend.length === 2 &&
    weekend.every((d) => d.minutes > Math.max(120, dailyAvg * 1.25)) &&
    limits?.shortsFeedLimitMin == null
  ) {
    out.push({
      id: "limit_shorts_weekend",
      severity: "info",
      title: "Set a Shorts feed limit for weekends",
      body: "Your weekend bars are noticeably higher than weekdays — the Shorts feed limit is the most common culprit.",
    });
  }

  return out;
}

async function latestWeekStart(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ weekStart: youtubeWeeklyStat.weekStart })
    .from(youtubeWeeklyStat)
    .orderBy(desc(youtubeWeeklyStat.weekStart))
    .limit(1);
  return row?.weekStart ?? null;
}

function shiftDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
