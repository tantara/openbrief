import { invoke } from "@tauri-apps/api/core";
import { getOpenaiCompatibleEndpoint } from "@/domain/provider";
import {
  canUseTauriRuntime,
  type TauriInvoke,
} from "@/services/tauriHelperClient";

/**
 * Asks the configured OpenAI-compatible server for its `/v1/models` catalog.
 * Rust resolves the API key and validates the endpoint; failures resolve to an
 * empty list so the model field stays usable as free text.
 */
export async function listOpenaiCompatibleModels(
  invokeCommand: TauriInvoke = invoke,
  endpoint = getOpenaiCompatibleEndpoint(),
): Promise<string[]> {
  if (!canUseTauriRuntime()) return [];

  try {
    return await invokeCommand<string[]>("list_openai_compatible_models", {
      endpoint,
    });
  } catch {
    return [];
  }
}
