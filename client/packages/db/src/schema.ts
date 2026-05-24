import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import type { PortableShareManifestV1 } from "@acme/openbrief-content";

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
  kind: t.varchar({ length: 16 }).$type<"feature" | "bug">().notNull(),
  title: t.varchar({ length: 200 }).notNull(),
  body: t.text().notNull(),
  email: t.varchar({ length: 320 }),
  source: t
    .varchar({ length: 16 })
    .$type<"nextjs" | "tauri" | "expo">()
    .notNull()
    .default("nextjs"),
  platform: t.varchar({ length: 32 }),
  diagnostics: t
    .jsonb()
    .$type<Record<string, string | number | boolean | null>>(),
  githubIssueUrl: t.text(),
  userId: t.text().references(() => user.id, { onDelete: "set null" }),
  status: t
    .varchar({ length: 16 })
    .$type<"open" | "triaged" | "closed">()
    .notNull()
    .default("open"),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
}));

export const shareSession = pgTable(
  "share_session",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    slug: t.varchar({ length: 48 }).notNull(),
    ownerUserId: t.text().references(() => user.id, { onDelete: "set null" }),
    status: t
      .varchar({ length: 16 })
      .$type<
        | "waiting"
        | "joined"
        | "approved"
        | "transferring"
        | "complete"
        | "revoked"
        | "expired"
      >()
      .notNull()
      .default("waiting"),
    manifest: t.jsonb().$type<PortableShareManifestV1>().notNull(),
    passwordHash: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: t.timestamp({ withTimezone: true }).notNull(),
    revokedAt: t.timestamp({ withTimezone: true }),
    completedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    uniqueIndex("share_session_slug_idx").on(table.slug),
    index("share_session_owner_idx").on(table.ownerUserId),
    index("share_session_expires_idx").on(table.expiresAt),
  ],
);

export const sharePeer = pgTable(
  "share_peer",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => shareSession.id, { onDelete: "cascade" }),
    role: t.varchar({ length: 16 }).$type<"sender" | "receiver">().notNull(),
    displayName: t.varchar({ length: 120 }),
    status: t
      .varchar({ length: 16 })
      .$type<"joined" | "approved" | "rejected" | "left">()
      .notNull()
      .default("joined"),
    publicKey: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    index("share_peer_session_idx").on(table.sessionId),
    index("share_peer_status_idx").on(table.status),
  ],
);

export const shareSignal = pgTable(
  "share_signal",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => shareSession.id, { onDelete: "cascade" }),
    senderPeerId: t
      .uuid()
      .notNull()
      .references(() => sharePeer.id, { onDelete: "cascade" }),
    receiverPeerId: t.uuid().references(() => sharePeer.id, {
      onDelete: "cascade",
    }),
    kind: t
      .varchar({ length: 24 })
      .$type<"offer" | "answer" | "ice-candidate" | "local-http" | "status">()
      .notNull(),
    payload: t.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    consumedAt: t.timestamp({ withTimezone: true }),
    expiresAt: t.timestamp({ withTimezone: true }).notNull(),
  }),
  (table) => [
    index("share_signal_session_receiver_idx").on(
      table.sessionId,
      table.receiverPeerId,
    ),
    index("share_signal_expires_idx").on(table.expiresAt),
  ],
);

export * from "./auth-schema";
