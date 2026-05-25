import type {
  DownloadErrorKind,
  DownloadRecoveryAction,
} from "@/domain/download-error";
import type { DesktopPlatform } from "@/domain/platform";

export type VideoSourceKind = "local-file" | VideoProviderKind;
export type VideoProviderKind = "youtube" | "tiktok" | "twitch" | "vimeo";
export type TranscriptSourceKind = "youtube-captions" | "local-stt";
export type ProviderKind = "openai" | "anthropic" | "gemini" | "openrouter";
export type ImportStatus = "importing" | "ready" | "failed";
export type MediaSourceType = "video" | "audio" | "pdf" | "csv";
export type KnowledgeSourceKind =
  | "video"
  | "audio"
  | "document"
  | "web-page"
  | "academic-paper";
export type EvidenceAnchorKind =
  | "timestamp-range"
  | "page-range"
  | "paragraph"
  | "table-cell"
  | "image-frame";
export type ArtifactKind =
  | "transcript"
  | "summary"
  | "chat"
  | "quiz"
  | "export"
  | "outline"
  | "visual-frame";

export type LibraryDirectory =
  | "videos"
  | "audios"
  | "pdfs"
  | "csvs"
  | "playlists"
  | "thumbnails"
  | "transcripts"
  | "summaries"
  | "job-temp";

export const libraryDirectories: LibraryDirectory[] = [
  "videos",
  "audios",
  "pdfs",
  "csvs",
  "playlists",
  "thumbnails",
  "transcripts",
  "summaries",
  "job-temp",
];

export type MediaAssetMetadata = {
  id: string;
  title: string;
  sourceType?: MediaSourceType;
  sourceKind: VideoSourceKind;
  originalUri: string;
  originalFileName?: string;
  libraryPath: string;
  fileSizeBytes?: number;
  language?: string;
  tags?: string[];
  topics?: string[];
  importStatus: ImportStatus;
  createdAtIso: string;
};

export type VideoAsset = MediaAssetMetadata & {
  thumbnailPath?: string;
  durationSeconds?: number;
  pageCount?: number;
  channelName?: string;
  authorName?: string;
  authorUrl?: string;
};

export type TranscriptSegment = {
  id: string;
  startSeconds: number;
  endSeconds?: number;
  text: string;
  sourceKind: TranscriptSourceKind;
  words?: TranscriptWord[];
};

export type TranscriptWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export type SummaryDocument = {
  id: string;
  videoId: string;
  markdown: string;
  provider: ProviderKind;
  templateId?: string;
  lengthMode?: string;
  outputLanguage?: string;
  sourceSegmentCount: number;
  artifactPath?: string;
  createdAtIso: string;
};

export type AiTokenUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ChatVoiceMessageArtifact = {
  audioPath: string;
  generationId: string;
  voiceName?: string;
  sizeBytes: number;
  createdAtIso: string;
};

export type ChatMessage = {
  id: string;
  videoId: string;
  role: "user" | "assistant";
  content: string;
  contextMode: "summary" | "transcript";
  sessionId?: string;
  provider?: ProviderKind;
  model?: string;
  tokenUsage?: AiTokenUsage;
  voiceMessage?: ChatVoiceMessageArtifact;
  createdAtIso: string;
};

export type VideoPlaylist = {
  id: string;
  title: string;
  videoIds: string[];
  coverImagePath?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ProviderAccount = {
  id: ProviderKind;
  label: string;
  authType: "api-key" | "oauth";
  configured: boolean;
};

export type IngestJob = {
  id: string;
  sourceKind: VideoSourceKind;
  status: "queued" | "running" | "failed" | "completed" | "cancelled";
  progressPercent: number;
  videoId?: string;
  title?: string;
  originalUri?: string;
  thumbnailPath?: string;
  errorMessage?: string;
  errorKind?: DownloadErrorKind;
  recoveryActions?: DownloadRecoveryAction[];
};

export type TranscriptJob = {
  id: string;
  videoId: string;
  status: "queued" | "running" | "failed" | "completed";
  preferredSource: TranscriptSourceKind;
  progressPercent: number;
  transcriptPath?: string;
  errorMessage?: string;
};

export type EvidenceAnchor = {
  id: string;
  sourceId: string;
  sourceKind: KnowledgeSourceKind;
  kind: EvidenceAnchorKind;
  label: string;
  startSeconds?: number;
  endSeconds?: number;
  pageStart?: number;
  pageEnd?: number;
  artifactPath?: string;
};

export type SourceArtifact = {
  id: string;
  sourceId: string;
  sourceKind: KnowledgeSourceKind;
  kind: ArtifactKind;
  title: string;
  artifactPath?: string;
  createdAtIso: string;
};

export type VideoBundleLayoutVersion = 1;

export type VideoBundleManifest = {
  schemaVersion: VideoBundleLayoutVersion;
  videoId: string;
  video: VideoAsset;
  artifacts: {
    thumbnailPath?: string;
    audioPath?: string;
    transcriptPath?: string;
    transcriptVariantPaths: string[];
    summaryPaths: string[];
    chatSessionPaths: string[];
    videoGenerationCompositionPaths: string[];
    videoGenerationRenderPaths: string[];
  };
};

export class VideoArtifactBundle {
  constructor(readonly videoId: string) {}

  get rootDirectory() {
    return createVideoArtifactDirectory(this.videoId);
  }

  get manifestPath() {
    return `${this.rootDirectory}/openbrief-video.json`;
  }

  get thumbnailDirectory() {
    return `${this.rootDirectory}/thumbnail`;
  }

  get posterPath() {
    return `${this.thumbnailDirectory}/${sanitizePathSegment(this.videoId)}-thumbnail.jpg`;
  }

  get audioDirectory() {
    return `${this.rootDirectory}/audio`;
  }

  get audioWavPath() {
    return `${this.audioDirectory}/${sanitizePathSegment(this.videoId)}-audio.wav`;
  }

  get transcriptDirectory() {
    return `${this.rootDirectory}/transcript`;
  }

  get transcriptJsonPath() {
    return `${this.transcriptDirectory}/transcript.json`;
  }

  transcriptTextPath(fileName: string) {
    return `${this.transcriptDirectory}/${sanitizePathSegment(fileName)}`;
  }

  get summaryDirectory() {
    return `${this.rootDirectory}/summary`;
  }

  summaryPath(summaryId: string) {
    return `${this.summaryDirectory}/${sanitizePathSegment(summaryId)}/summary.md`;
  }

  get chatDirectory() {
    return `${this.rootDirectory}/chat`;
  }

  chatSessionPath(sessionId = "default") {
    return `${this.chatDirectory}/${sanitizePathSegment(sessionId)}.jsonl`;
  }
}

export type VideoLibraryQuery = {
  searchText?: string;
  sourceKind?: VideoSourceKind | "all";
  importStatus?: ImportStatus | "all";
  transcriptStatus?: "all" | "with-transcript" | "without-transcript";
  summaryStatus?: "all" | "with-summary" | "without-summary";
  podcastStatus?: "all" | "with-podcast" | "without-podcast";
  sortBy?: VideoLibrarySortKey;
  page?: number;
};

export type VideoLibrarySortKey =
  | "created_at"
  | "created_at_asc"
  | "time"
  | "time_asc"
  | "size"
  | "size_asc";

export type PlatformStoragePolicy = {
  platform: DesktopPlatform;
  appDataDirStrategy: "tauri-app-data-dir";
  localImportStrategy: "copy-into-library";
  externalReferenceSupport: "deferred";
  secretStoragePreference: "os-keychain";
  fallbackSecretStorage: "encrypted-or-0600-app-private-file";
};

export const storagePolicies: PlatformStoragePolicy[] = [
  createStoragePolicy("macos"),
  createStoragePolicy("windows"),
  createStoragePolicy("linux"),
];

export function getStoragePolicy(platform: DesktopPlatform) {
  return storagePolicies.find((policy) => policy.platform === platform);
}

function createStoragePolicy(platform: DesktopPlatform): PlatformStoragePolicy {
  return {
    platform,
    appDataDirStrategy: "tauri-app-data-dir",
    localImportStrategy: "copy-into-library",
    externalReferenceSupport: "deferred",
    secretStoragePreference: "os-keychain",
    fallbackSecretStorage: "encrypted-or-0600-app-private-file",
  };
}

export function selectTranscriptSource(
  hasYoutubeCaptions: boolean,
): TranscriptSourceKind {
  return hasYoutubeCaptions ? "youtube-captions" : "local-stt";
}

export function mediaSourceTypeForAsset(
  asset: MediaAssetMetadata,
): MediaSourceType {
  return asset.sourceType ?? "video";
}

export function isVideoAsset(asset: MediaAssetMetadata) {
  return mediaSourceTypeForAsset(asset) === "video";
}

export function libraryDirectoryForMediaSourceType(
  sourceType: MediaSourceType,
): Extract<LibraryDirectory, "videos" | "audios" | "pdfs" | "csvs"> {
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

export function assetDirectoryForMediaAsset(asset: MediaAssetMetadata) {
  const [directory, assetId] = asset.libraryPath.split("/");

  if (
    (directory === "videos" ||
      directory === "audios" ||
      directory === "pdfs" ||
      directory === "csvs") &&
    assetId
  ) {
    return `${directory}/${sanitizePathSegment(assetId)}`;
  }

  return createLibraryAssetDirectory(
    libraryDirectoryForMediaSourceType(mediaSourceTypeForAsset(asset)),
    asset.id,
  );
}

export function filterVideoLibrary({
  videos,
  transcriptsByVideoId = {},
  summariesByVideoId = {},
  podcastsByVideoId = {},
  query = {},
}: {
  videos: VideoAsset[];
  transcriptsByVideoId?: Record<string, TranscriptSegment[]>;
  summariesByVideoId?: Record<string, SummaryDocument>;
  podcastsByVideoId?: Record<string, unknown>;
  query?: VideoLibraryQuery;
}) {
  const searchNeedles = createSearchNeedles(query.searchText ?? "");

  const filteredVideos = videos.filter((video) => {
    if (
      query.sourceKind &&
      query.sourceKind !== "all" &&
      video.sourceKind !== query.sourceKind
    ) {
      return false;
    }

    if (
      query.importStatus &&
      query.importStatus !== "all" &&
      video.importStatus !== query.importStatus
    ) {
      return false;
    }

    const hasTranscript = (transcriptsByVideoId[video.id]?.length ?? 0) > 0;
    if (query.transcriptStatus === "with-transcript" && !hasTranscript) {
      return false;
    }
    if (query.transcriptStatus === "without-transcript" && hasTranscript) {
      return false;
    }

    const hasSummary = Boolean(summariesByVideoId[video.id]);
    if (query.summaryStatus === "with-summary" && !hasSummary) {
      return false;
    }
    if (query.summaryStatus === "without-summary" && hasSummary) {
      return false;
    }

    const hasPodcast = Boolean(podcastsByVideoId[video.id]);
    if (query.podcastStatus === "with-podcast" && !hasPodcast) {
      return false;
    }
    if (query.podcastStatus === "without-podcast" && hasPodcast) {
      return false;
    }

    if (searchNeedles.length === 0) {
      return true;
    }

    const searchText = createVideoSearchText({
      video,
      transcript: transcriptsByVideoId[video.id] ?? [],
      summary: summariesByVideoId[video.id],
    });

    return searchNeedles.some((needle) => searchText.includes(needle));
  });

  return sortVideoLibrary(filteredVideos, query.sortBy ?? "created_at");
}

export function sortVideoLibrary(
  videos: VideoAsset[],
  sortBy: VideoLibrarySortKey = "created_at",
) {
  return videos
    .map((video, index) => ({ video, index }))
    .sort((left, right) => {
      const comparison = compareVideoAsset(left.video, right.video, sortBy);

      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ video }) => video);
}

export function createVideoPlaylist({
  title,
  nowIso = new Date().toISOString(),
  id = createPlaylistId(title, nowIso),
}: {
  title: string;
  nowIso?: string;
  id?: string;
}): VideoPlaylist {
  const normalizedTitle = normalizePlaylistTitle(title);

  return {
    id,
    title: normalizedTitle,
    videoIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function renameVideoPlaylist(
  playlist: VideoPlaylist,
  title: string,
  nowIso = new Date().toISOString(),
): VideoPlaylist {
  return {
    ...playlist,
    title: normalizePlaylistTitle(title),
    updatedAtIso: nowIso,
  };
}

export function setVideoPlaylistCover(
  playlist: VideoPlaylist,
  coverImagePath: string,
  nowIso = new Date().toISOString(),
): VideoPlaylist {
  return {
    ...playlist,
    coverImagePath,
    updatedAtIso: nowIso,
  };
}

export function addVideoToPlaylist(
  playlist: VideoPlaylist,
  videoId: string,
  nowIso = new Date().toISOString(),
): VideoPlaylist {
  if (playlist.videoIds.includes(videoId)) {
    return playlist;
  }

  return {
    ...playlist,
    videoIds: [...playlist.videoIds, videoId],
    updatedAtIso: nowIso,
  };
}

export function reorderPlaylistVideos(
  playlist: VideoPlaylist,
  fromIndex: number,
  toIndex: number,
  nowIso = new Date().toISOString(),
): VideoPlaylist {
  if (
    fromIndex < 0 ||
    fromIndex >= playlist.videoIds.length ||
    toIndex < 0 ||
    toIndex >= playlist.videoIds.length ||
    fromIndex === toIndex
  ) {
    return playlist;
  }

  const videoIds = [...playlist.videoIds];
  const [movedVideoId] = videoIds.splice(fromIndex, 1);
  videoIds.splice(toIndex, 0, movedVideoId);

  return {
    ...playlist,
    videoIds,
    updatedAtIso: nowIso,
  };
}

export function playlistVideos(
  playlist: VideoPlaylist,
  videos: VideoAsset[],
): VideoAsset[] {
  const videosById = new Map(videos.map((video) => [video.id, video]));

  return playlist.videoIds
    .map((videoId) => videosById.get(videoId))
    .filter((video): video is VideoAsset => Boolean(video));
}

function compareVideoAsset(
  left: VideoAsset,
  right: VideoAsset,
  sortBy: VideoLibrarySortKey,
) {
  switch (sortBy) {
    case "time":
      return compareDescending(
        left.durationSeconds ?? 0,
        right.durationSeconds ?? 0,
      );
    case "time_asc":
      return compareAscending(
        left.durationSeconds ?? 0,
        right.durationSeconds ?? 0,
      );
    case "size":
      return compareDescending(
        left.fileSizeBytes ?? 0,
        right.fileSizeBytes ?? 0,
      );
    case "size_asc":
      return compareAscending(
        left.fileSizeBytes ?? 0,
        right.fileSizeBytes ?? 0,
      );
    case "created_at_asc":
      return compareAscending(
        Date.parse(left.createdAtIso) || 0,
        Date.parse(right.createdAtIso) || 0,
      );
    case "created_at":
      return compareDescending(
        Date.parse(left.createdAtIso) || 0,
        Date.parse(right.createdAtIso) || 0,
      );
    default:
      return 0;
  }
}

function compareDescending(left: number, right: number) {
  return right - left;
}

function compareAscending(left: number, right: number) {
  return left - right;
}

function normalizePlaylistTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("playlist_title_empty");
  }

  return normalizedTitle;
}

function createPlaylistId(title: string, nowIso: string) {
  return `playlist-${sanitizePathSegment(title)}-${Date.parse(nowIso) || Date.now()}`;
}

export function createVideoSearchText({
  video,
  transcript = [],
  summary,
}: {
  video: VideoAsset;
  transcript?: TranscriptSegment[];
  summary?: SummaryDocument;
}) {
  return createSearchIndexText(
    [
      video.title,
      video.sourceKind,
      video.originalUri,
      video.channelName,
      video.authorName,
      video.authorUrl,
      video.language,
      ...(video.tags ?? []),
      ...(video.topics ?? []),
      ...transcript.map((segment) => segment.text),
      summary?.markdown,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function createVideoEvidenceAnchors({
  video,
  transcript = [],
}: {
  video: VideoAsset;
  transcript?: TranscriptSegment[];
}): EvidenceAnchor[] {
  return transcript.map((segment) => ({
    id: `${video.id}:${segment.id}`,
    sourceId: video.id,
    sourceKind: "video",
    kind: "timestamp-range",
    label: formatEvidenceTimestamp(segment.startSeconds),
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
  }));
}

export function createLibraryRelativePath(
  directory: LibraryDirectory,
  assetId: string,
  fileName: string,
) {
  return `${createLibraryAssetDirectory(directory, assetId)}/${sanitizePathSegment(fileName)}`;
}

export function createLibraryAssetDirectory(
  directory: LibraryDirectory,
  assetId: string,
) {
  if (!libraryDirectories.includes(directory)) {
    throw new Error(`Unsupported library directory: ${directory}`);
  }

  return `${directory}/${sanitizePathSegment(assetId)}`;
}

export function createVideoArtifactDirectory(videoId: string) {
  return createLibraryAssetDirectory("videos", videoId);
}

export function createVideoArtifactBundle(videoId: string) {
  return new VideoArtifactBundle(videoId);
}

export function createVideoBundleManifest({
  video,
  transcriptPath,
  transcriptVariantPaths = [],
  summaryPaths = [],
  chatSessionPaths = [],
  videoGenerationCompositionPaths = [],
  videoGenerationRenderPaths = [],
}: {
  video: VideoAsset;
  transcriptPath?: string;
  transcriptVariantPaths?: string[];
  summaryPaths?: string[];
  chatSessionPaths?: string[];
  videoGenerationCompositionPaths?: string[];
  videoGenerationRenderPaths?: string[];
}): VideoBundleManifest {
  const artifacts: VideoBundleManifest["artifacts"] = {
    transcriptVariantPaths,
    summaryPaths,
    chatSessionPaths,
    videoGenerationCompositionPaths,
    videoGenerationRenderPaths,
  };
  if (video.thumbnailPath) {
    artifacts.thumbnailPath = video.thumbnailPath;
  }
  if (transcriptPath) {
    artifacts.transcriptPath = transcriptPath;
  }

  return {
    schemaVersion: 1,
    videoId: video.id,
    video,
    artifacts,
  };
}

export function createVideoPosterArtifactPath(
  videoId: string,
  sourceFileName?: string,
) {
  const bundle = createVideoArtifactBundle(videoId);
  const prefix = createArtifactFilePrefix(sourceFileName ?? videoId);

  return `${bundle.thumbnailDirectory}/${prefix}-thumbnail.jpg`;
}

export function createVideoAudioArtifactPath(
  videoId: string,
  sourceFileName?: string,
) {
  const bundle = createVideoArtifactBundle(videoId);
  const prefix = createArtifactFilePrefix(sourceFileName ?? videoId);

  return `${bundle.audioDirectory}/${prefix}-audio.wav`;
}

export function createVideoFrameArtifactPath(videoId: string, seconds: number) {
  const safeSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;

  return `${createVideoArtifactBundle(videoId).rootDirectory}/frames/${safeSeconds}.jpg`;
}

export function createVideoTranscriptArtifactDirectory(videoId: string) {
  return createVideoArtifactBundle(videoId).transcriptDirectory;
}

export function createVideoTranscriptJsonArtifactPath(videoId: string) {
  return createVideoArtifactBundle(videoId).transcriptJsonPath;
}

export function createSummaryArtifactPath(
  videoId: string,
  summaryId: string,
  _sourceFileName?: string,
) {
  return createVideoArtifactBundle(videoId).summaryPath(summaryId);
}

export function createChatSessionArtifactPath(
  videoId: string,
  sessionId = "default",
) {
  return createVideoArtifactBundle(videoId).chatSessionPath(sessionId);
}

export function sanitizePathSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return sanitized || "untitled";
}

export function createMediaAssetFilePrefix(
  video: Pick<VideoAsset, "id" | "title" | "originalFileName">,
) {
  return createArtifactFilePrefix(
    video.originalFileName ?? video.title ?? video.id,
  );
}

function createArtifactFilePrefix(value: string) {
  const fileName = value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
  const stem = fileName.replace(/\.[a-zA-Z0-9]+$/, "");

  return sanitizePathSegment(stem);
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function createSearchNeedles(value: string) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  return uniqueSearchParts([
    normalized,
    decomposeHangulForSearch(normalized),
    extractHangulInitialsForSearch(normalized),
  ]);
}

function createSearchIndexText(value: string) {
  const normalized = normalizeSearchText(value);

  return uniqueSearchParts([
    normalized,
    decomposeHangulForSearch(normalized),
    extractHangulInitialsForSearch(normalized),
  ]).join(" ");
}

function uniqueSearchParts(parts: string[]) {
  return Array.from(new Set(parts.map(normalizeSearchText).filter(Boolean)));
}

const hangulBaseCode = 0xac00;
const hangulLastCode = 0xd7a3;
const hangulVowelStride = 588;
const hangulFinalStride = 28;
const hangulInitials = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];
const hangulVowels = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅘ",
  "ㅙ",
  "ㅚ",
  "ㅛ",
  "ㅜ",
  "ㅝ",
  "ㅞ",
  "ㅟ",
  "ㅠ",
  "ㅡ",
  "ㅢ",
  "ㅣ",
];
const hangulFinals = [
  "",
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

function decomposeHangulForSearch(value: string) {
  return Array.from(value)
    .map((character) => {
      const syllable = decomposeHangulSyllable(character);

      return syllable
        ? `${syllable.initial}${syllable.vowel}${syllable.final}`
        : character;
    })
    .join("");
}

function extractHangulInitialsForSearch(value: string) {
  return Array.from(value)
    .map(
      (character) => decomposeHangulSyllable(character)?.initial ?? character,
    )
    .join("");
}

function decomposeHangulSyllable(character: string) {
  const codePoint = character.codePointAt(0);

  if (
    codePoint === undefined ||
    codePoint < hangulBaseCode ||
    codePoint > hangulLastCode
  ) {
    return undefined;
  }

  const offset = codePoint - hangulBaseCode;
  const initialIndex = Math.floor(offset / hangulVowelStride);
  const vowelIndex = Math.floor(
    (offset % hangulVowelStride) / hangulFinalStride,
  );
  const finalIndex = offset % hangulFinalStride;

  return {
    initial: hangulInitials[initialIndex],
    vowel: hangulVowels[vowelIndex],
    final: hangulFinals[finalIndex],
  };
}

function formatEvidenceTimestamp(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
