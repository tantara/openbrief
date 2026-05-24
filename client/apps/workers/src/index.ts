import type { YoutubeCallbackPayload, YoutubeEnqueueJob } from "@acme/validators";
import {
  signBody,
  SIGNATURE_HEADER,
  verifyBody,
  youtubeEnqueueSchema,
} from "@acme/validators";

import { extractYoutubeStats } from "./gemini";

export interface Env {
  WORKER_SHARED_SECRET: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  YT_R2: R2Bucket;
  YT_OCR_QUEUE: Queue<YoutubeEnqueueJob>;
  NEXT_BASE_URL: string;
  YT_EXTRACTION_MODEL: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (url.pathname === "/enqueue" && req.method === "POST") {
      return handleEnqueue(req, env);
    }

    return new Response("not found", { status: 404 });
  },

  async queue(
    batch: MessageBatch<YoutubeEnqueueJob>,
    env: Env,
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await runOcrJob(msg.body, env);
        msg.ack();
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const isFinalAttempt = msg.attempts >= 3;
        console.warn("[yt-ocr] failed attempt", {
          uploadId: msg.body.uploadId,
          attempts: msg.attempts,
          final: isFinalAttempt,
          error: errorMsg,
        });
        if (isFinalAttempt) {
          await postCallback(msg.body, env, {
            uploadId: msg.body.uploadId,
            status: "failed",
            error: errorMsg,
          });
          msg.ack();
        } else {
          msg.retry();
        }
      }
    }
  },
};

async function handleEnqueue(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get(SIGNATURE_HEADER) ?? "";
  if (!(await verifyBody(env.WORKER_SHARED_SECRET, body, sig))) {
    return new Response("unauthorized", { status: 401 });
  }

  let parsed: YoutubeEnqueueJob;
  try {
    parsed = youtubeEnqueueSchema.parse(JSON.parse(body));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "invalid payload" },
      { status: 400 },
    );
  }

  await env.YT_OCR_QUEUE.send(parsed);
  return Response.json(
    { status: "queued", uploadId: parsed.uploadId },
    { status: 202 },
  );
}

async function runOcrJob(
  job: YoutubeEnqueueJob,
  env: Env,
): Promise<void> {
  const startedAt = Date.now();
  console.log("[yt-ocr] start", {
    uploadId: job.uploadId,
    imageKey: job.imageKey,
  });

  await postCallback(job, env, { uploadId: job.uploadId, status: "running" });

  const obj = await env.YT_R2.get(job.imageKey);
  if (!obj) {
    throw new Error(`screenshot not found at ${job.imageKey}`);
  }
  const bytes = await obj.arrayBuffer();
  const mimeType = obj.httpMetadata?.contentType ?? "image/jpeg";

  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured");
  }

  const { extraction, raw } = await extractYoutubeStats({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: env.YT_EXTRACTION_MODEL || "gemini-2.0-flash",
    imageBytes: bytes,
    mimeType,
  });

  await postCallback(job, env, {
    uploadId: job.uploadId,
    status: "succeeded",
    extraction,
    rawModelOutput: raw,
  });

  console.log("[yt-ocr] succeeded", {
    uploadId: job.uploadId,
    elapsedMs: Date.now() - startedAt,
  });
}

async function postCallback(
  job: YoutubeEnqueueJob,
  env: Env,
  payload: YoutubeCallbackPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const sig = await signBody(env.WORKER_SHARED_SECRET, body);
  try {
    const res = await fetch(job.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: sig,
      },
      body,
    });
    if (!res.ok) {
      console.warn("[yt-ocr] callback non-2xx", {
        uploadId: job.uploadId,
        status: payload.status,
        http: res.status,
      });
    }
  } catch (e) {
    console.warn("[yt-ocr] callback delivery threw", {
      uploadId: job.uploadId,
      status: payload.status,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
