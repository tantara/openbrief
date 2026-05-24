import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const SIDECAR_BASE_NAMES = ["openbrief-helper"];
export const MIN_REAL_BINARY_SIZE_BYTES = 10000;
export const SUPPORTED_HELPER_TARGET_TRIPLES = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
];

export function getHostTriple({
  execFile = execFileSync,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  try {
    return execFile("rustc", ["--print", "host-tuple"], {
      encoding: "utf8",
    }).trim();
  } catch {
    if (platform === "darwin") {
      return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    }

    if (platform === "win32") {
      return "x86_64-pc-windows-msvc";
    }

    if (platform === "linux") {
      return arch === "arm64" || arch === "arm" || arch === "aarch64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu";
    }

    throw new Error(`Unsupported development host: ${platform}/${arch}`);
  }
}

export function sidecarFileName(baseName, targetTriple) {
  const suffix = targetTriple.includes("windows") ? ".exe" : "";
  return `${baseName}-${targetTriple}${suffix}`;
}

export function createDevSidecarPlaceholder({
  binariesDir,
  baseName,
  targetTriple,
  message = "OpenBrief dev sidecar placeholder. Build the real helper before packaging.",
}) {
  const fileName = sidecarFileName(baseName, targetTriple);
  const filePath = join(binariesDir, fileName);

  if (existsSync(filePath) && statSync(filePath).size > MIN_REAL_BINARY_SIZE_BYTES) {
    return { fileName, filePath, created: false, preservedRealBinary: true };
  }

  mkdirSync(binariesDir, { recursive: true });

  const escapedMessage = message.replace(/'/g, "'\\''");
  const body = targetTriple.includes("windows")
    ? `@echo off\r\necho ${message}\r\nexit /b 1\r\n`
    : `#!/bin/sh\nprintf '%s\\n' '${escapedMessage}'\nexit 1\n`;

  writeFileSync(filePath, body);

  if (!targetTriple.includes("windows")) {
    chmodSync(filePath, 0o755);
  }

  return { fileName, filePath, created: true, preservedRealBinary: false };
}

export function setupDevSidecars({
  binariesDir = join(__dirname, "..", "src-tauri", "binaries"),
  targetTriple = getHostTriple(),
  baseNames = SIDECAR_BASE_NAMES,
} = {}) {
  return baseNames.map((baseName) =>
    createDevSidecarPlaceholder({ binariesDir, baseName, targetTriple }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = setupDevSidecars();
  for (const result of results) {
    const action = result.preservedRealBinary ? "Preserved real sidecar" : "Created dev sidecar";
    console.log(`${action}: ${result.fileName}`);
  }
}
