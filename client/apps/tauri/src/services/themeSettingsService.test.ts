import {
  applyAppTheme,
  getSystemTheme,
  listenSystemThemeChange,
  loadAppColorSeed,
  loadAppTheme,
  resolveAppTheme,
  saveAppColorSeed,
  saveAppTheme,
} from "@/services/themeSettingsService";
import { writeActiveWorkspaceId } from "@/services/workspaceStorage";
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

  it("defaults to auto theme", () => {
    expect(loadAppTheme()).toBe("auto");
  });

  it("persists and applies dark theme", () => {
    saveAppTheme("dark");

    expect(loadAppTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists and applies auto theme", () => {
    saveAppTheme("auto");

    expect(loadAppTheme()).toBe("auto");
    const expectedResolved = getSystemTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(
      expectedResolved === "dark",
    );
    expect(document.documentElement.dataset.theme).toBe(expectedResolved);
    expect(document.documentElement.style.colorScheme).toBe(expectedResolved);
  });

  it("removes dark class when light theme is applied", () => {
    applyAppTheme("dark");
    applyAppTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("resolveAppTheme returns same value for light and dark", () => {
    expect(resolveAppTheme("light")).toBe("light");
    expect(resolveAppTheme("dark")).toBe("dark");
  });

  it("resolveAppTheme returns system preference for auto", () => {
    const system = getSystemTheme();
    expect(resolveAppTheme("auto")).toBe(system);
  });

  it("getSystemTheme returns light or dark", () => {
    const system = getSystemTheme();
    expect(["light", "dark"]).toContain(system);
  });

  it("listenSystemThemeChange registers and returns cleanup", () => {
    const cleanup = listenSystemThemeChange(() => {});
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });

  it("applies auto theme matching system preference", () => {
    applyAppTheme("auto");

    const isDark = getSystemTheme() === "dark";
    expect(document.documentElement.classList.contains("dark")).toBe(isDark);
    expect(document.documentElement.style.colorScheme).toBe(getSystemTheme());
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

  it("isolates saved appearance settings by workspace", () => {
    saveAppTheme("dark");
    saveAppColorSeed("blue");

    writeActiveWorkspaceId("research");

    expect(loadAppTheme()).toBe("auto");
    expect(loadAppColorSeed()).toBe("green");

    saveAppTheme("dark");
    saveAppColorSeed("teal");

    writeActiveWorkspaceId("default");
    expect(loadAppTheme()).toBe("dark");
    expect(loadAppColorSeed()).toBe("blue");

    writeActiveWorkspaceId("research");
    expect(loadAppTheme()).toBe("dark");
    expect(loadAppColorSeed()).toBe("teal");
  });
});
