import { canUseTauriRuntime } from "@/services/tauriHelperClient";

export type RuntimeLogFields = Record<
  string,
  string | number | boolean | undefined
>;

export function logRuntimeInfo(message: string, fields: RuntimeLogFields = {}) {
  void writeRuntimeLog("info", message, fields);
}

export function logRuntimeWarn(message: string, fields: RuntimeLogFields = {}) {
  void writeRuntimeLog("warn", message, fields);
}

export function logRuntimeError(message: string, fields: RuntimeLogFields = {}) {
  void writeRuntimeLog("error", message, fields);
}

async function writeRuntimeLog(
  level: "info" | "warn" | "error",
  message: string,
  fields: RuntimeLogFields,
) {
  const line = formatLogLine(message, fields);

  if (!canUseTauriRuntime()) {
    console[level](line);
    return;
  }

  try {
    const logger = await import("@tauri-apps/plugin-log");
    await logger[level](line);
  } catch {
    console[level](line);
  }
}

function formatLogLine(message: string, fields: RuntimeLogFields) {
  const suffix = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return value !== undefined && value !== "";
    })
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  return suffix ? `${message}; ${suffix}` : message;
}
