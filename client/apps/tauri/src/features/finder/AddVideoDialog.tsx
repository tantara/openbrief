import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { AddVideoForm } from "@/features/finder/AddVideoForm";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import type { VideoAsset, VideoPlaylist } from "@/domain/media-library";
import { useI18n } from "@/i18n";

type AddVideoDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  playlist?: VideoPlaylist;
  videos: VideoAsset[];
  onAddExistingVideo(playlistId: string, videoId: string): void;
  onImportLocalFile(sourcePath: string): Promise<unknown>;
  onImportYoutubeUrl(url: string): Promise<unknown>;
  inputId?: string;
};

export function AddVideoDialog({
  open,
  onOpenChange,
  playlist,
  videos,
  onAddExistingVideo,
  onImportLocalFile,
  onImportYoutubeUrl,
  inputId = "global-video-url",
}: AddVideoDialogProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"new" | "library">("new");
  const [librarySearch, setLibrarySearch] = useState("");
  const deferredLibrarySearch = useDeferredValue(librarySearch);
  const playlistVideoIds = useMemo(
    () => new Set(playlist?.videoIds ?? []),
    [playlist?.videoIds],
  );
  const matchingVideos = useMemo(() => {
    const needle = deferredLibrarySearch.trim().toLowerCase();

    return videos.filter((video) => {
      if (playlistVideoIds.has(video.id)) return false;
      if (!needle) return true;

      return `${video.title} ${video.authorName ?? ""} ${video.sourceKind}`
        .toLowerCase()
        .includes(needle);
    });
  }, [deferredLibrarySearch, playlistVideoIds, videos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {playlist ? t("playlist.addDialog.title") : t("finder.import.title")}
          </DialogTitle>
          <DialogDescription>
            {playlist
              ? t("playlist.addDialog.description")
              : t("finder.import.description")}
          </DialogDescription>
        </DialogHeader>
        {playlist ? (
          <div className="grid grid-cols-2 rounded-md border border-border p-1">
            <Button
              type="button"
              variant={tab === "new" ? "secondary" : "ghost"}
              onClick={() => setTab("new")}
            >
              {t("playlist.addDialog.newVideo")}
            </Button>
            <Button
              type="button"
              variant={tab === "library" ? "secondary" : "ghost"}
              onClick={() => setTab("library")}
            >
              {t("playlist.addDialog.fromLibrary")}
            </Button>
          </div>
        ) : null}
        {!playlist || tab === "new" ? (
          <AddVideoForm
            onImportLocalFile={onImportLocalFile}
            onImportYoutubeUrl={onImportYoutubeUrl}
            inputId={inputId}
            onImportComplete={() => onOpenChange(false)}
          />
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder={t("playlist.addDialog.searchLibrary")}
                className="pl-9"
              />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              {matchingVideos.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("playlist.addDialog.noLibraryMatches")}
                </p>
              ) : (
                matchingVideos.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                    onClick={() => {
                      onAddExistingVideo(playlist.id, video.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{video.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {video.authorName ?? video.sourceKind}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
