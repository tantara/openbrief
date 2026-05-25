import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type { VideoComponentName } from "@/domain/video-component-catalog";
import {
  buildVideoComponentPromptContext,
  validateVideoComponentSelection,
} from "@/domain/video-component-catalog";
import type { VideoGenerationScenario } from "@/domain/video-generation";
import { formatTranscriptSegment } from "@/domain/summary";

export type EditorAgentPlanKind = "composition" | "transcript-edit";

export type EditorAgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtIso: string;
  plan?: EditorAgentPlan;
};

export type EditorAgentStoryboardScene = {
  title: string;
  narration: string;
  startSeconds: number;
  durationSeconds: number;
};

export type EditorAgentTranscriptCut = {
  startSeconds: number;
  endSeconds: number;
  reason: string;
};

export type EditorAgentPlan = {
  kind: EditorAgentPlanKind;
  summary: string;
  scenario: VideoGenerationScenario;
  direction: string;
  componentNames: VideoComponentName[];
  storyboard: EditorAgentStoryboardScene[];
  transcriptEdit?: {
    cuts: EditorAgentTranscriptCut[];
    renderNotes: string[];
  };
  validation: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
};

export type EditorAgentPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

let editorAgentMessageSequence = 0;

export type CreateEditorAgentPromptInput = {
  asset: VideoAsset;
  summary?: SummaryDocument;
  transcript: TranscriptSegment[];
  instruction: string;
  kind: EditorAgentPlanKind;
};

export function createEditorAgentPrompt({
  asset,
  summary,
  transcript,
  instruction,
  kind,
}: CreateEditorAgentPromptInput): EditorAgentPrompt {
  const componentContext = buildVideoComponentPromptContext({ query: instruction });
  const transcriptContext = transcript
    .slice(0, 24)
    .map(formatTranscriptSegment)
    .join("\n");

  return {
    systemPrompt: [
      "You are OpenBrief Editor Agent, a native video-editing assistant.",
      "You replicate useful HyperFrames and video-use skill behavior through JSON plans only.",
      "Never request shell access, arbitrary filesystem writes, network installs, or provider secrets.",
      "Trusted preview/render execution is owned by OpenBrief after your validated plan is applied.",
      "For HyperFrames: choose only pinned components, keep composition deterministic, and return componentNames[].",
      "For video-use style editing: propose transcript EDL cuts only; cuts must be numeric, ordered, non-overlapping, and within source timing.",
      "Return only valid JSON matching this shape:",
      '{"kind":"composition|transcript-edit","summary":"...","scenario":"summary-to-video|pdf-to-video|csv-to-video","direction":"...","componentNames":["caption-clip-wipe"],"storyboard":[{"title":"...","narration":"...","startSeconds":0,"durationSeconds":8}],"transcriptEdit":{"cuts":[{"startSeconds":0,"endSeconds":1,"reason":"..."}],"renderNotes":["..."]}}',
      "",
      componentContext,
    ].join("\n"),
    userPrompt: [
      `Source title: ${asset.title || asset.originalFileName || "Untitled source"}`,
      `Requested plan kind: ${kind}`,
      `User instruction: ${instruction || "Create a concise native video plan."}`,
      "",
      "Summary:",
      summary?.markdown?.slice(0, 2400) || "No summary is available.",
      "",
      "Transcript excerpt:",
      transcriptContext || "No transcript is available.",
    ].join("\n"),
  };
}

export function parseEditorAgentPlanJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? extractFirstJsonObject(trimmed);

  return JSON.parse(candidate);
}

export function validateEditorAgentPlan(
  value: unknown,
  context: {
    fallbackKind: EditorAgentPlanKind;
    fallbackScenario: VideoGenerationScenario;
    transcript: TranscriptSegment[];
  },
): EditorAgentPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidate = isRecord(value) ? value : {};
  const kind = normalizePlanKind(candidate.kind, context.fallbackKind);
  const componentNames = normalizeComponentNames(candidate.componentNames);
  const componentValidation = validateVideoComponentSelection(componentNames);

  if (!componentValidation.ok) {
    errors.push(
      `Unknown video components: ${componentValidation.unknownNames.join(", ")}`,
    );
  }

  const storyboard = normalizeStoryboard(candidate.storyboard, warnings);
  const transcriptEdit = normalizeTranscriptEdit(
    candidate.transcriptEdit,
    context.transcript,
    errors,
    warnings,
  );

  if (kind === "transcript-edit" && !transcriptEdit.cuts.length) {
    warnings.push("No transcript cuts were proposed.");
  }

  return {
    kind,
    summary: stringValue(candidate.summary) || "Drafted an editor plan.",
    scenario: normalizeScenario(candidate.scenario, context.fallbackScenario),
    direction: stringValue(candidate.direction) || "",
    componentNames: componentValidation.selected.map(
      (component) => component.name,
    ) as VideoComponentName[],
    storyboard,
    transcriptEdit,
    validation: {
      ok: errors.length === 0,
      errors,
      warnings,
    },
  };
}

export function createFallbackEditorAgentPlan({
  instruction,
  kind,
  scenario,
  transcript,
}: {
  instruction: string;
  kind: EditorAgentPlanKind;
  scenario: VideoGenerationScenario;
  transcript: TranscriptSegment[];
}): EditorAgentPlan {
  return validateEditorAgentPlan(
    {
      kind,
      summary:
        kind === "transcript-edit"
          ? "Drafted a conservative transcript edit plan."
          : "Drafted a native HyperFrames composition plan.",
      scenario,
      direction: instruction,
      componentNames: instruction.toLowerCase().match(/caption|tiktok|wipe|subtitle/)
        ? ["caption-clip-wipe"]
        : [],
      storyboard: [
        {
          title: "Hook",
          narration: "Open with the strongest summary point.",
          startSeconds: 0,
          durationSeconds: 8,
        },
        {
          title: "Evidence",
          narration: "Show the supporting context with concise captions.",
          startSeconds: 8,
          durationSeconds: 24,
        },
        {
          title: "Takeaway",
          narration: "Close with a clear final takeaway.",
          startSeconds: 32,
          durationSeconds: 13,
        },
      ],
      transcriptEdit: {
        cuts: transcriptToConservativeCuts(transcript),
        renderNotes: [
          "Keep cuts on transcript segment boundaries until word-level EDL is available.",
          "Render through the trusted OpenBrief helper.",
        ],
      },
    },
    { fallbackKind: kind, fallbackScenario: scenario, transcript },
  );
}

export function createEditorAgentMessageId({
  role,
  nowIso = new Date().toISOString(),
}: {
  role: EditorAgentMessage["role"];
  nowIso?: string;
}) {
  editorAgentMessageSequence += 1;

  return `editor-agent-${role}-${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}-${editorAgentMessageSequence}`;
}

export function createEditorAgentMessage({
  role,
  content,
  plan,
  nowIso = new Date().toISOString(),
}: {
  role: EditorAgentMessage["role"];
  content: string;
  plan?: EditorAgentPlan;
  nowIso?: string;
}): EditorAgentMessage {
  return {
    id: createEditorAgentMessageId({ role, nowIso }),
    role,
    content,
    plan,
    createdAtIso: nowIso,
  };
}

function normalizePlanKind(
  value: unknown,
  fallback: EditorAgentPlanKind,
): EditorAgentPlanKind {
  return value === "composition" || value === "transcript-edit" ? value : fallback;
}

function normalizeScenario(
  value: unknown,
  fallback: VideoGenerationScenario,
): VideoGenerationScenario {
  return value === "summary-to-video" ||
    value === "pdf-to-video" ||
    value === "csv-to-video"
    ? value
    : fallback;
}

function normalizeComponentNames(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeStoryboard(value: unknown, warnings: string[]) {
  if (!Array.isArray(value)) {
    warnings.push("No storyboard scenes were returned.");
    return [];
  }

  return value.flatMap((item): EditorAgentStoryboardScene[] => {
    if (!isRecord(item)) return [];
    const title = stringValue(item.title);
    const narration = stringValue(item.narration);
    const startSeconds = numberValue(item.startSeconds);
    const durationSeconds = numberValue(item.durationSeconds);

    if (!title || !narration || startSeconds < 0 || durationSeconds <= 0) {
      return [];
    }

    return [{ title, narration, startSeconds, durationSeconds }];
  });
}

function normalizeTranscriptEdit(
  value: unknown,
  transcript: TranscriptSegment[],
  errors: string[],
  warnings: string[],
) {
  const candidate = isRecord(value) ? value : {};
  const sourceDuration = transcriptDuration(transcript);
  const cuts = Array.isArray(candidate.cuts)
    ? candidate.cuts.flatMap((cut): EditorAgentTranscriptCut[] => {
        if (!isRecord(cut)) return [];

        const startSeconds = numberValue(cut.startSeconds);
        const endSeconds = numberValue(cut.endSeconds);
        const reason = stringValue(cut.reason) || "Remove low-signal segment.";

        if (startSeconds < 0 || endSeconds <= startSeconds) {
          errors.push("Transcript cut has invalid start/end seconds.");
          return [];
        }
        if (sourceDuration > 0 && endSeconds > sourceDuration) {
          errors.push("Transcript cut extends beyond the transcript duration.");
          return [];
        }

        return [{ startSeconds, endSeconds, reason }];
      })
    : [];

  const sortedCuts = [...cuts].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  );

  for (let index = 1; index < sortedCuts.length; index += 1) {
    if (sortedCuts[index].startSeconds < sortedCuts[index - 1].endSeconds) {
      errors.push("Transcript cuts must not overlap.");
      break;
    }
  }

  if (cuts.length !== sortedCuts.length) {
    warnings.push("Some transcript cuts were ignored because they were malformed.");
  }

  return {
    cuts: sortedCuts,
    renderNotes: Array.isArray(candidate.renderNotes)
      ? candidate.renderNotes.filter(
          (note): note is string => typeof note === "string" && note.trim().length > 0,
        )
      : [],
  };
}

function transcriptToConservativeCuts(transcript: TranscriptSegment[]) {
  return transcript
    .filter((segment) => /\b(um|uh|like|you know)\b/i.test(segment.text))
    .slice(0, 5)
    .flatMap((segment): EditorAgentTranscriptCut[] => {
      if (!segment.endSeconds || segment.endSeconds <= segment.startSeconds) {
        return [];
      }

      return [
        {
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          reason: "Potential filler or low-signal transcript segment.",
        },
      ];
    });
}

function transcriptDuration(transcript: TranscriptSegment[]) {
  return Math.max(
    0,
    ...transcript.map((segment) => segment.endSeconds ?? segment.startSeconds),
  );
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("editor_agent_json_not_found");
  }

  return text.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}
