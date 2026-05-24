import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "~/env";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export async function putR2Object(args: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  if (!env.R2_BUCKET) {
    throw new Error("R2_BUCKET is not configured.");
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    }),
  );
}
