import {
  type HelperCommand,
  type HelperCommandResult,
  type HelperEvent,
  validateHelperCommand,
} from "@/domain/helper-protocol";

export type HelperClient = {
  run(command: HelperCommand, options?: HelperRunOptions): Promise<HelperCommandResult>;
  eventsForJob(jobId: string): HelperEvent[];
};

export type HelperRunOptions = {
  onEvent?: (event: HelperEvent) => void;
};

export class FakeHelperClient implements HelperClient {
  private readonly events: HelperEvent[] = [];

  async run(command: HelperCommand, options: HelperRunOptions = {}): Promise<HelperCommandResult> {
    const validation = validateHelperCommand(command);

    if (!validation.ok) {
      const failedEvent: HelperEvent = {
        type: "job_failed",
        jobId: command.jobId,
        command: command.command,
        errorCode: validation.errorCode,
        message: validation.errorCode,
      };

      this.recordEvent(failedEvent, options);
      throw new Error(validation.errorCode);
    }

    this.recordEvent({
      type: "job_started",
      jobId: command.jobId,
      command: command.command,
    }, options);

    if (command.command === "cancel_job") {
      const result: HelperCommandResult = {
        command: "cancel_job",
        targetJobId: command.targetJobId,
        cancelled: true,
      };

      this.recordEvent({
        type: "job_cancelled",
        jobId: command.jobId,
        command: "cancel_job",
        targetJobId: command.targetJobId,
      }, options);
      this.recordEvent({
        type: "job_completed",
        jobId: command.jobId,
        command: command.command,
        result,
      }, options);

      return result;
    }

    this.recordEvent({
      type: "job_progress",
      jobId: command.jobId,
      command: command.command,
      progressPercent: 50,
      message: "fake-helper-progress",
    }, options);

    const result = createFakeResult(command);

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

  private recordEvent(event: HelperEvent, options: HelperRunOptions) {
    this.events.push(event);
    options.onEvent?.(event);
  }
}

function createFakeResult(command: Exclude<HelperCommand, { command: "cancel_job" }>) {
  switch (command.command) {
    case "probe_media":
      return {
        command: "probe_media",
        durationSeconds: 120,
        fileSizeBytes: 1048576,
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
      } satisfies HelperCommandResult;
    case "download_youtube":
      return {
        command: "download_youtube",
        videoPath: `${command.outputDir}/fake-video.mp4`,
        title: "Fake YouTube Video",
        captionsAvailable: true,
        thumbnailPath: `${command.outputDir}/thumbnail/Fake-YouTube-Video-thumbnail.jpg`,
        authorName: "Fake Creator",
        authorUrl: "https://www.youtube.com/@fakecreator",
      } satisfies HelperCommandResult;
    case "extract_thumbnail":
      return {
        command: "extract_thumbnail",
        thumbnailPath: command.outputPath,
      } satisfies HelperCommandResult;
    case "list_captions":
      return {
        command: "list_captions",
        languages: [
          { code: "en", label: "English", kind: "manual" },
          { code: "ko", label: "Korean", kind: "automatic" },
        ],
      } satisfies HelperCommandResult;
    case "extract_captions":
      return {
        command: "extract_captions",
        captionsPath: `${command.outputDir}/captions.vtt`,
        captionsAvailable: true,
        segments: [
          {
            id: "youtube-captions-1",
            startSeconds: 0,
            endSeconds: 24,
            text: "Fake provider caption transcript.",
            sourceKind: "youtube-captions",
          },
        ],
      } satisfies HelperCommandResult;
    case "extract_audio":
      return {
        command: "extract_audio",
        audioPath: command.outputPath,
      } satisfies HelperCommandResult;
    case "transcode_video":
      return {
        command: "transcode_video",
        videoPath: command.outputPath,
      } satisfies HelperCommandResult;
    case "transcribe_audio":
      return {
        command: "transcribe_audio",
        transcriptPath: command.outputPath,
      } satisfies HelperCommandResult;
  }
}
