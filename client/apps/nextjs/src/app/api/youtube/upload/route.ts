import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { db } from "@acme/db/client";
import { youtubeUpload } from "@acme/db/schema";

import { auth } from "~/auth/server";
import { putR2Object } from "~/server/r2";
import { enqueueWorkerJob, workerCallbackUrl } from "~/server/worker";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  const optInRanking = form.get("optInRanking") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BYTES} bytes)` },
      { status: 400 },
    );
  }

  const uploadId = crypto.randomUUID();
  const ext = EXT_BY_MIME[file.type] ?? "jpg";
  const imageKey = `uploads/${uploadId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await putR2Object({ key: imageKey, body: bytes, contentType: file.type });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "r2 put failed" },
      { status: 502 },
    );
  }

  await db.insert(youtubeUpload).values({
    id: uploadId,
    userId: session.user.id,
    imageKey,
    status: "queued",
    optInRanking,
  });

  try {
    await enqueueWorkerJob({
      uploadId,
      userId: session.user.id,
      imageKey,
      callbackUrl: workerCallbackUrl(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "enqueue failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ uploadId }, { status: 202 });
}
