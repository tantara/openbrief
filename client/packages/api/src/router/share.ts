import { createHash, randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { db as appDb } from "@acme/db/client";
import type { PortableShareManifestV1 } from "@acme/openbrief-content";
import { and, desc, eq, gt, inArray, isNull, or } from "@acme/db";
import { sharePeer, shareSession, shareSignal } from "@acme/db/schema";
import { PortableShareManifestV1Schema } from "@acme/openbrief-content";

import { protectedProcedure, publicProcedure } from "../trpc";

const shareSlugSchema = z.string().min(6).max(48);
const peerIdSchema = z.uuid();
const sessionIdSchema = z.uuid();
const signalKindSchema = z.enum([
  "offer",
  "answer",
  "ice-candidate",
  "local-http",
  "status",
]);

const createInputSchema = z.object({
  manifest: PortableShareManifestV1Schema,
  password: z.string().min(4).max(128).optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(30),
});

const verifyInputSchema = z.object({
  slug: shareSlugSchema,
  password: z.string().max(128).optional(),
});

export const shareRouter = {
  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      const slug = createShareSlug();
      const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
      const [session] = await ctx.db
        .insert(shareSession)
        .values({
          slug,
          ownerUserId: ctx.session.user.id,
          manifest: input.manifest,
          passwordHash: input.password ? hashPassword(input.password) : null,
          expiresAt,
        })
        .returning({
          id: shareSession.id,
          slug: shareSession.slug,
          expiresAt: shareSession.expiresAt,
        });

      if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sender] = await ctx.db
        .insert(sharePeer)
        .values({
          sessionId: session.id,
          role: "sender",
          displayName: "OpenBrief desktop",
          status: "approved",
        })
        .returning({ id: sharePeer.id });

      return {
        sessionId: session.id,
        senderPeerId: sender?.id ?? null,
        slug: session.slug,
        expiresAt: session.expiresAt,
      };
    }),

  resolve: publicProcedure
    .input(z.object({ slug: shareSlugSchema }))
    .query(async ({ ctx, input }) => {
      const session = await getLiveSessionBySlug(ctx.db, input.slug);

      return {
        sessionId: session.id,
        slug: session.slug,
        status: session.status,
        expiresAt: session.expiresAt,
        requiresPassword: Boolean(session.passwordHash),
        preview: previewManifest(session.manifest),
      };
    }),

  verify: publicProcedure
    .input(verifyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await getLiveSessionBySlug(ctx.db, input.slug);
      verifyPasswordOrThrow(session.passwordHash, input.password);
      return { ok: true };
    }),

  join: publicProcedure
    .input(
      verifyInputSchema.extend({
        displayName: z.string().min(1).max(120).default("OpenBrief mobile"),
        publicKey: z.string().max(4096).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getLiveSessionBySlug(ctx.db, input.slug);
      verifyPasswordOrThrow(session.passwordHash, input.password);

      const [peer] = await ctx.db
        .insert(sharePeer)
        .values({
          sessionId: session.id,
          role: "receiver",
          displayName: input.displayName,
          publicKey: input.publicKey ?? null,
        })
        .returning({ id: sharePeer.id });

      await ctx.db
        .update(shareSession)
        .set({ status: "joined" })
        .where(eq(shareSession.id, session.id));

      return { sessionId: session.id, peerId: peer?.id ?? null };
    }),

  approve: protectedProcedure
    .input(
      z.object({
        slug: shareSlugSchema,
        peerId: peerIdSchema,
        approved: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getOwnedLiveSession(ctx, input.slug);
      const peerStatus = input.approved ? "approved" : "rejected";

      await ctx.db
        .update(sharePeer)
        .set({ status: peerStatus, lastSeenAt: new Date() })
        .where(
          and(
            eq(sharePeer.id, input.peerId),
            eq(sharePeer.sessionId, session.id),
          ),
        );
      await ctx.db
        .update(shareSession)
        .set({ status: input.approved ? "approved" : "waiting" })
        .where(eq(shareSession.id, session.id));

      return { ok: true, status: input.approved ? "approved" : "waiting" };
    }),

  sendSignal: publicProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        senderPeerId: peerIdSchema,
        receiverPeerId: peerIdSchema.optional(),
        kind: signalKindSchema,
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureLiveSessionById(ctx.db, input.sessionId);
      await ensurePeerInSession(ctx.db, input.sessionId, input.senderPeerId);

      const [signal] = await ctx.db
        .insert(shareSignal)
        .values({
          sessionId: input.sessionId,
          senderPeerId: input.senderPeerId,
          receiverPeerId: input.receiverPeerId ?? null,
          kind: input.kind,
          payload: input.payload,
          expiresAt: new Date(Date.now() + 10 * 60_000),
        })
        .returning({ id: shareSignal.id });

      return { id: signal?.id ?? null };
    }),

  pollSignals: publicProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        receiverPeerId: peerIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureLiveSessionById(ctx.db, input.sessionId);
      await ensurePeerInSession(ctx.db, input.sessionId, input.receiverPeerId);

      const rows = await ctx.db
        .select({
          id: shareSignal.id,
          senderPeerId: shareSignal.senderPeerId,
          kind: shareSignal.kind,
          payload: shareSignal.payload,
          createdAt: shareSignal.createdAt,
        })
        .from(shareSignal)
        .where(
          and(
            eq(shareSignal.sessionId, input.sessionId),
            isNull(shareSignal.consumedAt),
            gt(shareSignal.expiresAt, new Date()),
            or(
              isNull(shareSignal.receiverPeerId),
              eq(shareSignal.receiverPeerId, input.receiverPeerId),
            ),
          ),
        )
        .orderBy(desc(shareSignal.createdAt))
        .limit(50);

      if (rows.length > 0) {
        await ctx.db
          .update(shareSignal)
          .set({ consumedAt: new Date() })
          .where(
            inArray(
              shareSignal.id,
              rows.map((row) => row.id),
            ),
          );
      }

      return rows.reverse();
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        slug: shareSlugSchema,
        status: z.enum(["transferring", "complete"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getOwnedLiveSession(ctx, input.slug);
      await ctx.db
        .update(shareSession)
        .set({
          status: input.status,
          completedAt: input.status === "complete" ? new Date() : null,
        })
        .where(eq(shareSession.id, session.id));
      return { ok: true };
    }),

  revoke: protectedProcedure
    .input(z.object({ slug: shareSlugSchema }))
    .mutation(async ({ ctx, input }) => {
      const session = await getOwnedLiveSession(ctx, input.slug);
      await ctx.db
        .update(shareSession)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(shareSession.id, session.id));
      return { ok: true };
    }),
} satisfies TRPCRouterRecord;

type Db = typeof appDb;
interface RouterCtx {
  db: Db;
  session: { user: { id: string } };
}

async function getLiveSessionBySlug(db: Db, slug: string) {
  const [session] = await db
    .select()
    .from(shareSession)
    .where(
      and(eq(shareSession.slug, slug), gt(shareSession.expiresAt, new Date())),
    )
    .limit(1);

  if (!session || session.status === "revoked") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return session;
}

async function ensureLiveSessionById(db: Db, sessionId: string) {
  const [session] = await db
    .select()
    .from(shareSession)
    .where(
      and(
        eq(shareSession.id, sessionId),
        gt(shareSession.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session || session.status === "revoked") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return session;
}

async function ensurePeerInSession(db: Db, sessionId: string, peerId: string) {
  const [peer] = await db
    .select({ id: sharePeer.id })
    .from(sharePeer)
    .where(and(eq(sharePeer.sessionId, sessionId), eq(sharePeer.id, peerId)))
    .limit(1);

  if (!peer) throw new TRPCError({ code: "FORBIDDEN" });
}

async function getOwnedLiveSession(ctx: RouterCtx, slug: string) {
  const session = await getLiveSessionBySlug(ctx.db, slug);
  if (session.ownerUserId !== ctx.session.user.id) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return session;
}

function previewManifest(manifest: PortableShareManifestV1) {
  return {
    asset: manifest.asset,
    artifactCount: manifest.artifacts.length,
    artifactKinds: [
      ...new Set(manifest.artifacts.map((artifact) => artifact.kind)),
    ],
    totalSizeBytes: manifest.artifacts.reduce(
      (total, artifact) => total + (artifact.sizeBytes ?? 0),
      0,
    ),
  };
}

function createShareSlug() {
  return randomBytes(9).toString("base64url");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${digestPassword(salt, password)}`;
}

function verifyPasswordOrThrow(
  hash: string | null,
  password: string | undefined,
) {
  if (!hash) return;
  const [salt, digest] = hash.split(":");
  if (!salt || !digest || digestPassword(salt, password ?? "") !== digest) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
}

function digestPassword(salt: string, password: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}
