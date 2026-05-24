import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { YoutubeCallbackPayload } from "@acme/validators";
import { and, eq, isNull } from "@acme/db";
import { db } from "@acme/db/client";
import { youtubeUpload, youtubeWeeklyStat } from "@acme/db/schema";
import {
  SIGNATURE_HEADER,
  verifyBody,
  youtubeCallbackSchema,
} from "@acme/validators";

import { env } from "~/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!env.WORKER_SHARED_SECRET) {
    return NextResponse.json(
      { error: "callback not configured" },
      { status: 503 },
    );
  }

  const sig = req.headers.get(SIGNATURE_HEADER) ?? "";
  const body = await req.text();
  if (!(await verifyBody(env.WORKER_SHARED_SECRET, body, sig))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: YoutubeCallbackPayload;
  try {
    parsed = youtubeCallbackSchema.parse(JSON.parse(body));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid payload" },
      { status: 400 },
    );
  }

  const updates: Partial<typeof youtubeUpload.$inferInsert> = {
    status: parsed.status,
  };

  if (parsed.status === "succeeded" && parsed.extraction) {
    const x = parsed.extraction;
    updates.capturedAt = x.capturedAt;
    updates.dailyAverageMin = x.dailyAverageMin;
    updates.pctChangeFromLastWeek = String(x.pctChangeFromLastWeek);
    updates.todayMin = x.todayMin;
    updates.last7DaysMin = x.last7DaysMin;
    updates.dailyBreakdown = x.dailyBreakdown;
    updates.remindersJson = x.reminders;
    updates.dailyLimitsJson = x.dailyLimits;
    updates.rawModelOutput = parsed.rawModelOutput ?? null;
    updates.extractionError = null;
  } else if (parsed.status === "failed") {
    updates.extractionError = parsed.error ?? "unknown error";
  }

  if (parsed.status === "succeeded" || parsed.status === "failed") {
    updates.completedAt = new Date();
  }

  const [row] = await db
    .update(youtubeUpload)
    .set(updates)
    .where(
      and(
        eq(youtubeUpload.id, parsed.uploadId),
        isNull(youtubeUpload.deletedAt),
      ),
    )
    .returning({
      id: youtubeUpload.id,
      userId: youtubeUpload.userId,
      optInRanking: youtubeUpload.optInRanking,
    });

  if (!row) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (parsed.status === "succeeded" && parsed.extraction) {
    await upsertWeeklyStat({
      uploadId: row.id,
      userId: row.userId,
      optInRanking: row.optInRanking,
      capturedAt: parsed.extraction.capturedAt,
      dailyAverageMin: parsed.extraction.dailyAverageMin,
      last7DaysMin: parsed.extraction.last7DaysMin,
    });
  }

  return NextResponse.json({ ok: true });
}

async function upsertWeeklyStat(args: {
  uploadId: string;
  userId: string;
  optInRanking: boolean;
  capturedAt: string;
  dailyAverageMin: number;
  last7DaysMin: number;
}): Promise<void> {
  const weekStart = isoWeekStart(args.capturedAt);
  const prevWeekStart = shiftDays(weekStart, -7);

  const [prev] = await db
    .select({ dailyAverageMin: youtubeWeeklyStat.dailyAverageMin })
    .from(youtubeWeeklyStat)
    .where(
      and(
        eq(youtubeWeeklyStat.userId, args.userId),
        eq(youtubeWeeklyStat.weekStart, prevWeekStart),
      ),
    )
    .limit(1);

  const deltaPct =
    prev && prev.dailyAverageMin > 0
      ? ((args.dailyAverageMin - prev.dailyAverageMin) /
          prev.dailyAverageMin) *
        100
      : null;

  await db
    .insert(youtubeWeeklyStat)
    .values({
      userId: args.userId,
      weekStart,
      totalMin: args.last7DaysMin,
      dailyAverageMin: args.dailyAverageMin,
      deltaVsPrevWeekPct: deltaPct === null ? null : String(deltaPct.toFixed(2)),
      sourceUploadId: args.uploadId,
      optInRanking: args.optInRanking,
    })
    .onConflictDoUpdate({
      target: [youtubeWeeklyStat.userId, youtubeWeeklyStat.weekStart],
      set: {
        totalMin: args.last7DaysMin,
        dailyAverageMin: args.dailyAverageMin,
        deltaVsPrevWeekPct:
          deltaPct === null ? null : String(deltaPct.toFixed(2)),
        sourceUploadId: args.uploadId,
        optInRanking: args.optInRanking,
      },
    });
}

/** ISO week start (Monday) as YYYY-MM-DD. Treats the date string as UTC. */
function isoWeekStart(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function shiftDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
