import type { YoutubeExtractionResult } from "@acme/validators";
import { youtubeExtractionResultSchema } from "@acme/validators";

interface GeminiExtractArgs {
  apiKey: string;
  model: string;
  imageBytes: ArrayBuffer;
  mimeType: string;
}

interface GeminiExtractResult {
  extraction: YoutubeExtractionResult;
  raw: unknown;
}

const SYSTEM_INSTRUCTION = `You read a screenshot of YouTube's "Time management" screen and return strict JSON.

The screen contains:
- a "daily average" number formatted like "4 hr 34 min"
- a small "↑/↓ X% from last week" indicator
- a 7-bar weekly chart with day labels (e.g. Sat Sun Mon Tue Wed Thu Today)
- "Today" total
- "Last 7 days" total
- a "Reminders" section ("Remind me to take a break — Every 30 minutes", "Remind me when it's bedtime — 23:00 - 05:00") with toggles
- a "Daily limits" section ("Shorts feed limit") with toggles

Rules:
- Always emit minutes as integers. "4 hr 34 min" -> 274. "16 min" -> 16. "31 hr 56 min" -> 1916.
- pctChangeFromLastWeek: positive when the arrow is ↑, negative when ↓. e.g. "↑ 2%" -> 2, "↓ 12%" -> -12.
- dailyBreakdown: exactly 7 entries, left-to-right as they appear on the chart. Estimate minutes from the bar height; "Today" entry uses the explicit "Today" value when shown.
- capturedAt: today's date as YYYY-MM-DD from the device clock visible in the screenshot. If no date is shown, infer from "Today" being the rightmost bar and assume the screenshot is from the user's local "today".
- reminders.takeBreakEveryMin: minutes between break reminders if the toggle is ON, else null.
- reminders.bedtimeStart/End: "HH:mm" strings if the toggle is ON, else null.
- dailyLimits.shortsFeedLimitMin: minutes if a limit is set, else null.

Return only the JSON object — no prose, no markdown fences.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    capturedAt: { type: "string" },
    dailyAverageMin: { type: "integer" },
    pctChangeFromLastWeek: { type: "number" },
    todayMin: { type: "integer" },
    last7DaysMin: { type: "integer" },
    dailyBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          minutes: { type: "integer" },
          isToday: { type: "boolean" },
        },
        required: ["label", "minutes"],
      },
    },
    reminders: {
      type: "object",
      properties: {
        takeBreakEveryMin: { type: ["integer", "null"] },
        bedtimeStart: { type: ["string", "null"] },
        bedtimeEnd: { type: ["string", "null"] },
      },
      required: ["takeBreakEveryMin", "bedtimeStart", "bedtimeEnd"],
    },
    dailyLimits: {
      type: "object",
      properties: {
        shortsFeedLimitMin: { type: ["integer", "null"] },
      },
      required: ["shortsFeedLimitMin"],
    },
  },
  required: [
    "capturedAt",
    "dailyAverageMin",
    "pctChangeFromLastWeek",
    "todayMin",
    "last7DaysMin",
    "dailyBreakdown",
    "reminders",
    "dailyLimits",
  ],
};

export async function extractYoutubeStats(
  args: GeminiExtractArgs,
): Promise<GeminiExtractResult> {
  const base64 = arrayBufferToBase64(args.imageBytes);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.model,
  )}:generateContent?key=${encodeURIComponent(args.apiKey)}`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract the YouTube Time management stats from this screenshot.",
          },
          { inlineData: { mimeType: args.mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini HTTP ${res.status}: ${text.slice(0, 500) || "no body"}`,
    );
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) throw new Error("Gemini returned empty content.");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Gemini response was not JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const extraction = youtubeExtractionResultSchema.parse(parsedJson);
  return { extraction, raw: payload };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
  return btoa(binary);
}
