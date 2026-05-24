import {
  applyAppTheme,
  loadAppColorSeed,
  loadAppTheme,
  saveAppColorSeed,
  saveAppTheme,
} from "@/services/themeSettingsService";
import { beforeEach, describe, expect, it } from "vitest";

describe("theme settings service", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.colorSeed;
    document.documentElement.removeAttribute("style");
  });

  it("defaults to light theme", () => {
    expect(loadAppTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists and applies dark theme", () => {
    saveAppTheme("dark");

    expect(loadAppTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes dark class when light theme is applied", () => {
    applyAppTheme("dark");
    applyAppTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("persists and applies the selected color seed", () => {
    saveAppColorSeed("blue");

    expect(loadAppColorSeed()).toBe("blue");
    expect(document.documentElement.dataset.colorSeed).toBe("blue");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "hsl(199 89% 60%)",
    );
    expect(document.documentElement.style.getPropertyValue("--ring")).toBe(
      "hsl(199 89% 60%)",
    );
  });

  it("persists and applies newly added color seeds", () => {
    saveAppColorSeed("teal");

    expect(loadAppColorSeed()).toBe("teal");
    expect(document.documentElement.dataset.colorSeed).toBe("teal");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "hsl(174 72% 46%)",
    );
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "hsl(173 80% 96%)",
    );
  });

  it("defaults invalid color seeds to green", () => {
    localStorage.setItem("openbrief.color-seed", "neon");

    expect(loadAppColorSeed()).toBe("green");
  });
});
