import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { user } from "./auth-schema";

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const youtubeUpload = pgTable("youtube_upload", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  imageKey: t.text().notNull(),
  status: t
    .varchar({ length: 16 })
    .$type<"queued" | "running" | "succeeded" | "failed">()
    .notNull()
    .default("queued"),
  capturedAt: t.date({ mode: "string" }),
  dailyAverageMin: t.integer(),
  pctChangeFromLastWeek: t.numeric({ precision: 6, scale: 2 }),
  todayMin: t.integer(),
  last7DaysMin: t.integer(),
  dailyBreakdown: t.jsonb().$type<DailyBreakdownEntry[] | null>(),
  remindersJson: t.jsonb().$type<RemindersJson | null>(),
  dailyLimitsJson: t.jsonb().$type<DailyLimitsJson | null>(),
  rawModelOutput: t.jsonb(),
  extractionError: t.text(),
  optInRanking: t.boolean().notNull().default(false),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  completedAt: t.timestamp({ withTimezone: true }),
  deletedAt: t.timestamp({ withTimezone: true }),
}));

export const youtubeWeeklyStat = pgTable(
  "youtube_weekly_stat",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: t.date({ mode: "string" }).notNull(),
    totalMin: t.integer().notNull(),
    dailyAverageMin: t.integer().notNull(),
    deltaVsPrevWeekPct: t.numeric({ precision: 6, scale: 2 }),
    sourceUploadId: t
      .uuid()
      .notNull()
      .references(() => youtubeUpload.id, { onDelete: "cascade" }),
    optInRanking: t.boolean().notNull().default(false),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex("youtube_weekly_stat_user_week_idx").on(
      table.userId,
      table.weekStart,
    ),
  ],
);

export interface DailyBreakdownEntry {
  label: string;
  minutes: number;
  isToday?: boolean;
}

export interface RemindersJson {
  takeBreakEveryMin: number | null;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
}

export interface DailyLimitsJson {
  shortsFeedLimitMin: number | null;
}

export const feedback = pgTable("feedback", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  kind: t
    .varchar({ length: 16 })
    .$type<"feature" | "bug">()
    .notNull(),
  title: t.varchar({ length: 200 }).notNull(),
  body: t.text().notNull(),
  email: t.varchar({ length: 320 }),
  userId: t.text().references(() => user.id, { onDelete: "set null" }),
  status: t
    .varchar({ length: 16 })
    .$type<"open" | "triaged" | "closed">()
    .notNull()
    .default("open"),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
}));

export * from "./auth-schema";
