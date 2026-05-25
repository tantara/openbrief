import { describe, expect, it } from "vitest";
import {
  createEditorAgentPrompt,
  createFallbackEditorAgentPlan,
  parseEditorAgentPlanJson,
  validateEditorAgentPlan,
} from "@/domain/editor-agent";

const asset = {
  id: "video-1",
  title: "Strategy Review",
  sourceKind: "local-file" as const,
  originalUri: "file:///strategy.mp4",
  libraryPath: "videos/video-1/strategy.mp4",
  importStatus: "ready" as const,
  createdAtIso: "2026-05-25T00:00:00.000Z",
};

const transcript = [
  {
    id: "s1",
    startSeconds: 0,
    endSeconds: 4,
    text: "Um this is the opening.",
    sourceKind: "local-stt" as const,
  },
  {
    id: "s2",
    startSeconds: 4,
    endSeconds: 9,
    text: "Native preview and render should come first.",
    sourceKind: "local-stt" as const,
  },
];

describe("editor agent domain", () => {
  it("creates skill-grounded prompts without granting execution authority", () => {
    const prompt = createEditorAgentPrompt({
      asset,
      transcript,
      instruction: "Make TikTok wipe captions",
      kind: "composition",
    });

    expect(prompt.systemPrompt).toContain("JSON plans only");
    expect(prompt.systemPrompt).toContain("caption-clip-wipe");
    expect(prompt.systemPrompt).toContain("Never request shell access");
    expect(prompt.userPrompt).toContain("Strategy Review");
  });

  it("parses fenced JSON and validates selected catalog components", () => {
    const parsed = parseEditorAgentPlanJson(`\`\`\`json
{
  "kind": "composition",
  "summary": "Create a caption-led short.",
  "scenario": "summary-to-video",
  "direction": "Use kinetic captions.",
  "componentNames": ["caption-clip-wipe"],
  "storyboard": [
    {"title": "Hook", "narration": "Start strong.", "startSeconds": 0, "durationSeconds": 8}
  ]
}
\`\`\``);
    const plan = validateEditorAgentPlan(parsed, {
      fallbackKind: "composition",
      fallbackScenario: "summary-to-video",
      transcript,
    });

    expect(plan.validation.ok).toBe(true);
    expect(plan.componentNames).toEqual(["caption-clip-wipe"]);
    expect(plan.storyboard).toHaveLength(1);
  });

  it("rejects unknown components and overlapping transcript cuts", () => {
    const plan = validateEditorAgentPlan(
      {
        kind: "transcript-edit",
        scenario: "summary-to-video",
        componentNames: ["made-up"],
        transcriptEdit: {
          cuts: [
            { startSeconds: 1, endSeconds: 3, reason: "low signal" },
            { startSeconds: 2, endSeconds: 4, reason: "overlap" },
          ],
        },
      },
      {
        fallbackKind: "transcript-edit",
        fallbackScenario: "summary-to-video",
        transcript,
      },
    );

    expect(plan.validation.ok).toBe(false);
    expect(plan.validation.errors).toContain("Unknown video components: made-up");
    expect(plan.validation.errors).toContain("Transcript cuts must not overlap.");
  });

  it("creates deterministic fallback plans for offline or mock use", () => {
    const plan = createFallbackEditorAgentPlan({
      instruction: "Add wipe captions",
      kind: "transcript-edit",
      scenario: "summary-to-video",
      transcript,
    });

    expect(plan.kind).toBe("transcript-edit");
    expect(plan.componentNames).toEqual(["caption-clip-wipe"]);
    expect(plan.transcriptEdit?.cuts[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 4,
    });
  });
});
