import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type {
  VideoComponentCatalogItem,
  VideoComponentName,
} from "@/domain/video-component-catalog";
import {
  assetDirectoryForMediaAsset,
  mediaSourceTypeForAsset,
  sanitizePathSegment,
} from "@/domain/media-library";
import {
  searchVideoComponentCatalog,
  validateVideoComponentSelection,
} from "@/domain/video-component-catalog";

export const videoGenerationAdapter = "deno-hyperframes" as const;
export const hyperframesNpmPackage = "hyperframes@0.6.42" as const;
export const hyperframesPlayerPackage = "@hyperframes/player@0.6.42" as const;

export type VideoGenerationAdapter = typeof videoGenerationAdapter;
export type VideoGenerationScenario =
  | "summary-to-video"
  | "pdf-to-video"
  | "csv-to-video";
export type VideoGenerationAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoGenerationDimensions = {
  width: number;
  height: number;
};
export type VideoGenerationComponentReference = {
  name: VideoComponentName;
  type: "hyperframes:component" | "hyperframes:block";
  wiringMode: "inline-snippet" | "sub-composition";
  targetPath: string;
  catalogUrl: string;
};
export type VideoGenerationStoryboardScene = {
  title: string;
  narration: string;
  startSeconds: number;
  durationSeconds: number;
};

export type VideoGenerationComposition = {
  id: string;
  sourceId: string;
  sourceType: "video" | "audio" | "pdf";
  scenario: VideoGenerationScenario;
  adapter: VideoGenerationAdapter;
  title: string;
  prompt: string;
  html: string;
  entryPath: string;
  manifestPath: string;
  renderPath: string;
  durationSeconds: number;
  aspectRatio: VideoGenerationAspectRatio;
  components?: VideoGenerationComponentReference[];
  storyboard?: VideoGenerationStoryboardScene[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type VideoGenerationRender = {
  id: string;
  compositionId: string;
  sourceId: string;
  adapter: VideoGenerationAdapter;
  outputPath: string;
  createdAtIso: string;
};

export type VideoGenerationArtifactPaths = {
  rootDirectory: string;
  entryPath: string;
  manifestPath: string;
  renderPath: string;
  tempDirectory: string;
};

export type VideoGenerationSourceInput = {
  asset: VideoAsset;
  summary?: SummaryDocument;
  transcript?: TranscriptSegment[];
  prompt?: string;
  aspectRatio?: VideoGenerationAspectRatio;
  nowIso?: string;
  compositionId?: string;
  componentNames?: string[];
  storyboard?: VideoGenerationStoryboardScene[];
};

const compositionCsp =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: blob: asset:; media-src 'self' data: blob: asset:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'none'";

export function scenarioForVideoGenerationAsset(
  asset: VideoAsset,
): VideoGenerationScenario {
  if (mediaSourceTypeForAsset(asset) === "pdf") return "pdf-to-video";

  return "summary-to-video";
}

export function createVideoGenerationArtifactPaths(
  asset: VideoAsset,
  compositionId: string,
): VideoGenerationArtifactPaths {
  const rootDirectory = `${assetDirectoryForMediaAsset(asset)}/generated-video/${sanitizePathSegment(compositionId)}`;

  return {
    rootDirectory,
    entryPath: `${rootDirectory}/index.html`,
    manifestPath: `${rootDirectory}/composition.json`,
    renderPath: `${rootDirectory}/render.mp4`,
    tempDirectory: `${rootDirectory}/tmp`,
  };
}

export function createSummaryVideoGenerationComposition({
  asset,
  summary,
  transcript = [],
  prompt,
  aspectRatio = "16:9",
  nowIso = new Date().toISOString(),
  compositionId = createCompositionId(asset.id, nowIso),
  componentNames,
  storyboard,
}: VideoGenerationSourceInput): VideoGenerationComposition {
  const sourceType = mediaSourceTypeForAsset(asset);
  const scenario = scenarioForVideoGenerationAsset(asset);
  const paths = createVideoGenerationArtifactPaths(asset, compositionId);
  const title = asset.title.trim() || asset.originalFileName || "Untitled source";
  const content = summarizeForScript(summary?.markdown, transcript);
  const resolvedPrompt =
    prompt?.trim() ||
    (scenario === "pdf-to-video"
      ? "Create a concise pitch video from this PDF summary."
      : "Create a concise briefing video from this summary.");
  const components = resolveVideoGenerationComponents({
    prompt: resolvedPrompt,
    componentNames,
  });
  const resolvedStoryboard =
    normalizeVideoGenerationStoryboard(storyboard) ??
    createDefaultVideoGenerationStoryboard(content);
  const durationSeconds = storyboardDurationSeconds(resolvedStoryboard);
  const html = createHyperframesCompositionHtml({
    compositionId,
    title,
    prompt: resolvedPrompt,
    durationSeconds,
    aspectRatio,
    components,
    storyboard: resolvedStoryboard,
  });

  return {
    id: compositionId,
    sourceId: asset.id,
    sourceType,
    scenario,
    adapter: videoGenerationAdapter,
    title,
    prompt: resolvedPrompt,
    html,
    entryPath: paths.entryPath,
    manifestPath: paths.manifestPath,
    renderPath: paths.renderPath,
    durationSeconds,
    aspectRatio,
    components,
    storyboard: resolvedStoryboard,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function createVideoGenerationManifest(
  composition: VideoGenerationComposition,
) {
  const { html: _html, ...manifest } = composition;

  return {
    schemaVersion: 1,
    ...manifest,
  };
}

function createCompositionId(sourceId: string, nowIso: string) {
  const timestamp = nowIso.replace(/[^0-9]/g, "").slice(0, 14);

  return `${sanitizePathSegment(sourceId)}-${timestamp || "composition"}`;
}

function summarizeForScript(
  markdown: string | undefined,
  transcript: TranscriptSegment[],
) {
  const fromSummary = markdown
    ?.replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (fromSummary) return fromSummary.slice(0, 900);

  const fromTranscript = transcript
    .slice(0, 8)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return fromTranscript || "No summary is available yet. Generate a summary first.";
}

function createHyperframesCompositionHtml({
  compositionId,
  title,
  prompt,
  durationSeconds,
  aspectRatio,
  components,
  storyboard,
}: {
  compositionId: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: VideoGenerationAspectRatio;
  components: VideoGenerationComponentReference[];
  storyboard: VideoGenerationStoryboardScene[];
}) {
  const aspectClass =
    aspectRatio === "9:16" ? "portrait" : aspectRatio === "1:1" ? "square" : "landscape";
  const dimensions = dimensionsForVideoGenerationAspectRatio(aspectRatio);
  const words = storyboard
    .map((scene) => scene.narration)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 34);
  const hasCaptionClipWipe = components.some(
    (component) => component.name === "caption-clip-wipe",
  );
  const caption = createCaptionHtml(words, hasCaptionClipWipe);
  const sceneCards = createStoryboardSceneHtml(storyboard);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(compositionCsp)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #0c0f14; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .scene { position: relative; width: 100vw; height: 100vh; overflow: hidden; display: grid; place-items: center; background:
        radial-gradient(circle at 18% 22%, rgba(20, 184, 166, 0.24), transparent 28%),
        radial-gradient(circle at 82% 78%, rgba(245, 158, 11, 0.18), transparent 30%),
        linear-gradient(135deg, #111827 0%, #121212 48%, #172033 100%); }
      .frame { width: min(86vw, 1180px); aspect-ratio: ${aspectRatio.replace(":", " / ")}; display: grid; grid-template-rows: 1fr auto; gap: 28px; padding: clamp(34px, 5vw, 72px); box-sizing: border-box; }
      .kicker { color: #5eead4; font-size: 22px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
      h1 { margin: 14px 0 0; max-width: 980px; font-size: clamp(48px, 7vw, 96px); line-height: 0.96; letter-spacing: 0; }
      .caption { max-width: 900px; font-size: clamp(22px, 3vw, 36px); line-height: 1.22; color: #e2e8f0; }
      .caption-word { display: inline-block; }
      .caption-clip-wipe .caption-word { clip-path: inset(0 100% 0 0); color: #ffffff; animation: clipWipe 420ms ease forwards, captionSettle 240ms ease forwards; animation-delay: calc(var(--word-index) * 70ms), calc((var(--word-index) * 70ms) + 720ms); will-change: clip-path, color; }
      .storyboard { display: grid; grid-template-columns: repeat(${Math.min(storyboard.length, 3)}, minmax(0, 1fr)); gap: 14px; margin-top: 28px; }
      .scene-card { min-width: 0; border: 1px solid rgba(148, 163, 184, 0.28); background: rgba(15, 23, 42, 0.62); border-radius: 8px; padding: 16px; animation: reveal 720ms ease both; animation-delay: calc(var(--scene-index) * 180ms + 360ms); }
      .scene-card h2 { margin: 0 0 8px; color: #f8fafc; font-size: clamp(18px, 2vw, 28px); line-height: 1.05; letter-spacing: 0; }
      .scene-card p { margin: 0; color: #cbd5e1; font-size: clamp(14px, 1.45vw, 18px); line-height: 1.3; }
      .scene-time { display: block; margin-top: 12px; color: #5eead4; font-size: 13px; font-weight: 700; }
      .meta { display: flex; justify-content: space-between; gap: 24px; color: #cbd5e1; font-size: 18px; }
      .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: #14b8a6; animation: progress ${durationSeconds}s linear forwards; transform-origin: left center; }
      .frame.landscape { max-height: 86vh; }
      .frame.portrait { max-width: 56vh; }
      .frame.square { max-width: 82vh; }
      @keyframes progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes reveal { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes clipWipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
      @keyframes captionSettle { to { color: #cbd5e1; } }
      .kicker, h1, .caption, .meta { animation: reveal 720ms ease both; }
      h1 { animation-delay: 120ms; }
      .caption { animation-delay: 260ms; }
      .meta { animation-delay: 420ms; }
    </style>
  </head>
  <body>
    <main
      id="stage"
      class="scene"
      data-composition-id="${escapeHtml(compositionId)}"
      data-start="0"
      data-duration="${durationSeconds}"
      data-track-index="0"
      data-width="${dimensions.width}"
      data-height="${dimensions.height}"
    >
      <section class="frame ${aspectClass}">
        <div>
          <div class="kicker">OpenBrief</div>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div>
          ${caption}
          <div class="storyboard" aria-label="Storyboard scenes">
            ${sceneCards}
          </div>
          <div class="meta">
            <span>${escapeHtml(prompt)}</span>
            <span>${durationSeconds}s</span>
          </div>
        </div>
      </section>
      <div class="bar" aria-hidden="true"></div>
    </main>
  </body>
</html>
`;
}

function normalizeVideoGenerationStoryboard(
  storyboard: VideoGenerationStoryboardScene[] | undefined,
) {
  if (!storyboard?.length) return undefined;

  const scenes = storyboard
    .flatMap((scene): VideoGenerationStoryboardScene[] => {
      const title = scene.title.trim();
      const narration = scene.narration.trim();

      if (!title || !narration) return [];
      if (scene.startSeconds < 0 || scene.durationSeconds <= 0) return [];

      return [
        {
          title,
          narration,
          startSeconds: scene.startSeconds,
          durationSeconds: scene.durationSeconds,
        },
      ];
    })
    .sort((left, right) => left.startSeconds - right.startSeconds);

  return scenes.length > 0 ? scenes : undefined;
}

function createDefaultVideoGenerationStoryboard(
  content: string,
): VideoGenerationStoryboardScene[] {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return [
    {
      title: "Hook",
      narration: sentences[0] || "Open with the strongest source point.",
      startSeconds: 0,
      durationSeconds: 8,
    },
    {
      title: "Context",
      narration:
        sentences.slice(1, 3).join(" ") ||
        "Show the supporting context with concise captions.",
      startSeconds: 8,
      durationSeconds: 24,
    },
    {
      title: "Takeaway",
      narration:
        sentences[3] || "Close with a clear takeaway grounded in the source.",
      startSeconds: 32,
      durationSeconds: 13,
    },
  ];
}

function storyboardDurationSeconds(storyboard: VideoGenerationStoryboardScene[]) {
  return Math.max(
    1,
    ...storyboard.map((scene) => scene.startSeconds + scene.durationSeconds),
  );
}

function createStoryboardSceneHtml(storyboard: VideoGenerationStoryboardScene[]) {
  return storyboard
    .slice(0, 3)
    .map(
      (scene, index) => `<article class="scene-card" style="--scene-index: ${index}">
              <h2>${escapeHtml(scene.title)}</h2>
              <p>${escapeHtml(scene.narration)}</p>
              <span class="scene-time">${formatSeconds(scene.startSeconds)}-${formatSeconds(scene.startSeconds + scene.durationSeconds)}s</span>
            </article>`,
    )
    .join("\n");
}

function resolveVideoGenerationComponents({
  prompt,
  componentNames,
}: {
  prompt: string;
  componentNames?: string[];
}): VideoGenerationComponentReference[] {
  if (componentNames && componentNames.length > 0) {
    const validation = validateVideoComponentSelection(componentNames);

    if (!validation.ok) {
      throw new Error(
        `video_generation_unknown_components:${validation.unknownNames.join(",")}`,
      );
    }

    return validation.selected.map(toVideoGenerationComponentReference);
  }

  return searchVideoComponentCatalog({ query: prompt }).map(
    toVideoGenerationComponentReference,
  );
}

function toVideoGenerationComponentReference(
  item: VideoComponentCatalogItem,
): VideoGenerationComponentReference {
  return {
    name: item.name as VideoComponentName,
    type: item.type,
    wiringMode: item.wiring.mode,
    targetPath: item.install.targetPath,
    catalogUrl: item.source.catalogUrl,
  };
}

function createCaptionHtml(words: string[], hasCaptionClipWipe: boolean) {
  if (!hasCaptionClipWipe) {
    return `<p class="caption">${escapeHtml(words.join(" "))}</p>`;
  }

  const spans = words
    .map(
      (word, index) =>
        `<span class="caption-word" style="--word-index: ${index}">${escapeHtml(word)}</span>`,
    )
    .join(" ");

  return `<p class="caption caption-clip-wipe" data-openbrief-component="caption-clip-wipe">${spans}</p>`;
}

export function dimensionsForVideoGenerationAspectRatio(
  aspectRatio: VideoGenerationAspectRatio,
): VideoGenerationDimensions {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };

  return { width: 1920, height: 1080 };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSeconds(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
