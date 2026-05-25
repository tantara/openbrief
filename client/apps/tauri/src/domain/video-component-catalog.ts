export type VideoComponentCatalogType = "hyperframes:component" | "hyperframes:block";
export type VideoComponentWiringMode = "inline-snippet" | "sub-composition";
export type VideoComponentCapability =
  | "captions"
  | "caption-style"
  | "word-timing"
  | "text-reveal"
  | "visual-effect"
  | "data-visualization"
  | "social-overlay";

export type VideoComponentCatalogItem = {
  name: string;
  type: VideoComponentCatalogType;
  title: string;
  description: string;
  tags: string[];
  capabilities: VideoComponentCapability[];
  source: {
    registry: "hyperframes";
    registryItemUrl: string;
    catalogUrl: string;
    packageVersion: string;
  };
  install: {
    command: string;
    targetPath: string;
  };
  preview: {
    video: string;
    poster: string;
  };
  wiring: {
    mode: VideoComponentWiringMode;
    requiredInputs: string[];
    outputContract: string;
    validationRules: string[];
  };
  ai: {
    triggerPhrases: string[];
    promptSummary: string;
    selectionGuidance: string;
  };
};

export type VideoComponentPromptContextOptions = {
  query?: string;
  componentNames?: string[];
  limit?: number;
};

export type VideoComponentSelectionValidation = {
  ok: boolean;
  selected: VideoComponentCatalogItem[];
  unknownNames: string[];
};

export const videoComponentCatalogVersion = "2026-05-25";

export type VideoComponentName = "caption-clip-wipe";

export const hyperframesVideoComponentCatalog = [
  {
    name: "caption-clip-wipe",
    type: "hyperframes:component",
    title: "Clip Wipe",
    description: "Left-to-right clip-path wipe reveal per word",
    tags: ["captions", "caption-style", "wipe", "clip-path", "reveal"],
    capabilities: ["captions", "caption-style", "word-timing", "text-reveal"],
    source: {
      registry: "hyperframes",
      registryItemUrl:
        "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/components/caption-clip-wipe/registry-item.json",
      catalogUrl:
        "https://hyperframes.mintlify.app/catalog/components/caption-clip-wipe",
      packageVersion: "hyperframes@0.6.42",
    },
    install: {
      command: "npx hyperframes add caption-clip-wipe --no-clipboard",
      targetPath: "compositions/components/caption-clip-wipe.html",
    },
    preview: {
      video:
        "https://static.heygen.ai/hyperframes-oss/registry/components/caption-clip-wipe/preview-v2.mp4",
      poster:
        "https://static.heygen.ai/hyperframes-oss/docs/images/catalog/components/caption-clip-wipe.png",
    },
    wiring: {
      mode: "inline-snippet",
      requiredInputs: [
        "caption phrases or words with start/end seconds",
        "composition duration",
        "caption container position",
      ],
      outputContract:
        "Host composition owns the root data-composition-id. The component contributes caption markup, CSS, and synchronous GSAP timeline calls only.",
      validationRules: [
        "Only use library-relative media paths.",
        "Never add network scripts, remote fonts, Math.random, Date.now, async timeline construction, or repeat:-1.",
        "Every generated word or phrase must have numeric start/end seconds inside the composition duration.",
        "Do not animate media element dimensions; animate wrappers or caption spans.",
      ],
    },
    ai: {
      triggerPhrases: [
        "wipe captions",
        "word reveal captions",
        "tiktok captions",
        "clip-path caption reveal",
        "kinetic subtitles",
      ],
      promptSummary:
        "Use caption-clip-wipe for high-energy captions where each word reveals left-to-right with a clip-path wipe and optional emphasis coloring.",
      selectionGuidance:
        "Pick this when captions are a central visual element and transcript word/phrase timings are available. Avoid it for quiet long-form lower thirds.",
    },
  },
] satisfies VideoComponentCatalogItem[];

export function listVideoComponentCatalog() {
  return [...hyperframesVideoComponentCatalog];
}

export function getVideoComponentCatalogItem(name: string) {
  return hyperframesVideoComponentCatalog.find((item) => item.name === name);
}

export function searchVideoComponentCatalog({
  query,
  componentNames = [],
  limit = 5,
}: VideoComponentPromptContextOptions = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const requestedNames = new Set(componentNames);
  const scored = hyperframesVideoComponentCatalog
    .map((item) => ({
      item,
      score: scoreCatalogItem(item, normalizedQuery, requestedNames),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name));

  return scored.slice(0, limit).map(({ item }) => item);
}

export function validateVideoComponentSelection(
  names: string[],
): VideoComponentSelectionValidation {
  const selected: VideoComponentCatalogItem[] = [];
  const unknownNames: string[] = [];

  for (const name of uniqueTrimmed(names)) {
    const item = getVideoComponentCatalogItem(name);

    if (item) {
      selected.push(item);
    } else {
      unknownNames.push(name);
    }
  }

  return {
    ok: unknownNames.length === 0,
    selected,
    unknownNames,
  };
}

export function buildVideoComponentPromptContext(
  options: VideoComponentPromptContextOptions = {},
) {
  const items = searchVideoComponentCatalog(options);

  if (items.length === 0) {
    return [
      "No matching video components are available in the pinned OpenBrief catalog.",
      "Return componentNames: [] and describe the missing capability instead of inventing component names.",
    ].join("\n");
  }

  return [
    `Pinned OpenBrief video component catalog (${videoComponentCatalogVersion}).`,
    "Use only these component names. Return selected names in componentNames[].",
    ...items.map(formatCatalogItemForPrompt),
  ].join("\n\n");
}

function formatCatalogItemForPrompt(item: VideoComponentCatalogItem) {
  return [
    `- ${item.name} (${item.type}, ${item.wiring.mode})`,
    `  title: ${item.title}`,
    `  use: ${item.ai.promptSummary}`,
    `  select when: ${item.ai.selectionGuidance}`,
    `  requires: ${item.wiring.requiredInputs.join("; ")}`,
    `  rules: ${item.wiring.validationRules.join(" ")}`,
  ].join("\n");
}

function scoreCatalogItem(
  item: VideoComponentCatalogItem,
  normalizedQuery: string,
  requestedNames: Set<string>,
) {
  if (requestedNames.has(item.name)) return 100;
  if (!normalizedQuery) return 1;

  let score = 0;
  const searchable = [
    item.name,
    item.title,
    item.description,
    ...item.tags,
    ...item.capabilities,
    ...item.ai.triggerPhrases,
  ].map(normalizeSearchText);

  for (const value of searchable) {
    if (value === normalizedQuery) score += 20;
    if (value.includes(normalizedQuery) || normalizedQuery.includes(value)) score += 5;
  }

  for (const token of normalizedQuery.split(/\s+/).filter(Boolean)) {
    if (searchable.some((value) => value.includes(token))) score += 1;
  }

  return score;
}

function uniqueTrimmed(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeSearchText(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}
