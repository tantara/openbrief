import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImagePlus,
  ListVideo,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AddVideoDialog } from "@/features/finder/AddVideoDialog";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { Textarea } from "@acme/ui/textarea";
import type { VideoAsset, VideoPlaylist } from "@/domain/media-library";
import { playlistVideos } from "@/domain/media-library";
import { useI18n } from "@/i18n";
import {
  createLocalFileDialogService,
  type LocalFileDialogService,
} from "@/services/localFileDialogService";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";

type PlaylistViewProps = {
  playlists: VideoPlaylist[];
  videos: VideoAsset[];
  selectedPlaylistId?: string;
  onSelectPlaylist(playlistId: string): void;
  onBackToPlaylists(): void;
  onCreatePlaylist(title: string): VideoPlaylist;
  onRenamePlaylist(playlistId: string, title: string): void;
  onAddExistingVideo(playlistId: string, videoId: string): void;
  onOpenAddVideoDialog?(playlistId: string): void;
  onChangePlaylistCover(playlistId: string, sourcePath: string): Promise<unknown>;
  onImportLocalFile(sourcePath: string): Promise<unknown>;
  onImportYoutubeUrl(url: string): Promise<unknown>;
  onReorderVideo(playlistId: string, fromIndex: number, toIndex: number): void;
  onOpenVideo(videoId: string): void;
  fileDialogService?: LocalFileDialogService;
};

export function PlaylistView({
  playlists,
  videos,
  selectedPlaylistId,
  onSelectPlaylist,
  onBackToPlaylists,
  onCreatePlaylist,
  onRenamePlaylist,
  onAddExistingVideo,
  onOpenAddVideoDialog,
  onChangePlaylistCover,
  onImportLocalFile,
  onImportYoutubeUrl,
  onReorderVideo,
  onOpenVideo,
  fileDialogService = createLocalFileDialogService(),
}: PlaylistViewProps) {
  const { t } = useI18n();
  const selectedPlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylistId,
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddVideoDialogOpen, setIsAddVideoDialogOpen] = useState(false);

  if (selectedPlaylist) {
    return (
      <>
        <PlaylistDetail
          playlist={selectedPlaylist}
          videos={videos}
          onBack={onBackToPlaylists}
          onRenamePlaylist={onRenamePlaylist}
          onChangePlaylistCover={onChangePlaylistCover}
          onOpenAddVideo={() => {
            if (onOpenAddVideoDialog) {
              onOpenAddVideoDialog(selectedPlaylist.id);
              return;
            }

            setIsAddVideoDialogOpen(true);
          }}
          onReorderVideo={onReorderVideo}
          onOpenVideo={onOpenVideo}
          fileDialogService={fileDialogService}
        />
        <AddVideoDialog
          open={isAddVideoDialogOpen}
          onOpenChange={setIsAddVideoDialogOpen}
          playlist={selectedPlaylist}
          videos={videos}
          onAddExistingVideo={onAddExistingVideo}
          onImportLocalFile={onImportLocalFile}
          onImportYoutubeUrl={onImportYoutubeUrl}
          inputId="playlist-video-url"
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("playlist.list.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("playlist.list.description")}
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("playlist.create.action")}
        </Button>
      </div>

      {playlists.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <ListVideo className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">{t("playlist.empty.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("playlist.empty.description")}
              </p>
            </div>
            <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("playlist.create.action")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {playlists.map((playlist) => (
            <Card key={playlist.id}>
              <CardContent className="pt-4">
                <PlaylistCoverFrame
                  playlist={playlist}
                  coverVideo={playlistVideos(playlist, videos)[0]}
                  label={playlist.title}
                />
              </CardContent>
              <CardHeader>
                <CardTitle className="line-clamp-2 text-base">
                  {playlist.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("playlist.videoCount", {
                    count: String(playlist.videoIds.length),
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => onSelectPlaylist(playlist.id)}
                >
                  {t("playlist.open")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreatePlaylistDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreate={(title) => {
          const playlist = onCreatePlaylist(title);
          setIsCreateDialogOpen(false);
          onSelectPlaylist(playlist.id);
        }}
      />
    </div>
  );
}

function PlaylistDetail({
  playlist,
  videos,
  onBack,
  onRenamePlaylist,
  onChangePlaylistCover,
  onOpenAddVideo,
  onReorderVideo,
  onOpenVideo,
  fileDialogService,
}: {
  playlist: VideoPlaylist;
  videos: VideoAsset[];
  onBack(): void;
  onRenamePlaylist(playlistId: string, title: string): void;
  onChangePlaylistCover(playlistId: string, sourcePath: string): Promise<unknown>;
  onOpenAddVideo(): void;
  onReorderVideo(playlistId: string, fromIndex: number, toIndex: number): void;
  onOpenVideo(videoId: string): void;
  fileDialogService: LocalFileDialogService;
}) {
  const { t } = useI18n();
  const orderedVideos = playlistVideos(playlist, videos);
  const coverVideo = orderedVideos[0];
  const [draftTitle, setDraftTitle] = useState(playlist.title);
  const [isChangingCover, setIsChangingCover] = useState(false);

  async function changeCover() {
    const sourcePath = await fileDialogService.selectImageFile();

    if (!sourcePath) return;

    setIsChangingCover(true);
    try {
      await onChangePlaylistCover(playlist.id, sourcePath);
    } catch {
      // The caller owns user-facing failure messaging.
    } finally {
      setIsChangingCover(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("playlist.back")}
        </Button>
        <Button type="button" onClick={onOpenAddVideo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("playlist.addVideo")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("playlist.detail.settings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,320px)_1fr]">
            <PlaylistCoverFrame
              playlist={playlist}
              coverVideo={coverVideo}
              label={playlist.title}
            />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{t("playlist.cover.title")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("playlist.cover.description")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void changeCover()}
                disabled={isChangingCover}
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {isChangingCover
                  ? t("playlist.cover.changing")
                  : t("playlist.cover.change")}
              </Button>
            </div>
          </div>
          <label className="text-sm font-medium" htmlFor="playlist-title">
            {t("playlist.title.label")}
          </label>
          <Textarea
            id="playlist-title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            rows={2}
          />
          <Button
            type="button"
            disabled={!draftTitle.trim() || draftTitle.trim() === playlist.title}
            onClick={() => onRenamePlaylist(playlist.id, draftTitle)}
          >
            {t("playlist.title.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("playlist.detail.videos")}</CardTitle>
        </CardHeader>
        <CardContent>
          {orderedVideos.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                {t("playlist.detail.empty")}
              </p>
              <Button type="button" variant="outline" onClick={onOpenAddVideo}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("playlist.addVideo")}
              </Button>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {orderedVideos.map((video, index) => (
                <li
                  key={video.id}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="w-8 text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenVideo(video.id)}
                  >
                    <span className="block truncate font-medium">{video.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {video.authorName ?? video.sourceKind}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label={t("playlist.moveUp", { title: video.title })}
                      onClick={() => onReorderVideo(playlist.id, index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === orderedVideos.length - 1}
                      aria-label={t("playlist.moveDown", { title: video.title })}
                      onClick={() => onReorderVideo(playlist.id, index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlaylistCoverFrame({
  playlist,
  coverVideo,
  label,
}: {
  playlist: VideoPlaylist;
  coverVideo?: VideoAsset;
  label: string;
}) {
  const { t } = useI18n();
  const coverPath = playlist.coverImagePath ?? coverVideo?.thumbnailPath;
  const [src, setSrc] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setSrc(undefined);

    if (!coverPath) {
      return;
    }

    resolveLibraryAssetUrl(coverPath)
      .then((resolvedSrc) => {
        if (!cancelled) setSrc(resolvedSrc);
      })
      .catch(() => {
        if (!cancelled) setSrc(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [coverPath]);

  return (
    <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
      {src ? (
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ListVideo className="h-6 w-6" aria-hidden="true" />
          <span>{t("playlist.cover.empty")}</span>
        </div>
      )}
    </div>
  );
}

function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreate(title: string): void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("playlist.create.title")}</DialogTitle>
          <DialogDescription>{t("playlist.create.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-playlist-title">
            {t("playlist.title.label")}
          </label>
          <Input
            id="new-playlist-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("playlist.title.placeholder")}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("finder.dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(title);
              setTitle("");
            }}
          >
            {t("playlist.create.action")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
