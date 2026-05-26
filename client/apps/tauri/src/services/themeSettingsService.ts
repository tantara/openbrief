import {
  getWorkspaceStorageItem,
  setWorkspaceStorageItem,
} from "@/services/workspaceStorage";

import type { ColorSeed, ColorSeedOption } from "@acme/ui/color-theme";
import {
  applyColorSeedVariables,
  colorSeedOptions,
  isColorSeed,
  defaultColorSeed as sharedDefaultColorSeed,
} from "@acme/ui/color-theme";

export type AppTheme = "light" | "dark" | "auto";
export type ResolvedAppTheme = "light" | "dark";
export type AppColorSeed = ColorSeed;
export type AppColorSeedOption = ColorSeedOption;

const themeStorageKey = "openbrief.theme";
const colorSeedStorageKey = "openbrief.color-seed";
const defaultTheme: AppTheme = "auto";
const defaultColorSeed: AppColorSeed = sharedDefaultColorSeed;

export const appColorSeedOptions: AppColorSeedOption[] = colorSeedOptions;

export function loadAppTheme(): AppTheme {
  const storedTheme = getWorkspaceStorageItem(themeStorageKey, readStorage());
  return isAppTheme(storedTheme) ? storedTheme : defaultTheme;
}

export function saveAppTheme(theme: AppTheme): AppTheme {
  setWorkspaceStorageItem(themeStorageKey, theme, readStorage());
  applyAppTheme(theme, loadAppColorSeed());
  return theme;
}

export function loadAppColorSeed(): AppColorSeed {
  const storedColorSeed = getWorkspaceStorageItem(
    colorSeedStorageKey,
    readStorage(),
  );
  return isAppColorSeed(storedColorSeed) ? storedColorSeed : defaultColorSeed;
}

export function saveAppColorSeed(colorSeed: AppColorSeed): AppColorSeed {
  setWorkspaceStorageItem(colorSeedStorageKey, colorSeed, readStorage());
  applyAppTheme(loadAppTheme(), colorSeed);
  return colorSeed;
}

export function getSystemTheme(): ResolvedAppTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveAppTheme(theme: AppTheme): ResolvedAppTheme {
  return theme === "auto" ? getSystemTheme() : theme;
}

export function applyAppTheme(
  theme: AppTheme,
  colorSeed: AppColorSeed = loadAppColorSeed(),
) {
  if (typeof document === "undefined") return;

  const resolved = resolveAppTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.colorSeed = colorSeed;
  document.documentElement.style.colorScheme = resolved;
  applyColorSeedVariables(document.documentElement, resolved, colorSeed);
}

export function listenSystemThemeChange(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "dark" || value === "auto";
}

function isAppColorSeed(
  value: string | null | undefined,
): value is AppColorSeed {
  return isColorSeed(value);
}

function readStorage() {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
