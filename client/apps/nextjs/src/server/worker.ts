import "server-only";

import { signBody, SIGNATURE_HEADER } from "@acme/validators";

import { env } from "~/env";

export async function enqueueWorkerJob(payload: unknown): Promise<void> {
  if (!env.WORKER_BASE_URL || !env.WORKER_SHARED_SECRET) {
    throw new Error(
      "Worker is not configured. Set WORKER_BASE_URL and WORKER_SHARED_SECRET.",
    );
  }
  const body = JSON.stringify(payload);
  const sig = await signBody(env.WORKER_SHARED_SECRET, body);
  const res = await fetch(`${env.WORKER_BASE_URL}/enqueue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: sig,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`worker /enqueue HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

export function workerCallbackUrl(): string {
  const base =
    env.VERCEL_ENV === "production"
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : env.VERCEL_ENV === "preview"
        ? `https://${env.VERCEL_URL}`
        : "http://127.0.0.1:3000";
  return `${base}/api/youtube/callback`;
}
