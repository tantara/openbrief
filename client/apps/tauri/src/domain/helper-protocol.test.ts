import { describe, expect, it } from "vitest";
import {
  classifyVideoProviderUrl,
  classifyYoutubeUrl,
  helperPayloadContainsProviderSecret,
  helperProtocolVersion,
  supportedVideoProviderDomains,
  type DownloadYoutubeCommand,
  type HelperCommand,
  validateHelperCommand,
} from "@/domain/helper-protocol";
import { FakeHelperClient } from "@/services/fakeHelperClient";

function downloadCommand(url: string): DownloadYoutubeCommand {
  const classification = classifyVideoProviderUrl(url);

  return {
    protocolVersion: helperProtocolVersion,
    command: "download_youtube",
    jobId: "job-1",
    url,
    sourceKind: classification.kind === "single-video" ? classification.provider : "youtube",
    outputDir: "videos/job-1",
    tempDir: "job-temp/job-1",
    subtitleLanguages: ["en"],
  };
}

describe("helper protocol contracts", () => {
  it("allows the Phase 2 helper command names", () => {
    const commandNames: HelperCommand["command"][] = [
      "probe_media",
      "download_youtube",
      "extract_thumbnail",
      "list_captions",
      "extract_captions",
      "extract_audio",
      "transcribe_audio",
      "cancel_job",
    ];

    expect(commandNames).toHaveLength(8);
  });

  it("rejects playlists, channels, profiles, and collections before helper execution", () => {
    expect(classifyYoutubeUrl("https://www.youtube.com/playlist?list=abc")).toMatchObject({
      kind: "unsupported-playlist-or-channel",
    });
    expect(classifyYoutubeUrl("https://www.youtube.com/@samplechannel")).toMatchObject({
      kind: "unsupported-playlist-or-channel",
    });
    expect(
      validateHelperCommand(downloadCommand("https://www.youtube.com/watch?v=abc&list=def")),
    ).toEqual({ ok: false, errorCode: "unsupported_url" });
    expect(validateHelperCommand(downloadCommand("https://www.tiktok.com/@samplecreator"))).toEqual({
      ok: false,
      errorCode: "unsupported_url",
    });
    expect(validateHelperCommand(downloadCommand("https://www.twitch.tv/openbrief"))).toEqual({
      ok: false,
      errorCode: "unsupported_url",
    });
    expect(validateHelperCommand(downloadCommand("https://vimeo.com/channels/samplechannel"))).toEqual({
      ok: false,
      errorCode: "unsupported_url",
    });
  });

  it.each([
    ["youtube", "YouTube", "https://youtu.be/abc123"],
    ["youtube", "YouTube", "https://www.youtube.com/shorts/abc123"],
    ["tiktok", "TikTok", "https://www.tiktok.com/@samplecreator/video/7320000000000000000"],
    ["tiktok", "TikTok", "https://vm.tiktok.com/ZMexample/"],
    ["twitch", "Twitch", "https://www.twitch.tv/videos/123456789"],
    ["twitch", "Twitch", "https://clips.twitch.tv/HelpfulClipSlug"],
    ["vimeo", "Vimeo", "https://vimeo.com/123456789"],
    ["vimeo", "Vimeo", "https://player.vimeo.com/video/123456789"],
  ] as const)("accepts single %s video URLs", (provider, label, url) => {
    expect(validateHelperCommand(downloadCommand(url))).toEqual({ ok: true });
    expect(classifyVideoProviderUrl(url)).toMatchObject({
      kind: "single-video",
      provider,
      label,
    });
  });

  it("keeps the public video provider domain allowlist explicit", () => {
    expect(supportedVideoProviderDomains).toEqual({
      youtube: ["youtube.com", "youtu.be"],
      tiktok: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
      twitch: ["twitch.tv", "clips.twitch.tv"],
      vimeo: ["vimeo.com", "player.vimeo.com"],
    });
    expect(classifyVideoProviderUrl("https://www.instagram.com/reel/example"))
      .toMatchObject({
        kind: "unsupported-provider",
      });
  });

  it("keeps provider credentials out of helper payloads", () => {
    expect(helperPayloadContainsProviderSecret(downloadCommand("https://youtu.be/abc123"))).toBe(
      false,
    );
    expect(
      helperPayloadContainsProviderSecret({
        protocolVersion: helperProtocolVersion,
        command: "list_captions",
        jobId: "job-caption-languages",
        sourceUrl: "https://youtu.be/abc123",
      }),
    ).toBe(false);
    expect(
      helperPayloadContainsProviderSecret({
        command: "extract_captions",
        jobId: "job-captions",
        videoPath: "videos/video-1/source.mp4",
        outputDir: "videos/video-1/transcript",
        languages: ["en"],
      }),
    ).toBe(false);
    expect(
      helperPayloadContainsProviderSecret({
        command: "transcribe_audio",
        jobId: "job-stt",
        audioPath: "job-temp/video-1/audio.wav",
        modelPath: "models/whisper.bin",
        language: "ko",
        outputPath: "videos/video-1/transcript/transcript.json",
      }),
    ).toBe(false);
    expect(
      helperPayloadContainsProviderSecret({
        command: "probe_media",
        nested: {
          authorization: "Bearer sk-secret",
          access_token: "access",
          refresh_token: "refresh",
          "x-api-key": "secret",
        },
      }),
    ).toBe(true);
  });

  it("emits fake progress and completion events without real execution", async () => {
    const helper = new FakeHelperClient();
    const result = await helper.run(downloadCommand("https://youtu.be/abc123"));

    expect(result).toMatchObject({
      command: "download_youtube",
      title: "Fake YouTube Video",
    });
    expect(helper.eventsForJob("job-1").map((event) => event.type)).toEqual([
      "job_started",
      "job_progress",
      "job_completed",
    ]);
  });
});
