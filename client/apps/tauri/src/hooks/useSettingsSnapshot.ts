import { useCallback, useEffect, useState } from "react";
import type { SettingsSnapshot } from "@/domain/settings";
import { loadSettingsSnapshot } from "@/services/settingsService";

export function useSettingsSnapshot() {
  const [settings, setSettings] = useState<SettingsSnapshot | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const refreshSettings = useCallback(async (
    options: { checkAppUpdate?: boolean } = {},
  ) => {
    try {
      const snapshot = await loadSettingsSnapshot(
        undefined,
        undefined,
        options,
      );
      setSettings(snapshot);
      setErrorMessage(undefined);
      return snapshot;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "settings_load_failed");
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadSettingsSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          setSettings(snapshot);
          setErrorMessage(undefined);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "settings_load_failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSettings]);

  return { settings, errorMessage, refreshSettings };
}
