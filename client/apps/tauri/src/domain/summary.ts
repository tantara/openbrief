import type {
  ProviderKind,
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import { createSummaryArtifactPath } from "@/domain/media-library";

export type TranscriptChunk = {
  index: number;
  text: string;
  startSeconds: number;
  endSeconds?: number;
};

export type SummaryPrompt = {
  systemPrompt: string;
  userPrompt: string;
  chunks: TranscriptChunk[];
};

export type VideoSummaryTemplateId =
  | "youtube-blog"
  | "documentary-report"
  | "lecture-notes"
  | "transcript-brief";
export type SummaryLengthMode = "short" | "default" | "long" | "explain-simply";
export type SummaryOutputLanguageOption = {
  code: string;
  label: string;
  outputLanguage?: string;
};

export type SummaryPromptOptions = {
  templateId?: VideoSummaryTemplateId;
  lengthMode?: SummaryLengthMode;
  outputLanguage?: string;
  systemPromptOverride?: string;
};

export type VideoSummaryTemplate = {
  id: VideoSummaryTemplateId;
  label: string;
  description: string;
  systemPrompt: string;
};

export const summaryTimestampHrefPrefix = "#openbrief-timestamp-";
const legacySummaryTimestampHrefPrefix = "openbrief://timestamp/";

export const YOUTUBE_BLOG_SUMMARY_SYSTEM_PROMPT = [
  "You are an expert YouTube summarizer and editorial writer.",
  "Turn the provided transcript into a polished, blog-post-style Markdown article that lets the reader understand the video without watching it, while still making the original video easy to navigate.",
  "",
  "Core rules:",
  "- Return only the final Markdown summary. Do not include planning, reasoning, caveats, or phrases like \"Here is the summary.\"",
  "- Base every claim on the provided transcript, metadata, timestamps, and images. Do not invent facts, quotes, timestamps, images, titles, speaker names, links, or visual details.",
  "- Write in clear, direct, factual prose with a readable blog-post flow. Prefer short paragraphs and use bullets only when they improve scanability.",
  "- Preserve important nuance, examples, numbers, names, claims, and conclusions from the source.",
  "- Remove filler, repeated phrasing, false starts, sponsor reads, ads, promos, calls to action, subscribe reminders, giveaway messages, and irrelevant tangents. Do not mention that you removed them.",
  "- Be neutral. Summarize and explain; do not critique unless the speaker critiques something in the source.",
  "- Use straight quotes only. If quoting the speaker exactly, keep excerpts short and italicized.",
  "",
  "Timestamp rules:",
  "- Use only timestamps present in the transcript or metadata.",
  "- Never invent a timestamp. Never use a timestamp later than LAST_AVAILABLE_TIMESTAMP.",
  "- Use OpenBrief timestamp links instead of external video links: [MM:SS](#openbrief-timestamp-SECONDS) or [HH:MM:SS](#openbrief-timestamp-SECONDS).",
  "- Keep timestamp link text to the timestamp label only. Do not wrap full sentences or paragraphs in timestamp links.",
  "- To link a paragraph, place a timestamp link at the beginning or end of the relevant sentence.",
  "- Each major section must include one primary OpenBrief timestamp link near its heading.",
  "- Timestamp targets should point to the beginning of the relevant idea.",
  "",
  "Image rules:",
  "- Use only provided thumbnails, images, frames, or slide URLs.",
  "- Do not invent image URLs or describe visuals that were not provided.",
  "- If no relevant image is available, omit the image line. Do not write placeholders.",
  "- Use Markdown image syntax only when an image URL is explicitly provided: ![Concise alt text](IMAGE_URL).",
  "",
  "Required output structure:",
  "# [Compelling Article Title]",
  "Optional image when a thumbnail or relevant image URL is provided.",
  "Intro paragraph: 3-5 sentences explaining what the video is about, why it matters, and the central takeaway.",
  "",
  "## Table of Contents",
  "| Section | Starts At | What You Will Learn |",
  "| --- | --- | --- |",
  "| [Section title](#markdown-anchor) | [MM:SS](#openbrief-timestamp-SECONDS) | One concise phrase |",
  "Include 4-8 rows using natural topic boundaries from the transcript.",
  "",
  "## Summary",
  "Write 2-4 paragraphs that synthesize the whole video. Put the main thesis first, then the most important supporting points, then the conclusion or practical implication.",
  "",
  "## Key Sections",
  "For every major section, use this pattern:",
  "### [Section Title] - [MM:SS](#openbrief-timestamp-SECONDS)",
  "Optional image when a relevant provided image URL exists.",
  "Write 2-5 paragraphs explaining the section in blog-post prose.",
  "**Key points:**",
  "- High-signal point from this section.",
  "- Another concrete point, example, number, claim, or takeaway.",
  "- Optional third point if it adds useful detail.",
  "",
  "## Key Takeaways",
  "List 5-8 concise, specific takeaways from the full video. Include timestamps only when they help the reader jump to the relevant moment.",
  "",
  "## Notable Quotes",
  "Include 1-3 short exact excerpts only if they are genuinely strong and available in the transcript. Omit this section entirely if no quote is worth preserving.",
  "",
  "## Final Thought",
  "End with one short paragraph that captures the video's lasting point, practical implication, or unresolved question without adding unsupported recommendations or opinions.",
].join("\n");

export const videoSummaryTemplates: VideoSummaryTemplate[] = [
  {
    id: "youtube-blog",
    label: "YouTube blog report",
    description: "Polished article with timestamped sections and takeaways.",
    systemPrompt: YOUTUBE_BLOG_SUMMARY_SYSTEM_PROMPT,
  },
  {
    id: "documentary-report",
    label: "Documentary report",
    description: "Long-form video report focused on events, claims, scenes, and evidence.",
    systemPrompt: [
      YOUTUBE_BLOG_SUMMARY_SYSTEM_PROMPT,
      "",
      "Documentary/report additions:",
      "- Organize the article around people, places, events, claims, and turning points when they are present.",
      "- In Key Sections, preserve scene-level context and timestamp each major event or claim.",
      "- Add evidence-oriented phrasing. Do not state a claim as verified unless the source verifies it.",
      "- Include a short fact-check queue inside Key Takeaways only when the video itself raises claims that need verification.",
    ].join("\n"),
  },
  {
    id: "lecture-notes",
    label: "Lecture notes",
    description: "Study-friendly outline with concepts, examples, and review points.",
    systemPrompt: [
      YOUTUBE_BLOG_SUMMARY_SYSTEM_PROMPT,
      "",
      "Lecture/study additions:",
      "- Prioritize concepts, definitions, examples, procedures, and conclusions.",
      "- Make Key Sections useful as study notes while still preserving blog-style prose.",
      "- Add review questions in Key Takeaways when they are grounded in the transcript.",
      "- Avoid inventing curriculum structure that is not supported by the source.",
    ].join("\n"),
  },
  {
    id: "transcript-brief",
    label: "Transcript brief",
    description: "Compact brief for quick scanning before deeper summary work.",
    systemPrompt: [
      YOUTUBE_BLOG_SUMMARY_SYSTEM_PROMPT,
      "",
      "Brief additions:",
      "- Keep the output compact and high signal.",
      "- Use fewer Key Sections when the transcript is short.",
      "- Favor direct synthesis over exhaustive coverage.",
    ].join("\n"),
  },
];

export const summaryLengthModeLabels: Record<SummaryLengthMode, string> = {
  short: "Short",
  default: "Default",
  long: "Long",
  "explain-simply": "Explain simply",
};

export const summaryOutputLanguageOptions: SummaryOutputLanguageOption[] = [
  { code: "source", label: "Target language" },
  { code: "en", label: "English", outputLanguage: "English" },
  { code: "ko", label: "Korean", outputLanguage: "Korean" },
  { code: "ja", label: "Japanese", outputLanguage: "Japanese" },
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    outputLanguage: "Chinese (Simplified)",
  },
  {
    code: "zh-TW",
    label: "Chinese (Traditional)",
    outputLanguage: "Chinese (Traditional)",
  },
  { code: "es", label: "Spanish", outputLanguage: "Spanish" },
  { code: "fr", label: "French", outputLanguage: "French" },
  { code: "de", label: "German", outputLanguage: "German" },
  {
    code: "pt-BR",
    label: "Portuguese (Brazil)",
    outputLanguage: "Portuguese (Brazil)",
  },
];

export function getVideoSummaryTemplate(
  templateId: VideoSummaryTemplateId = "youtube-blog",
) {
  return (
    videoSummaryTemplates.find((template) => template.id === templateId) ??
    videoSummaryTemplates[0]
  );
}

export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  maxCharacters = 2400,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = segments[0]?.startSeconds ?? 0;
  let currentEnd = segments[0]?.endSeconds;

  segments.forEach((segment) => {
    const line = formatTranscriptSegment(segment);
    const nextText = [...currentLines, line].join("\n");

    if (currentLines.length > 0 && nextText.length > maxCharacters) {
      chunks.push({
        index: chunks.length,
        text: currentLines.join("\n"),
        startSeconds: currentStart,
        endSeconds: currentEnd,
      });
      currentLines = [line];
      currentStart = segment.startSeconds;
    } else {
      currentLines.push(line);
    }

    currentEnd = segment.endSeconds;
  });

  if (currentLines.length > 0) {
    chunks.push({
      index: chunks.length,
      text: currentLines.join("\n"),
      startSeconds: currentStart,
      endSeconds: currentEnd,
    });
  }

  return chunks;
}

export function createSummaryPrompt({
  video,
  segments,
  options = {},
}: {
  video: VideoAsset;
  segments: TranscriptSegment[];
  options?: SummaryPromptOptions;
}): SummaryPrompt {
  const chunks = chunkTranscriptSegments(segments);
  const template = getVideoSummaryTemplate(options.templateId);
  const lengthMode = options.lengthMode ?? "default";
  const systemPrompt = options.systemPromptOverride?.trim() || template.systemPrompt;
  const videoUrl = video.originalUri?.trim() ?? "";
  const thumbnailUrl = video.thumbnailPath?.startsWith("http")
    ? video.thumbnailPath
    : "";
  const lastAvailableSeconds = getLastAvailableSeconds(segments);

  return {
    systemPrompt: [
      systemPrompt,
      "",
      ...(options.outputLanguage
        ? [
            [
              "Target language:",
              `- Rewrite the source language transcript into a Markdown summary in ${options.outputLanguage}.`,
              "- Preserve proper nouns, product names, cited titles, and timestamps from the source.",
            ].join("\n"),
            "",
          ]
        : []),
      createLengthModeInstruction(lengthMode),
      "",
      createSummaryTimestampLinkInstruction(),
    ].join("\n"),
    userPrompt: [
      `VIDEO_TITLE: ${video.title}`,
      `VIDEO_URL: ${videoUrl || "not provided"}`,
      `VIDEO_ID: ${video.id}`,
      `SOURCE_KIND: ${video.sourceKind}`,
      `SUMMARY_TEMPLATE: ${template.label}`,
      `LENGTH_MODE: ${summaryLengthModeLabels[lengthMode]}`,
      ...(options.outputLanguage ? [`TARGET_LANGUAGE: ${options.outputLanguage}`] : []),
      `LAST_AVAILABLE_TIMESTAMP: ${formatTimestamp(lastAvailableSeconds)} (${Math.floor(
        lastAvailableSeconds,
      )} seconds)`,
      ...(thumbnailUrl ? [`THUMBNAIL_IMAGE_URL: ${thumbnailUrl}`] : []),
      "",
      "TIMESTAMPED_TRANSCRIPT:",
      ...chunks.map((chunk) =>
        [
          `Chunk ${chunk.index + 1} (starts ${formatTimestamp(
            chunk.startSeconds,
          )} / ${Math.floor(chunk.startSeconds)} seconds)`,
          chunk.text,
        ].join("\n"),
      ),
    ].join("\n"),
    chunks,
  };
}

export function createSummaryTimestampHref(totalSeconds: number) {
  return `${summaryTimestampHrefPrefix}${Math.max(0, Math.floor(totalSeconds))}`;
}

export function createClickableSummaryTimestampMarkdown(markdown: string) {
  let insideCodeFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("```")) {
        insideCodeFence = !insideCodeFence;
        return line;
      }

      if (insideCodeFence) return line;

      return linkBareSummaryTimestamps(line);
    })
    .join("\n");
}

export function parseSummaryTimestampHref(href: unknown): number | undefined {
  if (typeof href !== "string") return undefined;

  const rawValue = href.startsWith(summaryTimestampHrefPrefix)
    ? href.slice(summaryTimestampHrefPrefix.length)
    : href.startsWith(legacySummaryTimestampHrefPrefix)
      ? href.slice(legacySummaryTimestampHrefPrefix.length)
      : undefined;
  if (rawValue === undefined) return undefined;

  const seconds = Number(rawValue);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export function parseSummaryTimestampLabel(label: unknown): number | undefined {
  if (typeof label !== "string") return undefined;
  return parseSummaryTimestampText(label.trim());
}

function linkBareSummaryTimestamps(line: string) {
  return line.replace(
    /(^|[\s|({])(\d{1,3}:\d{2}(?::\d{2})?)(?=\s*(?:$|[|)\]},.;!?]))/g,
    (match, prefix: string, timestamp: string) => {
      const seconds = parseSummaryTimestampText(timestamp);
      return seconds === undefined
        ? match
        : `${prefix}[${timestamp}](${createSummaryTimestampHref(seconds)})`;
    },
  );
}

function parseSummaryTimestampText(timestamp: string) {
  const parts = timestamp.split(":").map((part) => Number(part));
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    return undefined;
  }

  const seconds = parts.at(-1);
  const minutes = parts.at(-2);
  const hours = parts.length === 3 ? parts[0] : 0;
  if (seconds === undefined || minutes === undefined) return undefined;
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) return undefined;

  return hours * 3600 + minutes * 60 + seconds;
}

export function createSummaryDocument({
  videoId,
  provider,
  markdown,
  templateId,
  lengthMode,
  outputLanguage,
  sourceSegmentCount,
  sourceFileName,
  nowIso = new Date().toISOString(),
  idSuffix = createSummaryIdSuffix(),
}: {
  videoId: string;
  provider: ProviderKind;
  markdown: string;
  templateId?: VideoSummaryTemplateId;
  lengthMode?: SummaryLengthMode;
  outputLanguage?: string;
  sourceSegmentCount: number;
  sourceFileName?: string;
  nowIso?: string;
  idSuffix?: string;
}): SummaryDocument {
  const id = `summary-${videoId}-${sanitizeSummaryTimestamp(nowIso)}-${sanitizeSummaryTimestamp(idSuffix)}`;

  return {
    id,
    videoId,
    markdown,
    provider,
    templateId,
    lengthMode,
    outputLanguage,
    sourceSegmentCount,
    artifactPath: createSummaryArtifactPath(videoId, id, sourceFileName),
    createdAtIso: nowIso,
  };
}

function sanitizeSummaryTimestamp(nowIso: string) {
  return nowIso
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "now";
}

function createSummaryIdSuffix() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function formatTranscriptSegment(segment: TranscriptSegment) {
  return `[${formatTimestamp(segment.startSeconds)} | ${Math.floor(
    segment.startSeconds,
  )}s] ${segment.text}`;
}

export function formatTimestamp(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getLastAvailableSeconds(segments: TranscriptSegment[]) {
  return segments.reduce(
    (latest, segment) =>
      Math.max(latest, segment.endSeconds ?? segment.startSeconds),
    0,
  );
}

function createLengthModeInstruction(lengthMode: SummaryLengthMode) {
  switch (lengthMode) {
    case "short":
      return [
        "Length mode: short.",
        "Keep the article concise while preserving the required structure. Use the minimum useful number of table rows, sections, and bullets.",
      ].join("\n");
    case "long":
      return [
        "Length mode: long.",
        "Cover the full video arc in detail. Preserve more examples, nuance, evidence, and timestamped sections when the transcript supports them.",
      ].join("\n");
    case "explain-simply":
      return [
        "Length mode: explain simply.",
        "Use plain language and define specialized terms from context. Keep the output grounded and do not oversimplify claims beyond the transcript.",
      ].join("\n");
    case "default":
      return [
        "Length mode: default.",
        "Use balanced depth: enough detail to replace watching the video for most readers without becoming a transcript rewrite.",
      ].join("\n");
  }
}

function createSummaryTimestampLinkInstruction() {
  return [
    "OpenBrief timestamp link contract:",
    `- Use the custom markdown timestamp node as a normal Markdown link whose linked text is the timestamp label: [MM:SS](${summaryTimestampHrefPrefix}SECONDS) or [HH:MM:SS](${summaryTimestampHrefPrefix}SECONDS).`,
    "- SECONDS must be an integer from the transcript timestamp, not a formatted time string.",
    "- Use it for section timestamp labels, paragraph leads, and high-signal moments that users may want to replay.",
    "- Do not wrap prose in timestamp links; keep prose editable and keep only the timestamp label as the timestamp node.",
    "- Do not use VIDEO_URL&t=SECONDS for in-app timestamp links.",
  ].join("\n");
}
