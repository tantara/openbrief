import { describe, expect, it } from "vitest";

import {
  isLanguageSupportedByModel,
  isSynthesisLanguageSupportedByModel,
  localSttModelCardForModel,
  localTtsModelCardForModel,
  parakeetV3Languages,
  qwen3AsrLanguages,
  qwen3TtsLanguages,
  supertonic3Languages,
  synthesisLanguagesForModel,
  transcriptionLanguagesForModel,
  whisperLanguages,
} from "./index";

describe("local STT model cards", () => {
  it("limits Parakeet v3 transcription languages to the FluidAudio allowlist", () => {
    const codes = transcriptionLanguagesForModel("parakeet-tdt-0.6b-v3").map(
      (language) => language.code,
    );

    expect(codes).toContain("auto");
    expect(codes).toContain("en");
    expect(codes).toContain("uk");
    expect(codes).not.toContain("ko");
    expect(codes).not.toContain("ja");
    expect(codes).not.toContain("zh");
    expect(parakeetV3Languages).toHaveLength(25);
  });

  it("uses the full Whisper language list for Whisper models", () => {
    const codes = transcriptionLanguagesForModel("whisper-small").map(
      (language) => language.code,
    );

    expect(codes).toContain("auto");
    expect(codes).toContain("ko");
    expect(codes).toContain("ja");
    expect(codes).toContain("zh");
    expect(codes).toContain("yue");
    expect(whisperLanguages.length).toBeGreaterThan(90);
  });

  it("checks whether a selected model supports a language", () => {
    expect(isLanguageSupportedByModel("parakeet-tdt-0.6b-v3", "en")).toBe(true);
    expect(isLanguageSupportedByModel("parakeet-tdt-0.6b-v3", "ko")).toBe(
      false,
    );
    expect(isLanguageSupportedByModel("whisper-small", "ko")).toBe(true);
    expect(isLanguageSupportedByModel("whisper-small", "auto")).toBe(true);
  });

  it("lists Qwen3-ASR languages supported by the forced aligner timestamps", () => {
    const codes = transcriptionLanguagesForModel("qwen3-asr-0.6B").map(
      (language) => language.code,
    );

    expect(codes).toContain("auto");
    expect(codes).toContain("zh");
    expect(codes).toContain("en");
    expect(codes).toContain("yue");
    expect(codes).toContain("ja");
    expect(codes).toContain("es");
    expect(codes).not.toContain("fil");
    expect(codes).not.toContain("ar");
    expect(codes).not.toContain("vi");
    expect(qwen3AsrLanguages).toHaveLength(11);
  });

  it("resolves known model ids to reusable model cards", () => {
    expect(localSttModelCardForModel("qwen3-asr-0.6B").engine).toBe(
      "qwen3-asr",
    );
    expect(localSttModelCardForModel("parakeet-tdt-0.6b-v3").engine).toBe(
      "fluidaudio",
    );
    expect(localSttModelCardForModel("whisper-small").engine).toBe(
      "whisper.cpp",
    );
  });
});

describe("local TTS model cards", () => {
  it("lists Supertonic 3 synthesis languages", () => {
    const codes = synthesisLanguagesForModel("Supertone/supertonic-3").map(
      (language) => language.code,
    );

    expect(codes).toContain("en");
    expect(codes).toContain("ko");
    expect(codes).toContain("ja");
    expect(codes).toContain("ar");
    expect(codes).toContain("vi");
    expect(codes).not.toContain("auto");
    expect(codes).not.toContain("zh");
    expect(supertonic3Languages).toHaveLength(31);
  });

  it("checks whether Supertonic 3 supports a synthesis language", () => {
    expect(
      isSynthesisLanguageSupportedByModel("Supertone/supertonic-3", "en"),
    ).toBe(true);
    expect(
      isSynthesisLanguageSupportedByModel("Supertone/supertonic-3", "zh"),
    ).toBe(false);
  });

  it("resolves Supertonic 3 to the reusable TTS model card", () => {
    expect(localTtsModelCardForModel("Supertone/supertonic-3").engine).toBe(
      "supertonic",
    );
  });

  it("lists Qwen3-TTS synthesis languages", () => {
    const codes = synthesisLanguagesForModel("qwen-tts-1.7B").map(
      (language) => language.code,
    );

    expect(codes).toEqual([
      "zh",
      "en",
      "ja",
      "ko",
      "de",
      "fr",
      "ru",
      "pt",
      "es",
      "it",
    ]);
    expect(qwen3TtsLanguages).toHaveLength(10);
    expect(isSynthesisLanguageSupportedByModel("qwen-tts-0.6B", "zh")).toBe(
      true,
    );
    expect(isSynthesisLanguageSupportedByModel("qwen-tts-1.7B", "ar")).toBe(
      false,
    );
  });
});
