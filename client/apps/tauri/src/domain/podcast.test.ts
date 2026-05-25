import { describe, expect, it } from "vitest";
import {
  createPodcastArtifactPaths,
  createPodcastScriptPrompt,
  parsePodcastScriptJson,
  validatePodcastScriptResponse,
  type PodcastSpeakerConfig,
} from "@/domain/podcast";
import type { SummaryDocument, TranscriptSegment, VideoAsset } from "@/domain/media-library";

const video: VideoAsset = {
  id: "video-1",
  title: "Workbench sample",
  sourceKind: "local-file",
  sourceType: "audio",
  originalUri: "file:///sample.mp3",
  libraryPath: "audios/video-1/source.mp3",
  importStatus: "ready",
  createdAtIso: "2026-05-24T00:00:00.000Z",
  durationSeconds: 120,
};

const transcript: TranscriptSegment[] = [
  {
    id: "seg-1",
    startSeconds: 0,
    endSeconds: 4,
    text: "Welcome to OpenBrief.",
    sourceKind: "local-stt",
  },
];

const summary: SummaryDocument = {
  id: "summary-1",
  videoId: "video-1",
  markdown: "# Summary\n\nOpenBrief helps review media.",
  provider: "openai",
  sourceSegmentCount: 1,
  createdAtIso: "2026-05-24T00:00:00.000Z",
};

const speakers: [PodcastSpeakerConfig, PodcastSpeakerConfig] = [
  { id: "A", label: "Mark", voiceStyleId: "M1" },
  { id: "B", label: "Sophia", voiceStyleId: "F2" },
];

describe("podcast domain", () => {
  it("builds prompt with mode, speakers, language, and selected source", () => {
    const prompt = createPodcastScriptPrompt({
      video,
      sourceKind: "current-summary",
      summary,
      transcript,
      mode: "podcast-summary",
      lengthMode: "short",
      outputLanguage: "English",
      speakers,
    });

    expect(prompt.systemPrompt).toContain("Return only valid JSON");
    expect(prompt.userPrompt).toContain("conversational podcast summary");
    expect(prompt.userPrompt).toContain("Speaker A: Mark");
    expect(prompt.userPrompt).toContain(
      "Length: 6 to 8 concise turns, about 3 to 5 minutes",
    );
    expect(prompt.userPrompt).toContain("Output language: English");
    expect(prompt.userPrompt).toContain("# Summary");
  });

  it("creates media-type-aware artifact paths", () => {
    expect(createPodcastArtifactPaths(video, "podcast-1")).toEqual({
      rootDirectory: "audios/video-1/podcast/podcast-1",
      manifestPath: "audios/video-1/podcast/podcast-1/podcast.json",
      scriptPath: "audios/video-1/podcast/podcast-1/script.md",
      turnAudioDirectory: "audios/video-1/podcast/podcast-1/audio/turns",
      podcastAudioPath: "audios/video-1/podcast/podcast-1/audio/podcast.wav",
    });
  });

  it("parses and validates a two-speaker script response", () => {
    const parsed = parsePodcastScriptJson(`\`\`\`json
      {
        "title": "Sample show",
        "turns": [
          {"speakerId":"A","text":"Opening thought.","anchor":{"startSeconds":0}},
          {"speakerId":"B","text":"Helpful response."},
          {"speakerId":"A","text":"More context."},
          {"speakerId":"B","text":"Closing note.","anchor":{"startSeconds":999}}
        ]
      }
    \`\`\``);

    const script = validatePodcastScriptResponse(parsed, { video, speakers });

    expect(script.title).toBe("Sample show");
    expect(script.turns).toHaveLength(4);
    expect(script.turns[0]).toMatchObject({
      id: "turn-0001",
      speakerId: "A",
      speakerLabel: "Mark",
      anchor: { startSeconds: 0 },
    });
    expect(script.turns[3].anchor).toBeUndefined();
    expect(script.markdown).toContain("**Sophia**");
  });

  it("rejects short or unknown-speaker scripts", () => {
    expect(() =>
      validatePodcastScriptResponse(
        { title: "Bad", turns: [{ speakerId: "C", text: "Nope" }] },
        { video, speakers },
      ),
    ).toThrow("podcast_script_too_short");

    expect(() =>
      validatePodcastScriptResponse(
        {
          turns: [
            { speakerId: "A", text: "One" },
            { speakerId: "B", text: "Two" },
            { speakerId: "A", text: "Three" },
            { speakerId: "C", text: "Four" },
          ],
        },
        { video, speakers },
      ),
    ).toThrow("podcast_turn_speaker_invalid");
  });
});
