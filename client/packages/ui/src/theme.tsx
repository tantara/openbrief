"use client";

import * as React from "react";
import {
  CheckIcon,
  DesktopIcon,
  MoonIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import * as z from "zod/v4";

import { Button } from "./button";
import {
  applyColorSeedVariables,
  colorSeedOptions,
  colorSeedStorageKey,
  colorSeedTokens,
  defaultColorSeed,
  defaultColorSeedOption,
  isColorSeed,
  type ColorSeed,
} from "./color-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const ThemeModeSchema = z.enum(["light", "dark", "auto"]);

const themeKey = "theme-mode";

export type ThemeMode = z.output<typeof ThemeModeSchema>;
export type ResolvedTheme = Exclude<ThemeMode, "auto">;

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "auto";
  try {
    const storedTheme = localStorage.getItem(themeKey);
    return ThemeModeSchema.parse(storedTheme);
  } catch {
    return "auto";
  }
};

const setStoredThemeMode = (theme: ThemeMode) => {
  try {
    const parsedTheme = ThemeModeSchema.parse(theme);
    localStorage.setItem(themeKey, parsedTheme);
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const getStoredColorSeed = (): ColorSeed => {
  if (typeof window === "undefined") return defaultColorSeed;
  try {
    const storedColorSeed = localStorage.getItem(colorSeedStorageKey);
    return isColorSeed(storedColorSeed) ? storedColorSeed : defaultColorSeed;
  } catch {
    return defaultColorSeed;
  }
};

const setStoredColorSeed = (colorSeed: ColorSeed) => {
  try {
    localStorage.setItem(colorSeedStorageKey, colorSeed);
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const getSystemTheme = () => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const updateThemeClass = (
  themeMode: ThemeMode,
  colorSeed: ColorSeed = getStoredColorSeed(),
) => {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "auto");
  const resolvedTheme = themeMode === "auto" ? getSystemTheme() : themeMode;
  root.classList.add(resolvedTheme);

  if (themeMode === "auto") {
    root.classList.add("auto");
  }

  root.dataset.theme = resolvedTheme;
  root.dataset.colorSeed = colorSeed;
  root.style.colorScheme = resolvedTheme;
  applyColorSeedVariables(root, resolvedTheme, colorSeed);
};

const setupPreferredListener = (colorSeed: ColorSeed) => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => updateThemeClass("auto", colorSeed);
  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
};

const getNextTheme = (current: ThemeMode): ThemeMode => {
  const themes: ThemeMode[] =
    getSystemTheme() === "dark"
      ? ["auto", "light", "dark"]
      : ["auto", "dark", "light"];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return themes[(themes.indexOf(current) + 1) % themes.length]!;
};

export const themeDetectorScript = (function () {
  function themeFn(
    colorTokens: typeof colorSeedTokens,
    fallbackColorSeed: ColorSeed,
    colorStorageKey: string,
  ) {
    const isValidTheme = (theme: string): theme is ThemeMode => {
      const validThemes = ["light", "dark", "auto"] as const;
      return validThemes.includes(theme as ThemeMode);
    };

    const getStored = (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const toHsl = (channel: string) => `hsl(${channel})`;
    const applyColor = (resolvedTheme: ResolvedTheme, colorSeed: ColorSeed) => {
      const tokens = colorTokens[colorSeed];
      const accent =
        resolvedTheme === "dark" ? tokens.darkAccent : tokens.accent;
      const accentForeground =
        resolvedTheme === "dark"
          ? tokens.darkAccentForeground
          : tokens.accentForeground;
      const root = document.documentElement;

      root.dataset.theme = resolvedTheme;
      root.dataset.colorSeed = colorSeed;
      root.style.colorScheme = resolvedTheme;
      root.style.setProperty("--primary", toHsl(tokens.primary));
      root.style.setProperty("--primary-foreground", toHsl("0 0% 0%"));
      root.style.setProperty("--ring", toHsl(tokens.primary));
      root.style.setProperty("--chart-1", toHsl(tokens.primary));
      root.style.setProperty("--chart-3", toHsl(tokens.chart3));
      root.style.setProperty("--accent", toHsl(accent));
      root.style.setProperty("--accent-foreground", toHsl(accentForeground));
      root.style.setProperty("--sidebar-primary", toHsl(tokens.primary));
      root.style.setProperty(
        "--sidebar-primary-foreground",
        toHsl("0 0% 0%"),
      );
      root.style.setProperty("--sidebar-ring", toHsl(tokens.primary));
    };

    const storedTheme = getStored("theme-mode") ?? "auto";
    const validTheme = isValidTheme(storedTheme) ? storedTheme : "auto";
    const storedColorSeed = getStored(colorStorageKey);
    const validColorSeed =
      storedColorSeed && storedColorSeed in colorTokens
        ? (storedColorSeed as ColorSeed)
        : fallbackColorSeed;

    if (validTheme === "auto") {
      const autoTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      document.documentElement.classList.add(autoTheme, "auto");
      applyColor(autoTheme, validColorSeed);
    } else {
      document.documentElement.classList.add(validTheme);
      applyColor(validTheme, validColorSeed);
    }
  }
  const colorSeedScriptArgs = [
    JSON.stringify(colorSeedTokens),
    JSON.stringify(defaultColorSeed),
    JSON.stringify(colorSeedStorageKey),
  ].join(", ");

  return `(${themeFn.toString()})(${colorSeedScriptArgs});`;
})();

interface ThemeContextProps {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colorSeed: ColorSeed;
  setTheme: (theme: ThemeMode) => void;
  setColorSeed: (colorSeed: ColorSeed) => void;
  toggleMode: () => void;
}
const ThemeContext = React.createContext<ThemeContextProps | undefined>(
  undefined,
);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [themeMode, setThemeMode] = React.useState(getStoredThemeMode);
  const [colorSeed, setColorSeedState] = React.useState(getStoredColorSeed);

  React.useEffect(() => {
    if (themeMode !== "auto") return;
    return setupPreferredListener(colorSeed);
  }, [colorSeed, themeMode]);

  const resolvedTheme = themeMode === "auto" ? getSystemTheme() : themeMode;

  const setTheme = (newTheme: ThemeMode) => {
    setThemeMode(newTheme);
    setStoredThemeMode(newTheme);
    updateThemeClass(newTheme, colorSeed);
  };

  const setColorSeed = (newColorSeed: ColorSeed) => {
    setColorSeedState(newColorSeed);
    setStoredColorSeed(newColorSeed);
    updateThemeClass(themeMode, newColorSeed);
  };

  const toggleMode = () => {
    setTheme(getNextTheme(themeMode));
  };

  return (
    <ThemeContext
      value={{
        themeMode,
        resolvedTheme,
        colorSeed,
        setTheme,
        setColorSeed,
        toggleMode,
      }}
    >
      <script
        dangerouslySetInnerHTML={{ __html: themeDetectorScript }}
        suppressHydrationWarning
      />
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const context = React.use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ColorThemeToggle() {
  const { colorSeed, setColorSeed } = useTheme();
  const activeColorSeed =
    colorSeedOptions.find((option) => option.id === colorSeed) ??
    defaultColorSeedOption;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Change color theme"
          variant="outline"
          size="icon"
          title="Color theme"
        >
          <span
            aria-hidden="true"
            className="border-border size-4 rounded-full border shadow-sm"
            style={{ background: activeColorSeed.swatch }}
          />
          <span className="sr-only">Change color theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Color</DropdownMenuLabel>
        {colorSeedOptions.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => setColorSeed(option.id)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="border-border size-3 rounded-full border"
                style={{ background: option.swatch }}
              />
              {option.label}
            </span>
            {colorSeed === option.id ? (
              <CheckIcon className="size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="[&>svg]:absolute [&>svg]:size-5 [&>svg]:scale-0"
        >
          <SunIcon className="light:scale-100! auto:scale-0!" />
          <MoonIcon className="auto:scale-0! dark:scale-100!" />
          <DesktopIcon className="auto:scale-100!" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("auto")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
