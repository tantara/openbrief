import { describe, expect, it } from "vitest";
import {
  createZeroStorageUsageSnapshot,
  formatModelSize,
  formatStoragePercentage,
  formatStorageSize,
  selectPreferredSttModel,
  type SttModelStatus,
} from "@/domain/settings";

const models: SttModelStatus["models"] = [
  {
    id: "parakeet-tdt-0.6b-v3",
    name: "Parakeet v3",
    engine: "fluidaudio",
    fileName: "fluidaudio/parakeet-tdt-0.6b-v3",
    sizeMb: 2100,
    downloaded: false,
    recommended: true,
  },
  {
    id: "whisper-small",
    name: "Whisper Small",
    engine: "whisper.cpp",
    fileName: "ggml-small.bin",
    sizeMb: 466,
    downloaded: true,
    recommended: false,
  },
];

describe("settings domain", () => {
  it("keeps an existing selected STT model when it is present", () => {
    expect(selectPreferredSttModel(models, "whisper-small")?.id).toBe(
      "whisper-small",
    );
  });

  it("falls back to the recommended STT model when selected id is missing", () => {
    expect(selectPreferredSttModel(models, "missing")?.id).toBe(
      "parakeet-tdt-0.6b-v3",
    );
  });

  it("falls back to the first STT model when no model is recommended", () => {
    expect(
      selectPreferredSttModel(
        models.map((model) => ({ ...model, recommended: false })),
        "missing",
      )?.id,
    ).toBe("parakeet-tdt-0.6b-v3");
  });

  it("creates a six-category zero storage snapshot", () => {
    const snapshot = createZeroStorageUsageSnapshot(
      "2026-05-24T00:00:00.000Z",
    );

    expect(snapshot.totalBytes).toBe(0);
    expect(snapshot.measuredAtIso).toBe("2026-05-24T00:00:00.000Z");
    expect(snapshot.items.map((item) => item.category)).toEqual([
      "database",
      "video",
      "audio",
      "pdf",
      "csv",
      "model-checkpoint",
    ]);
    expect(snapshot.items.every((item) => item.sizeBytes === 0)).toBe(true);
    expect(snapshot.items.every((item) => item.percentage === 0)).toBe(true);
  });

  it("formats storage sizes with binary units", () => {
    expect(formatStorageSize(0)).toBe("0 B");
    expect(formatStorageSize(512)).toBe("512 B");
    expect(formatStorageSize(1_258_291)).toBe("1.2 MB");
    expect(formatStorageSize(2_254_381_363)).toBe("2.1 GB");
  });

  it("formats model sizes from MB metadata with decimal model units", () => {
    expect(formatModelSize(466)).toBe("466 MB");
    expect(formatModelSize(5700)).toBe("5.7 GB");
  });

  it("formats storage percentages for compact display", () => {
    expect(formatStoragePercentage(0)).toBe("0%");
    expect(formatStoragePercentage(0.4)).toBe("<1%");
    expect(formatStoragePercentage(66.4)).toBe("66%");
    expect(formatStoragePercentage(-4)).toBe("0%");
  });
});
