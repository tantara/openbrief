import { describe, expect, it } from "vitest";
import { createVoiceMessageDownloadFileName } from "@/services/supertonicService";

describe("supertonicService", () => {
  it("uses the generated voice message basename for downloads", () => {
    expect(
      createVoiceMessageDownloadFileName({
        audioPath:
          "videos/video-1/chat/tts/chat-1/voice-message-123/voice-message-123.wav",
      }),
    ).toBe("voice-message-123.wav");
  });

  it("falls back to a filesystem-safe voice message timestamp", () => {
    expect(
      createVoiceMessageDownloadFileName(
        {
          audioPath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
        },
        new Date("2026-05-24T04:52:19.551Z"),
      ),
    ).toBe("voice-message-2026-05-24T04-52-19-551Z.wav");
  });
});
