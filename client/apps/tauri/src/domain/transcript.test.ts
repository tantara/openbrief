import { describe, expect, it } from "vitest";
import {
  createAudioExtractionCommand,
  createCaptionLanguageListCommand,
  createCaptionExtractionCommand,
  createDefaultTranscriptSegments,
  createTranscribeAudioCommand,
} from "@/domain/transcript";
import {
  createTranscriptSourceVariant,
  createTranscriptVariant,
} from "@/domain/transcript-actions";
import type { VideoAsset } from "@/domain/media-library";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

describe("transcript domain", () => {
  it("creates a captions-first helper command", () => {
    const command = createCaptionExtractionCommand({ video });

    expect(command).toMatchObject({
      command: "extract_captions",
      videoPath: "videos/video-1/video.mp4",
      sourceUrl: "https://youtu.be/example",
      outputDir: "videos/video-1/transcript",
      languages: ["en"],
    });
  });

  it("creates a provider caption language listing command", () => {
    expect(createCaptionLanguageListCommand({ video })).toMatchObject({
      command: "list_captions",
      jobId: "transcript-video-1-caption-languages",
      sourceUrl: "https://youtu.be/example",
    });

    expect(
      createCaptionLanguageListCommand({
        video: {
          ...video,
          sourceKind: "local-file",
          originalUri: "file:///Users/test/video.mp4",
        },
      }),
    ).toBeUndefined();
  });

  it("creates audio and transcription commands for STT fallback", () => {
    const audio = createAudioExtractionCommand({ video });
    const stt = createTranscribeAudioCommand({
      request: {
        video,
        whisperModelPath: "models/tiny.bin",
        whisperLanguage: "ko",
      },
      audioPath: audio.outputPath,
    });

    expect(audio).toMatchObject({
      command: "extract_audio",
      outputPath: "videos/video-1/audio/Design-Review-audio.wav",
    });
    expect(stt).toMatchObject({
      command: "transcribe_audio",
      audioPath: "videos/video-1/audio/Design-Review-audio.wav",
      enginePreference: "auto",
      modelPath: "models/tiny.bin",
      language: "ko",
      outputPath: "videos/video-1/transcript/transcript.json",
    });
  });

  it("uses Parakeet v3 as an auto STT preference with Whisper fallback path", () => {
    const stt = createTranscribeAudioCommand({
      request: {
        video,
        whisperModelPath: "models/fluidaudio/parakeet-tdt-0.6b-v3",
        languages: ["en-US"],
      },
      audioPath: "videos/video-1/audio/Design-Review-audio.wav",
    });

    expect(stt).toMatchObject({
      command: "transcribe_audio",
      enginePreference: "auto",
      modelId: "parakeet-tdt-0.6b-v3",
      modelPath: "models/ggml-small.bin",
      language: "en-US",
    });
  });

  it("normalizes transcript text into timestamped segments", () => {
    const segments = createDefaultTranscriptSegments(video, "youtube-captions");

    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({
      id: "youtube-captions-1",
      startSeconds: 0,
      endSeconds: 24,
      sourceKind: "youtube-captions",
    });
  });

  it("stores transcript variants under their variant id directories", () => {
    const segments = createDefaultTranscriptSegments(video, "youtube-captions");

    expect(
      createTranscriptVariant({
        video,
        kind: "translation",
        language: { code: "ko", label: "Korean" },
        provider: "openai",
        segments,
        nowIso: "2026-05-21T00:00:00.000Z",
      }).artifactPath,
    ).toBe(
      "videos/video-1/transcript/transcript-video-1-ko-2026-05-21T00-00-00.000Z/transcript.txt",
    );
    expect(
      createTranscriptSourceVariant({
        video,
        sourceKind: "local-stt",
        segments,
      }).artifactPath,
    ).toBe("videos/video-1/transcript/transcript-video-1-local-stt/transcript.txt");
  });
});
