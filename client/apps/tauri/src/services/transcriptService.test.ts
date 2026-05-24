import { describe, expect, it } from "vitest";
import type {
  HelperCommand,
  HelperCommandResult,
  HelperEvent,
} from "@/domain/helper-protocol";
import type { VideoAsset } from "@/domain/media-library";
import { createHelperTranscriptService } from "@/services/transcriptService";

const video: VideoAsset = {
  id: "video-1",
  title: "Design Review",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/video.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const localVideo: VideoAsset = {
  ...video,
  sourceKind: "local-file",
  originalUri: "file:///Users/test/Movies/source.mp4",
};

const audio: VideoAsset = {
  ...video,
  id: "audio-1",
  title: "Audio interview",
  sourceType: "audio",
  sourceKind: "local-file",
  originalUri: "file:///Users/test/Music/interview.mp3",
  libraryPath: "audio/local-interview/interview.mp3",
};

describe("transcript service", () => {
  it("lists provider caption languages before extraction", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "list_captions",
        languages: [
          { code: "en", label: "English", kind: "manual" },
          { code: "ko", label: "Korean", kind: "automatic" },
        ],
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const languages = await service.listCaptionLanguages({ video });

    expect(helper.commands).toEqual(["list_captions"]);
    expect(languages).toEqual([
      { code: "en", label: "English", kind: "manual" },
      { code: "ko", label: "Korean", kind: "automatic" },
    ]);
  });

  it("extracts YouTube captions before trying local STT", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_captions",
        captionsAvailable: true,
        captionsPath: "videos/video-1/transcript/captions.vtt",
        segments: [
          {
            id: "youtube-captions-1",
            startSeconds: 1,
            endSeconds: 3,
            text: "Actual provider caption.",
            sourceKind: "youtube-captions",
          },
        ],
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual(["extract_captions"]);
    expect(result.ok && result.job.preferredSource).toBe("youtube-captions");
    expect(result.ok && result.segments[0].sourceKind).toBe("youtube-captions");
    expect(result.ok && result.segments[0].text).toBe("Actual provider caption.");
  });

  it("skips provider captions when local STT is explicitly selected", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/video-1/transcript/transcript.json",
        text: "Whisper selected transcript.",
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({
      video,
      sourcePreference: "local-stt",
    });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual(["extract_audio", "transcribe_audio"]);
    expect(result.ok && result.job.preferredSource).toBe("local-stt");
    expect(result.ok && result.segments[0].text).toBe("Whisper selected transcript.");
  });

  it("falls back to extract audio and transcribe when captions are missing", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_captions",
        captionsAvailable: false,
      },
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/video-1/transcript/transcript.json",
        text: "The actual local transcript text.",
        segments: [
          {
            id: "local-stt-1",
            startSeconds: 1.25,
            endSeconds: 2.75,
            text: "The actual local transcript text.",
            sourceKind: "local-stt",
            words: [
              {
                text: "The",
                startSeconds: 1.25,
                endSeconds: 1.55,
              },
            ],
          },
        ],
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual([
      "extract_captions",
      "extract_audio",
      "transcribe_audio",
    ]);
    expect(result.ok && result.job.preferredSource).toBe("local-stt");
    expect(result.ok && result.segments[0].sourceKind).toBe("local-stt");
    expect(result.ok && result.segments[0].text).toBe(
      "The actual local transcript text.",
    );
    expect(result.ok && result.segments[0].startSeconds).toBe(1.25);
    expect(result.ok && result.segments[0].words?.[0]).toMatchObject({
      text: "The",
      startSeconds: 1.25,
    });
  });

  it("skips remote captions and starts local STT for local files", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/video-1/transcript/transcript.json",
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video: localVideo });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual(["extract_audio", "transcribe_audio"]);
    expect(result.ok && result.job.preferredSource).toBe("local-stt");
  });

  it("transcribes audio assets through the local STT workflow", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_audio",
        audioPath: "videos/audio-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/audio-1/transcript/transcript.json",
        text: "Audio transcript.",
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video: audio });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual(["extract_audio", "transcribe_audio"]);
    expect(helper.receivedCommands[0]).toMatchObject({
      command: "extract_audio",
      videoPath: "audio/local-interview/interview.mp3",
      outputPath: "videos/audio-1/audio/audio.wav",
    });
    expect(result.ok && result.job.preferredSource).toBe("local-stt");
    expect(result.ok && result.segments[0]).toMatchObject({
      text: "Audio transcript.",
      sourceKind: "local-stt",
    });
  });

  it("continues to local STT when remote caption extraction fails", async () => {
    const helper = new ScriptedHelperClient([
      {
        throwValue:
          "yt-dlp exited with status exit status: 1: ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests",
      },
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/video-1/transcript/transcript.json",
      },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video });

    expect(result.ok).toBe(true);
    expect(helper.commands).toEqual([
      "extract_captions",
      "extract_audio",
      "transcribe_audio",
    ]);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "helper_event",
          event: expect.objectContaining({
            type: "job_failed",
            command: "extract_captions",
            message: expect.stringContaining("HTTP Error 429"),
          }),
        }),
      ]),
    );
  });

  it("preserves string helper failures instead of returning a generic pipeline error", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_captions",
        captionsAvailable: false,
      },
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      { throwValue: "transcribe_audio requires a transcription engine" },
    ]);
    const service = createHelperTranscriptService(helper);

    const result = await service.extractTranscript({ video });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe(
      "transcribe_audio requires a transcription engine",
    );
    expect(!result.ok && result.job.preferredSource).toBe("local-stt");
  });

  it("streams helper progress events while local STT is running", async () => {
    const helper = new ScriptedHelperClient([
      {
        command: "extract_captions",
        captionsAvailable: false,
      },
      {
        command: "extract_audio",
        audioPath: "videos/video-1/audio/audio.wav",
      },
      {
        command: "transcribe_audio",
        transcriptPath: "videos/video-1/transcript/transcript.json",
      },
    ]);
    const service = createHelperTranscriptService(helper);
    const events: HelperEvent[] = [];

    const result = await service.extractTranscript({ video }, {
      onEvent(event) {
        if (event.type === "helper_event") {
          events.push(event.event);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "job_progress",
          command: "transcribe_audio",
          progressPercent: 50,
        }),
      ]),
    );
  });
});

class ScriptedHelperClient {
  readonly commands: HelperCommand["command"][] = [];
  readonly receivedCommands: HelperCommand[] = [];
  private readonly events: HelperEvent[] = [];

  constructor(private readonly results: ScriptedHelperStep[]) {}

  async run(
    command: HelperCommand,
    options: { onEvent?: (event: HelperEvent) => void } = {},
  ): Promise<HelperCommandResult> {
    const result = this.results.shift();

    if (!result) {
      throw new Error("missing_scripted_result");
    }

    this.commands.push(command.command);
    this.receivedCommands.push(command);
    this.recordEvent({
      type: "job_started",
      jobId: command.jobId,
      command: command.command,
    }, options);

    if ("throwValue" in result) {
      this.recordEvent({
        type: "job_failed",
        jobId: command.jobId,
        command: command.command,
        errorCode: "helper_unavailable",
        message: String(result.throwValue),
      }, options);
      throw result.throwValue;
    }

    this.recordEvent({
      type: "job_progress",
      jobId: command.jobId,
      command: command.command,
      progressPercent: 50,
    }, options);
    this.recordEvent({
      type: "job_completed",
      jobId: command.jobId,
      command: command.command,
      result,
    }, options);

    return result;
  }

  eventsForJob(jobId: string) {
    return this.events.filter((event) => event.jobId === jobId);
  }

  private recordEvent(
    event: HelperEvent,
    options: { onEvent?: (event: HelperEvent) => void },
  ) {
    this.events.push(event);
    options.onEvent?.(event);
  }
}

type ScriptedHelperStep = HelperCommandResult | { throwValue: unknown };
