import { open, save } from "@tauri-apps/plugin-dialog";

export type SaveFileDialogRequest = {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
};

export type LocalFileDialogService = {
  selectVideoFile(): Promise<string | null>;
  selectImageFile(): Promise<string | null>;
  selectSavePath(request?: SaveFileDialogRequest): Promise<string | null>;
};

export function createLocalFileDialogService(): LocalFileDialogService {
  return {
    async selectVideoFile() {
      const selected = await open({
        title: "Select video from computer",
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "m4v", "mov", "webm", "mkv"],
          },
        ],
      });

      if (Array.isArray(selected)) {
        return selected[0] ?? null;
      }

      return selected ?? null;
    },

    async selectImageFile() {
      const selected = await open({
        title: "Choose playlist cover",
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"],
          },
        ],
      });

      if (Array.isArray(selected)) {
        return selected[0] ?? null;
      }

      return selected ?? null;
    },

    async selectSavePath(request = {}) {
      return save({
        title: request.title ?? "Export artifact",
        defaultPath: request.defaultPath,
        filters: request.filters,
      });
    },
  };
}
