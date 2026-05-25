import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildVideoComponentPromptContext,
  getVideoComponentCatalogItem,
  listVideoComponentCatalog,
  searchVideoComponentCatalog,
  validateVideoComponentSelection,
} from "@/domain/video-component-catalog";

describe("video component catalog", () => {
  it("pins HyperFrames caption-clip-wipe metadata for native selection", () => {
    const item = getVideoComponentCatalogItem("caption-clip-wipe");

    expect(item).toMatchObject({
      name: "caption-clip-wipe",
      type: "hyperframes:component",
      title: "Clip Wipe",
      install: {
        targetPath: "compositions/components/caption-clip-wipe.html",
      },
      wiring: {
        mode: "inline-snippet",
      },
    });
    expect(item?.source.catalogUrl).toBe(
      "https://hyperframes.mintlify.app/catalog/components/caption-clip-wipe",
    );
  });

  it("searches by caption-oriented user language", () => {
    expect(searchVideoComponentCatalog({ query: "TikTok word reveal captions" })).toEqual([
      expect.objectContaining({ name: "caption-clip-wipe" }),
    ]);
  });

  it("builds compact AI prompt context without arbitrary component names", () => {
    const context = buildVideoComponentPromptContext({
      query: "wipe captions",
    });

    expect(context).toContain("Use only these component names");
    expect(context).toContain("caption-clip-wipe");
    expect(context).toContain("Return selected names in componentNames[]");
    expect(context).toContain("Never add network scripts");
  });

  it("validates model-selected component names against the pinned catalog", () => {
    expect(validateVideoComponentSelection(["caption-clip-wipe"])).toEqual({
      ok: true,
      selected: [expect.objectContaining({ name: "caption-clip-wipe" })],
      unknownNames: [],
    });

    expect(validateVideoComponentSelection(["made-up-component"])).toEqual({
      ok: false,
      selected: [],
      unknownNames: ["made-up-component"],
    });
  });

  it("exposes a stable list for UI pickers and future agent tools", () => {
    expect(listVideoComponentCatalog()).toHaveLength(1);
    expect(listVideoComponentCatalog()[0].capabilities).toContain("word-timing");
  });

  it("keeps skill manifests in sync with the pinned TypeScript catalog", () => {
    const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

    for (const item of listVideoComponentCatalog()) {
      const manifestPath = resolve(
        srcRoot,
        "..",
        "video-skills",
        item.name,
        "manifest.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(manifest).toMatchObject({
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        source: item.source,
        install: item.install,
        wiring: {
          mode: item.wiring.mode,
          requiredInputs: item.wiring.requiredInputs,
        },
      });
    }
  });
});
