import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";

export type FileRevealer = (path: string | string[]) => Promise<void>;

export async function revealExportedFile(
  targetPath: string,
  revealer: FileRevealer = revealItemInDir,
) {
  if (!targetPath.trim()) {
    throw new Error("file_reveal_path_required");
  }

  if (!canUseTauriRuntime()) {
    throw new Error("file_reveal_unavailable");
  }

  await revealer(targetPath);
}
