import {
  applyColorSeedVariables,
  colorSeedOptions,
  defaultColorSeed as sharedDefaultColorSeed,
  isColorSeed,
  type ColorSeed,
  type ColorSeedOption,
} from "@acme/ui/color-theme";

export type AppTheme = "light" | "dark";
export type AppColorSeed = ColorSeed;
export type AppColorSeedOption = ColorSeedOption;

const themeStorageKey = "openbrief.theme";
const colorSeedStorageKey = "openbrief.color-seed";
const defaultTheme: AppTheme = "light";
const defaultColorSeed: AppColorSeed = sharedDefaultColorSeed;

export const appColorSeedOptions: AppColorSeedOption[] = colorSeedOptions;

export function loadAppTheme(): AppTheme {
  const storedTheme = readStorage()?.getItem(themeStorageKey);
  return isAppTheme(storedTheme) ? storedTheme : defaultTheme;
}

export function saveAppTheme(theme: AppTheme): AppTheme {
  readStorage()?.setItem(themeStorageKey, theme);
  applyAppTheme(theme, loadAppColorSeed());
  return theme;
}

export function loadAppColorSeed(): AppColorSeed {
  const storedColorSeed = readStorage()?.getItem(colorSeedStorageKey);
  return isAppColorSeed(storedColorSeed) ? storedColorSeed : defaultColorSeed;
}

export function saveAppColorSeed(colorSeed: AppColorSeed): AppColorSeed {
  readStorage()?.setItem(colorSeedStorageKey, colorSeed);
  applyAppTheme(loadAppTheme(), colorSeed);
  return colorSeed;
}

export function applyAppTheme(
  theme: AppTheme,
  colorSeed: AppColorSeed = loadAppColorSeed(),
) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.colorSeed = colorSeed;
  document.documentElement.style.colorScheme = theme;
  applyColorSeedVariables(document.documentElement, theme, colorSeed);
}

function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "dark";
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
