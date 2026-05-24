import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getHostTriple, sidecarFileName } from "./setup-dev-sidecars.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..");
const repoRoot = resolve(appDir, "..", "..", "..");
const binariesDir = join(appDir, "src-tauri", "binaries");
const fixturePath = join(repoRoot, "docs", "assets", "openbrief_mission.wav");
const parakeetModelId = "parakeet-tdt-0.6b-v3";
const requiredParakeetFiles = [
  "Preprocessor.mlmodelc",
  "Encoder.mlmodelc",
  "Decoder.mlmodelc",
  "JointDecisionv3.mlmodelc",
  "parakeet_vocab.json",
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function runJson(binaryPath, request) {
  const startedAt = performance.now();
  const stdout = execFileSync(binaryPath, ["--json", JSON.stringify(request)], {
    encoding: "utf8",
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const events = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const completed = events.find((event) => event.event === "job_completed");
  if (!completed) {
    throw new Error(`missing job_completed event from ${binaryPath}`);
  }
  return { elapsedMs, result: completed.result };
}

function parakeetDownloaded(modelDir) {
  return requiredParakeetFiles.every((fileName) => existsSync(join(modelDir, fileName)));
}

const targetTriple = getHostTriple();
const modelsDir = resolve(argValue("--models-dir", join(repoRoot, ".openbrief-benchmark-models")));
const helperPath = join(binariesDir, sidecarFileName("openbrief-helper", targetTriple));
const fluidaudioPath = join(binariesDir, sidecarFileName("openbrief-fluidaudio", targetTriple));
const whisperSmallPath = join(modelsDir, "ggml-small.bin");
const parakeetModelDir = join(modelsDir, "fluidaudio", parakeetModelId);
const outputDir = mkdtempSync(join(tmpdir(), "openbrief-stt-benchmark-"));

try {
  if (!existsSync(fixturePath)) {
    throw new Error(`benchmark fixture missing: ${fixturePath}`);
  }

  const results = [];
  if (existsSync(helperPath) && existsSync(whisperSmallPath)) {
    results.push({
      engine: "whisper.cpp",
      modelId: "whisper-small",
      ...runJson(helperPath, {
        protocolVersion: 1,
        command: "transcribe_audio",
        jobId: "benchmark-whisper-small",
        audioPath: fixturePath,
        modelPath: whisperSmallPath,
        outputPath: join(outputDir, "whisper-small.json"),
        language: "en",
      }),
    });
  }

  if (existsSync(fluidaudioPath) && parakeetDownloaded(parakeetModelDir)) {
    results.push({
      engine: "fluidaudio",
      modelId: parakeetModelId,
      ...runJson(fluidaudioPath, {
        protocolVersion: 1,
        command: "transcribe_audio",
        jobId: "benchmark-parakeet-v3",
        audioPath: fixturePath,
        outputPath: join(outputDir, "parakeet-v3.json"),
        modelDirectory: parakeetModelDir,
        language: "en",
      }),
    });
  }

  console.log(
    JSON.stringify(
      {
        fixture: fixturePath,
        modelsDir,
        skipped: {
          whisperSmall: !existsSync(whisperSmallPath),
          parakeetV3: !existsSync(fluidaudioPath) || !parakeetDownloaded(parakeetModelDir),
        },
        results,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
