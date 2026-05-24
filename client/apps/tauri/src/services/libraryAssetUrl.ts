import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";

export async function resolveLibraryAssetUrl(
  relativePath: string | undefined,
  invokeCommand: TauriInvoke = invoke,
) {
  if (!relativePath) return undefined;

  if (!canUseTauriRuntime()) {
    return relativePath;
  }

  const absolutePath = await invokeCommand<string>("resolve_library_file_path", {
    relativePath,
  });

  return convertFileSrc(absolutePath);
}
