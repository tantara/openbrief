import type { LibraryView } from "@/hooks/useMediaLibrary";
import type { TranslationKey } from "@/i18n";

export type ShortcutDefinition = {
  id: string;
  labelKey: TranslationKey;
  faqLabelKey?: TranslationKey;
  keys: string[];
  view?: LibraryView;
};

export const pageShortcutDefinitions = [
  {
    id: "library",
    view: "finder",
    labelKey: "nav.finder",
    faqLabelKey: "faq.shortcuts.library",
    keys: ["modifier", "1"],
  },
  {
    id: "note",
    view: "workbench",
    labelKey: "nav.workbench",
    faqLabelKey: "faq.shortcuts.note",
    keys: ["modifier", "2"],
  },
  {
    id: "playlists",
    view: "playlists",
    labelKey: "nav.playlists",
    faqLabelKey: "faq.shortcuts.playlists",
    keys: ["modifier", "3"],
  },
  {
    id: "voices",
    view: "voices",
    labelKey: "nav.voices",
    faqLabelKey: "faq.shortcuts.voices",
    keys: ["modifier", "4"],
  },
  {
    id: "settings",
    view: "settings",
    labelKey: "nav.settings",
    faqLabelKey: "faq.shortcuts.settings",
    keys: ["modifier", "0"],
  },
] satisfies ShortcutDefinition[];

export const faqShortcutDefinitions = [
  ...pageShortcutDefinitions,
  {
    id: "search",
    labelKey: "faq.shortcuts.search",
    keys: ["modifier", "L"],
  },
  {
    id: "add-video",
    labelKey: "faq.shortcuts.addVideo",
    keys: ["modifier", "K"],
  },
  {
    id: "previous-tab",
    labelKey: "faq.shortcuts.previousTab",
    keys: ["modifier", "Shift", "["],
  },
  {
    id: "next-tab",
    labelKey: "faq.shortcuts.nextTab",
    keys: ["modifier", "Shift", "]"],
  },
] satisfies ShortcutDefinition[];

export function resolveShortcutKeys(keys: string[]) {
  const modifier = shortcutModifierKey();
  return keys.map((key) => (key === "modifier" ? modifier : key));
}

export function isSearchShortcutKey(key: string) {
  return key.toLowerCase() === "l";
}

export function isAddVideoShortcutKey(key: string) {
  return key.toLowerCase() === "k";
}

export function viewForShortcutKey(key: string): LibraryView | undefined {
  switch (key) {
    case "1":
      return "finder";
    case "2":
      return "workbench";
    case "3":
      return "playlists";
    case "4":
      return "voices";
    case "0":
      return "settings";
    default:
      return undefined;
  }
}

function shortcutModifierKey() {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

function isApplePlatform() {
  if (typeof navigator === "undefined") return false;

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  return platform.includes("mac") || userAgent.includes("mac os");
}
