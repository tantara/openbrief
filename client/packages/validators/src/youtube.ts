import { z } from "zod/v4";

export const dailyBreakdownEntrySchema = z.object({
  label: z.string().min(1).max(16),
  minutes: z.number().int().min(0).max(1440),
  isToday: z.boolean().optional(),
});

export const remindersSchema = z.object({
  takeBreakEveryMin: z.number().int().min(1).max(720).nullable(),
  bedtimeStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm")
    .nullable(),
  bedtimeEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm")
    .nullable(),
});

export const dailyLimitsSchema = z.object({
  shortsFeedLimitMin: z.number().int().min(0).max(1440).nullable(),
});

/** The shape Gemini must return when given the screenshot. */
export const youtubeExtractionResultSchema = z.object({
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  dailyAverageMin: z.number().int().min(0).max(24 * 60),
  pctChangeFromLastWeek: z.number().min(-100).max(1000),
  todayMin: z.number().int().min(0).max(24 * 60),
  last7DaysMin: z.number().int().min(0).max(7 * 24 * 60),
  dailyBreakdown: z.array(dailyBreakdownEntrySchema).length(7),
  reminders: remindersSchema,
  dailyLimits: dailyLimitsSchema,
});

export type YoutubeExtractionResult = z.infer<
  typeof youtubeExtractionResultSchema
>;

/** Worker → Next.js callback body. */
export const youtubeCallbackSchema = z.object({
  uploadId: z.string().uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  extraction: youtubeExtractionResultSchema.optional(),
  rawModelOutput: z.unknown().optional(),
  error: z.string().optional(),
});

export type YoutubeCallbackPayload = z.infer<typeof youtubeCallbackSchema>;

/** Next.js → Worker /enqueue body. */
export const youtubeEnqueueSchema = z.object({
  uploadId: z.string().uuid(),
  userId: z.string().min(1),
  imageKey: z.string().min(1).max(512),
  callbackUrl: z.url(),
});

export type YoutubeEnqueueJob = z.infer<typeof youtubeEnqueueSchema>;
