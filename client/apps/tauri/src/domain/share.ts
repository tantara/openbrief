import type {
  ChatMessage,
  MediaSourceType,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type { PodcastDocument } from "@/domain/podcast";
import {
  createChatSessionArtifactPath,
  mediaSourceTypeForAsset,
  sanitizePathSegment,
} from "@/domain/media-library";
import { createTranscriptArtifactPath } from "@/domain/transcript-actions";

import type {
  PortableArtifact,
  PortableArtifactKind,
  PortableAsset,
  PortableShareManifestV1,
} from "@acme/openbrief-content";
import {
  assertPortableArtifactPath,
  isPortableAssetKind,
  portableAssetRootPath,
} from "@acme/openbrief-content";

export type ShareArtifactSelection = PortableArtifactKind;

export const defaultShareArtifactSelection: ShareArtifactSelection[] = [
  "manifest",
  "thumbnail",
  "transcript",
  "summary",
  "chat",
  "podcast",
  "voice-message",
  "audio",
  "pdf",
  "csv",
];

export type CreateShareManifestRequest = {
  asset: VideoAsset;
  transcript?: TranscriptSegment[];
  summaries?: SummaryDocument[];
  chatMessages?: ChatMessage[];
  podcasts?: PodcastDocument[];
  selectedKinds?: ShareArtifactSelection[];
  includeSourceMedia?: boolean;
  nowIso?: string;
  id?: string;
};

export function createShareManifest({
  asset,
  transcript = [],
  summaries = [],
  chatMessages = [],
  podcasts = [],
  selectedKinds = defaultShareArtifactSelection,
  includeSourceMedia = false,
  nowIso = new Date().toISOString(),
  id = `share-${sanitizePathSegment(asset.id)}-${sanitizePathSegment(nowIso)}`,
}: CreateShareManifestRequest): PortableShareManifestV1 {
  const sourceType = toPortableSourceType(mediaSourceTypeForAsset(asset));
  const selected = new Set(selectedKinds);
  const artifacts: PortableArtifact[] = [];

  addArtifact(artifacts, {
    asset,
    sourceType,
    selected,
    kind: "manifest",
    path: `${portableAssetRootPath(sourceType, asset.id)}/openbrief-share.json`,
    label: "Portable manifest",
    mediaType: "application/json",
  });

  if (selected.has("thumbnail") && asset.thumbnailPath) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "thumbnail",
      path: asset.thumbnailPath,
      label: "Thumbnail",
    });
  }

  if (selected.has("transcript") && transcript.length > 0) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "transcript",
      path: createTranscriptArtifactPath(asset, "transcription"),
      label: "Transcript",
      mediaType: "text/plain",
    });
  }

  for (const summary of summaries) {
    if (!summary.artifactPath) continue;
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "summary",
      path: summary.artifactPath,
      label: "Summary",
      mediaType: "text/markdown",
    });
  }

  const chatSessionIds = new Set(
    chatMessages.map((message) => message.sessionId ?? "default"),
  );
  for (const sessionId of chatSessionIds) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "chat",
      path: createChatSessionArtifactPath(asset.id, sessionId),
      label: "Chat history",
      mediaType: "application/jsonl",
    });
  }

  for (const podcast of podcasts) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "podcast",
      path: podcast.artifacts.podcastAudioPath,
      label: "Podcast audio",
      mediaType: "audio/wav",
      sizeBytes: podcast.sizeBytes,
    });
  }

  if (sourceType === "audio" && selected.has("audio")) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "audio",
      path: asset.libraryPath,
      label: "Source audio",
    });
  }

  if (sourceType === "pdf" && selected.has("pdf")) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "pdf",
      path: asset.libraryPath,
      label: "Source PDF",
      mediaType: "application/pdf",
    });
  }

  if (sourceType === "csv" && selected.has("csv")) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "csv",
      path: asset.libraryPath,
      label: "Source CSV",
      mediaType: "text/csv",
    });
  }

  if (includeSourceMedia && selected.has("source-media")) {
    addArtifact(artifacts, {
      asset,
      sourceType,
      selected,
      kind: "source-media",
      path: asset.libraryPath,
      label: "Source media",
      sizeBytes: asset.fileSizeBytes,
    });
  }

  return {
    schemaVersion: 1,
    app: "openbrief",
    id,
    createdAtIso: nowIso,
    asset: toPortableAsset(asset, sourceType),
    artifacts: dedupeArtifacts(artifacts),
    transfer: {
      mode: "gateway-assisted-local-http",
      requiresApproval: true,
    },
  };
}

export function listShareableArtifactKinds(asset: VideoAsset) {
  const sourceType = toPortableSourceType(mediaSourceTypeForAsset(asset));
  const kinds = [...defaultShareArtifactSelection];

  if (sourceType === "video") {
    kinds.push("source-media");
  }

  return kinds;
}

function addArtifact(
  artifacts: PortableArtifact[],
  input: Omit<PortableArtifact, "id"> & {
    asset: VideoAsset;
    sourceType: PortableAsset["sourceType"];
    selected: Set<ShareArtifactSelection>;
  },
) {
  if (!input.selected.has(input.kind)) return;
  const path = assertPortableArtifactPath({
    assetId: input.asset.id,
    sourceType: input.sourceType,
    path: input.path,
  });

  artifacts.push({
    id: `${input.kind}:${path}`,
    kind: input.kind,
    path,
    label: input.label,
    mediaType: input.mediaType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
  });
}

function toPortableAsset(
  asset: VideoAsset,
  sourceType: PortableAsset["sourceType"],
): PortableAsset {
  return {
    id: asset.id,
    sourceType,
    sourceKind: asset.sourceKind,
    title: asset.title,
    originalUri: asset.originalUri,
    originalFileName: asset.originalFileName,
    durationSeconds: asset.durationSeconds,
    pageCount: asset.pageCount,
    language: asset.language,
    thumbnailPath: asset.thumbnailPath,
    createdAtIso: asset.createdAtIso,
  };
}

function toPortableSourceType(
  sourceType: MediaSourceType,
): PortableAsset["sourceType"] {
  if (isPortableAssetKind(sourceType)) return sourceType;
  return "video";
}

function dedupeArtifacts(artifacts: PortableArtifact[]) {
  return [
    ...new Map(artifacts.map((artifact) => [artifact.path, artifact])).values(),
  ];
}
