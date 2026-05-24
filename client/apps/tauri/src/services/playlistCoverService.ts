import { invoke } from "@tauri-apps/api/core";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";

export type PlaylistCoverImportResult = {
  libraryRelativePath: string;
  fileSizeBytes: number;
};

export type PlaylistCoverService = {
  importCover(
    playlistId: string,
    sourcePath: string,
  ): Promise<PlaylistCoverImportResult>;
};

export function createPlaylistCoverService(
  invokeCommand: TauriInvoke = invoke,
): PlaylistCoverService {
  return {
    async importCover(playlistId, sourcePath) {
      if (!canUseTauriRuntime()) {
        return {
          libraryRelativePath: sourcePath,
          fileSizeBytes: 0,
        };
      }

      return invokeCommand<PlaylistCoverImportResult>(
        "copy_playlist_cover_into_library",
        {
          playlistId,
          sourcePath,
        },
      );
    },
  };
}
