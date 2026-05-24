import type {
  ChatMessage,
  IngestJob,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
  VideoPlaylist,
} from "@/domain/media-library";
import type {
  PodcastDocument,
  PodcastGenerationJob,
} from "@/domain/podcast";
import type { TranscriptVariant } from "@/domain/transcript-actions";
import { invoke } from "@tauri-apps/api/core";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";

export type MediaLibrarySnapshot = {
  videos: VideoAsset[];
  ingestJobs: IngestJob[];
  transcriptJobs: TranscriptJob[];
  transcriptsByVideoId: Record<string, TranscriptSegment[]>;
  transcriptVariantsByVideoId: Record<string, TranscriptVariant[]>;
  summariesByVideoId: Record<string, SummaryDocument>;
  summaryHistoryByVideoId: Record<string, SummaryDocument[]>;
  chatMessagesByVideoId: Record<string, ChatMessage[]>;
  podcastsByVideoId: Record<string, PodcastDocument>;
  podcastHistoryByVideoId: Record<string, PodcastDocument[]>;
  podcastJobsByVideoId: Record<string, PodcastGenerationJob>;
  playlists: VideoPlaylist[];
};

export type MediaLibraryStorageAdapter = {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, contents: string): Promise<void>;
};

export interface MediaLibraryRepository {
  loadSnapshot(): Promise<MediaLibrarySnapshot>;
  saveSnapshot(snapshot: MediaLibrarySnapshot): Promise<void>;
  listVideos(): Promise<VideoAsset[]>;
  getVideo(videoId: string): Promise<VideoAsset | undefined>;
  listIngestJobs(): Promise<IngestJob[]>;
  listTranscriptJobs(): Promise<TranscriptJob[]>;
  listTranscript(videoId: string): Promise<TranscriptSegment[]>;
  getSummary(videoId: string): Promise<SummaryDocument | undefined>;
  listChatMessages(videoId: string): Promise<ChatMessage[]>;
  listPlaylists(): Promise<VideoPlaylist[]>;
}

export const defaultMediaLibrarySnapshotPath = "media-library.json";

export function createEmptyMediaLibrarySnapshot(): MediaLibrarySnapshot {
  return {
    videos: [],
    ingestJobs: [],
    transcriptJobs: [],
    transcriptsByVideoId: {},
    transcriptVariantsByVideoId: {},
    summariesByVideoId: {},
    summaryHistoryByVideoId: {},
    chatMessagesByVideoId: {},
    podcastsByVideoId: {},
    podcastHistoryByVideoId: {},
    podcastJobsByVideoId: {},
    playlists: [],
  };
}

export class InMemoryMediaLibraryRepository implements MediaLibraryRepository {
  constructor(private readonly snapshot: MediaLibrarySnapshot) {}

  async loadSnapshot() {
    return cloneSnapshot(this.snapshot);
  }

  async saveSnapshot(snapshot: MediaLibrarySnapshot) {
    Object.assign(this.snapshot, cloneSnapshot(snapshot));
  }

  async listVideos() {
    return [...this.snapshot.videos];
  }

  async getVideo(videoId: string) {
    return this.snapshot.videos.find((video) => video.id === videoId);
  }

  async listIngestJobs() {
    return [...this.snapshot.ingestJobs];
  }

  async listTranscriptJobs() {
    return [...this.snapshot.transcriptJobs];
  }

  async listTranscript(videoId: string) {
    return [...(this.snapshot.transcriptsByVideoId[videoId] ?? [])];
  }

  async getSummary(videoId: string) {
    return latestSummaryForVideo(this.snapshot, videoId);
  }

  async listChatMessages(videoId: string) {
    return [...(this.snapshot.chatMessagesByVideoId[videoId] ?? [])];
  }

  async listPlaylists() {
    return [...this.snapshot.playlists];
  }
}

export class JsonMediaLibraryRepository implements MediaLibraryRepository {
  constructor(
    private readonly storage: MediaLibraryStorageAdapter,
    private readonly snapshotPath = defaultMediaLibrarySnapshotPath,
  ) {}

  async loadSnapshot() {
    const contents = await this.storage.readText(this.snapshotPath);

    if (!contents) {
      return createEmptyMediaLibrarySnapshot();
    }

    return normalizeSnapshot(JSON.parse(contents));
  }

  async saveSnapshot(snapshot: MediaLibrarySnapshot) {
    await this.storage.writeText(
      this.snapshotPath,
      `${JSON.stringify(normalizeSnapshot(snapshot), null, 2)}\n`,
    );
  }

  async listVideos() {
    const snapshot = await this.loadSnapshot();
    return snapshot.videos;
  }

  async getVideo(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.videos.find((video) => video.id === videoId);
  }

  async listIngestJobs() {
    const snapshot = await this.loadSnapshot();
    return snapshot.ingestJobs;
  }

  async listTranscriptJobs() {
    const snapshot = await this.loadSnapshot();
    return snapshot.transcriptJobs;
  }

  async listTranscript(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.transcriptsByVideoId[videoId] ?? [];
  }

  async getSummary(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return latestSummaryForVideo(snapshot, videoId);
  }

  async listChatMessages(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.chatMessagesByVideoId[videoId] ?? [];
  }

  async listPlaylists() {
    const snapshot = await this.loadSnapshot();
    return snapshot.playlists;
  }
}

export class SqlMediaLibraryRepository implements MediaLibraryRepository {
  constructor(private readonly invokeCommand: TauriInvoke = invoke) {}

  async loadSnapshot() {
    return normalizeSnapshot(
      await this.invokeCommand<unknown>("load_media_library_snapshot"),
    );
  }

  async saveSnapshot(snapshot: MediaLibrarySnapshot) {
    await this.invokeCommand<void>("save_media_library_snapshot", {
      snapshot: normalizeSnapshot(snapshot),
    });
  }

  async listVideos() {
    const snapshot = await this.loadSnapshot();
    return snapshot.videos;
  }

  async getVideo(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.videos.find((video) => video.id === videoId);
  }

  async listIngestJobs() {
    const snapshot = await this.loadSnapshot();
    return snapshot.ingestJobs;
  }

  async listTranscriptJobs() {
    const snapshot = await this.loadSnapshot();
    return snapshot.transcriptJobs;
  }

  async listTranscript(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.transcriptsByVideoId[videoId] ?? [];
  }

  async getSummary(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return latestSummaryForVideo(snapshot, videoId);
  }

  async listChatMessages(videoId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.chatMessagesByVideoId[videoId] ?? [];
  }

  async listPlaylists() {
    const snapshot = await this.loadSnapshot();
    return snapshot.playlists;
  }
}

export function createDefaultMediaLibraryRepository(
  initialVideos: VideoAsset[] = [],
): MediaLibraryRepository {
  if (canUseTauriRuntime()) {
    return new SqlMediaLibraryRepository();
  }

  return new InMemoryMediaLibraryRepository({
    ...createEmptyMediaLibrarySnapshot(),
    videos: initialVideos,
  });
}

function normalizeSnapshot(value: unknown): MediaLibrarySnapshot {
  if (!isRecord(value)) {
    return createEmptyMediaLibrarySnapshot();
  }

  const summariesByVideoId = getRecord<SummaryDocument>(value.summariesByVideoId);
  const summaryHistoryByVideoId = normalizeSummaryHistory(
    value.summaryHistoryByVideoId,
    summariesByVideoId,
  );
  const podcastsByVideoId = getRecord<PodcastDocument>(value.podcastsByVideoId);
  const podcastHistoryByVideoId = normalizePodcastHistory(
    value.podcastHistoryByVideoId,
    podcastsByVideoId,
  );

  return {
    videos: getArray<VideoAsset>(value.videos),
    ingestJobs: getArray<IngestJob>(value.ingestJobs),
    transcriptJobs: getArray<TranscriptJob>(value.transcriptJobs),
    transcriptsByVideoId: getArrayRecord<TranscriptSegment>(
      value.transcriptsByVideoId,
    ),
    transcriptVariantsByVideoId: getArrayRecord<TranscriptVariant>(
      value.transcriptVariantsByVideoId,
    ),
    summariesByVideoId,
    summaryHistoryByVideoId,
    chatMessagesByVideoId: getArrayRecord<ChatMessage>(
      value.chatMessagesByVideoId,
    ),
    podcastsByVideoId,
    podcastHistoryByVideoId,
    podcastJobsByVideoId: getRecord<PodcastGenerationJob>(
      value.podcastJobsByVideoId,
    ),
    playlists: getArray<VideoPlaylist>(value.playlists),
  };
}

function cloneSnapshot(snapshot: MediaLibrarySnapshot): MediaLibrarySnapshot {
  return normalizeSnapshot(JSON.parse(JSON.stringify(snapshot)));
}

function getArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...value] as T[] : [];
}

function getRecord<T>(value: unknown): Record<string, T> {
  return isRecord(value) ? { ...value } as Record<string, T> : {};
}

function getArrayRecord<T>(value: unknown): Record<string, T[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, items]) => [key, getArray<T>(items)]),
  );
}

function normalizeSummaryHistory(
  value: unknown,
  latestSummaries: Record<string, SummaryDocument>,
) {
  const history = getArrayRecord<SummaryDocument>(value);

  for (const [videoId, latestSummary] of Object.entries(latestSummaries)) {
    const summaries = history[videoId] ?? [];

    if (!summaries.some((summary) => summary.id === latestSummary.id)) {
      history[videoId] = [...summaries, latestSummary];
    }
  }

  return history;
}

function normalizePodcastHistory(
  value: unknown,
  latestPodcasts: Record<string, PodcastDocument>,
) {
  const history = getArrayRecord<PodcastDocument>(value);

  for (const [videoId, latestPodcast] of Object.entries(latestPodcasts)) {
    const podcasts = history[videoId] ?? [];

    if (!podcasts.some((podcast) => podcast.id === latestPodcast.id)) {
      history[videoId] = [...podcasts, latestPodcast];
    }
  }

  return Object.fromEntries(
    Object.entries(history).map(([videoId, podcasts]) => [
      videoId,
      [...podcasts].sort(compareCreatedAtDesc),
    ]),
  );
}

function latestSummaryForVideo(
  snapshot: MediaLibrarySnapshot,
  videoId: string,
) {
  return (
    latestSummary(snapshot.summaryHistoryByVideoId[videoId]) ??
    snapshot.summariesByVideoId[videoId]
  );
}

function latestSummary(summaries: SummaryDocument[] = []) {
  return [...summaries].sort(compareCreatedAtDesc)[0];
}

function compareCreatedAtDesc(
  left: { createdAtIso?: string },
  right: { createdAtIso?: string },
) {
  return (
    (Date.parse(right.createdAtIso ?? "") || 0) -
    (Date.parse(left.createdAtIso ?? "") || 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
