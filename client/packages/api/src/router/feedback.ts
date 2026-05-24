import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq } from "@acme/db";
import { feedback } from "@acme/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

const submitSchema = z.object({
  kind: z.enum(["feature", "bug"]),
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(8000),
  email: z.email().max(320).optional(),
});

export const feedbackRouter = {
  submit: publicProcedure
    .input(submitSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(feedback)
        .values({
          kind: input.kind,
          title: input.title,
          body: input.body,
          email: input.email ?? null,
          userId: ctx.session?.user.id ?? null,
        })
        .returning({ id: feedback.id });
      return { id: row?.id ?? null };
    }),

  myRecent: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: feedback.id,
        kind: feedback.kind,
        title: feedback.title,
        status: feedback.status,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(eq(feedback.userId, ctx.session.user.id))
      .orderBy(desc(feedback.createdAt))
      .limit(20);
  }),
} satisfies TRPCRouterRecord;
