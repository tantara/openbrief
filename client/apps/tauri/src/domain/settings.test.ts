import { describe, expect, it } from "vitest";
import { selectPreferredSttModel, type SttModelStatus } from "@/domain/settings";

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
});
