import { z } from "zod/v4";

export const portableAssetRoots = ["videos", "audios", "pdfs", "csvs"] as const;
export const portableAssetKinds = ["video", "audio", "pdf", "csv"] as const;
export const portableArtifactKinds = [
  "manifest",
  "thumbnail",
  "transcript",
  "transcript-variant",
  "summary",
  "chat",
  "podcast",
  "voice-message",
  "audio",
  "pdf",
  "csv",
  "source-media",
  "metadata",
  "other",
] as const;

export type PortableAssetRoot = (typeof portableAssetRoots)[number];
export type PortableAssetKind = (typeof portableAssetKinds)[number];
export type PortableArtifactKind = (typeof portableArtifactKinds)[number];

export const PortableAssetKindSchema = z.enum(portableAssetKinds);
export const PortableArtifactKindSchema = z.enum(portableArtifactKinds);

export const PortableAssetSchema = z.object({
  id: z.string().min(1),
  sourceType: PortableAssetKindSchema,
  sourceKind: z.string().min(1),
  title: z.string().min(1),
  originalUri: z.string().min(1),
  originalFileName: z.string().min(1).optional(),
  durationSeconds: z.number().nonnegative().optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().min(1).optional(),
  thumbnailPath: z.string().min(1).optional(),
  createdAtIso: z.iso.datetime(),
});

export const PortableArtifactSchema = z.object({
  id: z.string().min(1),
  kind: PortableArtifactKindSchema,
  path: z.string().min(1),
  label: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

export const PortableShareManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    app: z.literal("openbrief"),
    id: z.string().min(1),
    createdAtIso: z.iso.datetime(),
    asset: PortableAssetSchema,
    artifacts: z.array(PortableArtifactSchema),
    transfer: z
      .object({
        mode: z.enum([
          "gateway-assisted-local-http",
          "gateway-assisted-webrtc",
        ]),
        requiresApproval: z.boolean().default(true),
      })
      .optional(),
  })
  .superRefine((manifest, ctx) => {
    for (const artifact of manifest.artifacts) {
      const result = validatePortableArtifactPath({
        assetId: manifest.asset.id,
        sourceType: manifest.asset.sourceType,
        path: artifact.path,
      });
      if (!result.ok) {
        ctx.addIssue({
          code: "custom",
          path: ["artifacts", manifest.artifacts.indexOf(artifact), "path"],
          message: result.reason,
        });
      }
    }
  });

export const PortableTranscriptDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().min(1),
  segments: z.array(
    z.object({
      id: z.string().min(1),
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative().optional(),
      text: z.string(),
      sourceKind: z.string().min(1),
    }),
  ),
});

export const PortableSummaryDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().min(1),
  id: z.string().min(1),
  markdown: z.string(),
  createdAtIso: z.iso.datetime(),
});

export const PortableChatSessionV1Schema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().min(1),
  sessionId: z.string().min(1),
  messages: z.array(
    z.object({
      id: z.string().min(1),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdAtIso: z.iso.datetime(),
    }),
  ),
});

export type PortableAsset = z.infer<typeof PortableAssetSchema>;
export type PortableArtifact = z.infer<typeof PortableArtifactSchema>;
export type PortableShareManifestV1 = z.infer<
  typeof PortableShareManifestV1Schema
>;
export type PortableTranscriptDocumentV1 = z.infer<
  typeof PortableTranscriptDocumentV1Schema
>;
export type PortableSummaryDocumentV1 = z.infer<
  typeof PortableSummaryDocumentV1Schema
>;
export type PortableChatSessionV1 = z.infer<typeof PortableChatSessionV1Schema>;

export function portableAssetRoot(
  sourceType: PortableAssetKind,
): PortableAssetRoot {
  switch (sourceType) {
    case "audio":
      return "audios";
    case "csv":
      return "csvs";
    case "pdf":
      return "pdfs";
    case "video":
      return "videos";
  }
}

export function portableAssetRootPath(
  sourceType: PortableAssetKind,
  assetId: string,
) {
  return `${portableAssetRoot(sourceType)}/${sanitizePortablePathSegment(assetId)}`;
}

export function validatePortableArtifactPath({
  assetId,
  sourceType,
  path,
}: {
  assetId: string;
  sourceType: PortableAssetKind;
  path: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!path.trim()) return { ok: false, reason: "path_empty" };
  if (path.includes("\\")) return { ok: false, reason: "path_backslash" };
  if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) {
    return { ok: false, reason: "path_absolute" };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    return { ok: false, reason: "path_url" };
  }

  const segments = path.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return { ok: false, reason: "path_traversal" };
  }
  if (!portableAssetRoots.includes(segments[0] as PortableAssetRoot)) {
    return { ok: false, reason: "path_root_unsupported" };
  }

  const root = portableAssetRootPath(sourceType, assetId);
  if (path === root || !path.startsWith(`${root}/`)) {
    return { ok: false, reason: "path_outside_asset_root" };
  }

  return { ok: true };
}

export function assertPortableArtifactPath(input: {
  assetId: string;
  sourceType: PortableAssetKind;
  path: string;
}) {
  const result = validatePortableArtifactPath(input);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return input.path;
}

export function isPortableAssetKind(value: string): value is PortableAssetKind {
  return portableAssetKinds.includes(value as PortableAssetKind);
}

function sanitizePortablePathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/]+/g, "-")
      .replace(/\.\.+/g, ".")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "untitled"
  );
}
