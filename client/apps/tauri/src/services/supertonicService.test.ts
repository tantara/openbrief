import { describe, expect, it } from "vitest";
import { createVoiceMessageDownloadFileName } from "@/services/supertonicService";

describe("supertonicService", () => {
  it("uses text, voice, and short generated id for chat voice downloads", () => {
    const shortId = BigInt("1779643696742777000").toString(36).slice(-6);

    expect(
      createVoiceMessageDownloadFileName(
        {
          audioPath:
            "videos/video-1/chat/tts/chat-1/voice-message-1779643696742777000/voice-message-1779643696742777000.wav",
          generationId: "voice-message-1779643696742777000",
        },
        { text: "Answer from transcript with details.", voiceName: "Mark (M1)" },
      ),
    ).toBe(`Answer from transcri_Mark (M1)_${shortId}.wav`);
  });

  it("falls back to a readable stem when generation metadata is sparse", () => {
    expect(
      createVoiceMessageDownloadFileName(
        {
          audioPath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
        },
        { text: "Legacy answer", voiceName: "Default" },
        new Date("2026-05-24T04:52:19.551Z"),
      ),
    ).toBe("Legacy answer_Default_tts-1.wav");
  });
});
