import { invoke } from "@tauri-apps/api/core";
import type { ProviderRequestPlan } from "@/domain/provider";
import type { ProviderHttpResponse } from "@/services/providerAdapters";
import { canUseTauriRuntime, type TauriInvoke } from "@/services/tauriHelperClient";
import type { TrustedProviderHttpClient } from "@/services/providerService";

export { canUseTauriRuntime } from "@/services/tauriHelperClient";

export function createTauriProviderHttpClient(
  invokeCommand: TauriInvoke = invoke,
): TrustedProviderHttpClient {
  return async (requestPlan: ProviderRequestPlan): Promise<ProviderHttpResponse> => {
    if (!canUseTauriRuntime()) {
      throw new Error("tauri_provider_unavailable");
    }

    return invokeCommand<ProviderHttpResponse>("complete_provider_request", {
      requestPlan,
    });
  };
}
