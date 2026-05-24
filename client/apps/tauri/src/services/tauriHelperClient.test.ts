import { describe, expect, it, vi } from "vitest";
import { helperProtocolVersion } from "@/domain/helper-protocol";
import { TauriHelperClient, type TauriInvoke } from "@/services/tauriHelperClient";

describe("Tauri helper client", () => {
  it("invokes the trusted Rust helper command and maps sidecar events", async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      events: [
        {
          event: "job_started",
          jobId: "job-1",
          command: "download_youtube",
        },
        {
          event: "job_progress",
          jobId: "job-1",
          command: "download_youtube",
          progress: 0.5,
          message: "starting media tool",
        },
        {
          event: "job_completed",
          jobId: "job-1",
          command: "download_youtube",
          result: {
            command: "download_youtube",
            videoPath: "videos/video-1/source.mp4",
            title: "Source",
            captionsAvailable: false,
          },
        },
      ],
      result: {
        command: "download_youtube",
        videoPath: "videos/video-1/source.mp4",
        title: "Source",
        captionsAvailable: false,
      },
    });
    const invoke = invokeMock as unknown as TauriInvoke;
    const client = new TauriHelperClient(invoke);

    const result = await client.run({
      protocolVersion: helperProtocolVersion,
      command: "download_youtube",
      jobId: "job-1",
      url: "https://youtu.be/example",
      sourceKind: "youtube",
      outputDir: "videos/video-1",
      tempDir: "job-temp/video-1",
      subtitleLanguages: ["en"],
    });

    expect(result).toMatchObject({
      command: "download_youtube",
      videoPath: "videos/video-1/source.mp4",
    });
    expect(invokeMock).toHaveBeenCalledWith("run_helper_command", {
      command: expect.objectContaining({
        command: "download_youtube",
        url: "https://youtu.be/example",
      }),
    });
    expect(client.eventsForJob("job-1")).toMatchObject([
      { type: "job_started" },
      { type: "job_progress", progressPercent: 50 },
      { type: "job_completed" },
    ]);
  });

  it("keeps provider-like secret fields out of helper invocation payloads", async () => {
    const invokeMock = vi.fn().mockResolvedValue({
      events: [
        {
          event: "job_completed",
          jobId: "job-1",
          command: "probe_media",
          result: {
            command: "probe_media",
            durationSeconds: 1,
            fileSizeBytes: 2,
            container: "mp4",
          },
        },
      ],
      result: {
        command: "probe_media",
        durationSeconds: 1,
        fileSizeBytes: 2,
        container: "mp4",
      },
    });
    const invoke = invokeMock as unknown as TauriInvoke;
    const client = new TauriHelperClient(invoke);

    await client.run({
      protocolVersion: helperProtocolVersion,
      command: "probe_media",
      jobId: "job-1",
      inputPath: "videos/video-1/source.mp4",
    });

    const serialized = JSON.stringify(invokeMock.mock.calls[0]);

    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("provider");
  });
});
