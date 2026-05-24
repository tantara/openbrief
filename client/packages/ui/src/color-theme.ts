export const colorSeedStorageKey = "openbrief.color-seed";

export const colorSeedIds = [
  "green",
  "blue",
  "red",
  "purple",
  "amber",
  "teal",
  "pink",
  "slate",
] as const;

export type ColorSeed = (typeof colorSeedIds)[number];
export type ColorTheme = "light" | "dark";

export type ColorSeedOption = {
  id: ColorSeed;
  label: string;
  swatch: string;
};

export type ColorSeedTokens = {
  primary: string;
  accent: string;
  accentForeground: string;
  darkAccent: string;
  darkAccentForeground: string;
  chart3: string;
};

export const defaultColorSeed: ColorSeed = "green";

export const defaultColorSeedOption: ColorSeedOption = {
  id: "green",
  label: "Green",
  swatch: "hsl(82.5414 88.2927% 59.8039%)",
};

export const colorSeedOptions: ColorSeedOption[] = [
  defaultColorSeedOption,
  { id: "blue", label: "Blue", swatch: "hsl(199 89% 60%)" },
  { id: "red", label: "Red", swatch: "hsl(0 84% 70%)" },
  { id: "purple", label: "Purple", swatch: "hsl(262 83% 72%)" },
  { id: "amber", label: "Amber", swatch: "hsl(43 96% 62%)" },
  { id: "teal", label: "Teal", swatch: "hsl(174 72% 46%)" },
  { id: "pink", label: "Pink", swatch: "hsl(330 81% 67%)" },
  { id: "slate", label: "Slate", swatch: "hsl(215 20% 65%)" },
];

export const colorSeedTokens: Record<ColorSeed, ColorSeedTokens> = {
  green: {
    primary: "82.5414 88.2927% 59.8039%",
    accent: "138.4615 76.4706% 96.6667%",
    accentForeground: "142.7848 64.2276% 24.1176%",
    darkAccent: "143.8095 61.1650% 20.1961%",
    darkAccentForeground: "82.5414 88.2927% 59.8039%",
    chart3: "142.0859 70.5628% 45.2941%",
  },
  blue: {
    primary: "199 89% 60%",
    accent: "204 100% 97%",
    accentForeground: "201 90% 27%",
    darkAccent: "201 90% 20%",
    darkAccentForeground: "199 89% 70%",
    chart3: "199 89% 48%",
  },
  red: {
    primary: "0 84% 70%",
    accent: "0 100% 97%",
    accentForeground: "0 72% 35%",
    darkAccent: "0 70% 23%",
    darkAccentForeground: "0 84% 78%",
    chart3: "0 72% 51%",
  },
  purple: {
    primary: "262 83% 72%",
    accent: "267 100% 98%",
    accentForeground: "263 70% 42%",
    darkAccent: "263 62% 28%",
    darkAccentForeground: "262 83% 78%",
    chart3: "263 70% 58%",
  },
  amber: {
    primary: "43 96% 62%",
    accent: "48 100% 96%",
    accentForeground: "35 91% 30%",
    darkAccent: "35 80% 24%",
    darkAccentForeground: "43 96% 70%",
    chart3: "35 91% 45%",
  },
  teal: {
    primary: "174 72% 46%",
    accent: "173 80% 96%",
    accentForeground: "176 76% 24%",
    darkAccent: "176 58% 20%",
    darkAccentForeground: "174 78% 62%",
    chart3: "174 72% 38%",
  },
  pink: {
    primary: "330 81% 67%",
    accent: "327 100% 97%",
    accentForeground: "335 78% 34%",
    darkAccent: "335 68% 24%",
    darkAccentForeground: "330 90% 78%",
    chart3: "335 78% 50%",
  },
  slate: {
    primary: "215 20% 65%",
    accent: "210 25% 96%",
    accentForeground: "215 27% 30%",
    darkAccent: "215 24% 25%",
    darkAccentForeground: "215 20% 75%",
    chart3: "215 24% 50%",
  },
};

export function isColorSeed(
  value: string | null | undefined,
): value is ColorSeed {
  return colorSeedOptions.some((option) => option.id === value);
}

export function getColorSeedCssVariables(
  theme: ColorTheme,
  colorSeed: ColorSeed,
) {
  const tokens = colorSeedTokens[colorSeed];
  const accent = theme === "dark" ? tokens.darkAccent : tokens.accent;
  const accentForeground =
    theme === "dark" ? tokens.darkAccentForeground : tokens.accentForeground;

  return {
    "--primary": toHsl(tokens.primary),
    "--primary-foreground": toHsl("0 0% 0%"),
    "--ring": toHsl(tokens.primary),
    "--chart-1": toHsl(tokens.primary),
    "--chart-3": toHsl(tokens.chart3),
    "--accent": toHsl(accent),
    "--accent-foreground": toHsl(accentForeground),
    "--sidebar-primary": toHsl(tokens.primary),
    "--sidebar-primary-foreground": toHsl("0 0% 0%"),
    "--sidebar-ring": toHsl(tokens.primary),
  };
}

export function applyColorSeedVariables(
  root: HTMLElement,
  theme: ColorTheme,
  colorSeed: ColorSeed,
) {
  const variables = getColorSeedCssVariables(theme, colorSeed);

  Object.entries(variables).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

function toHsl(channel: string) {
  return `hsl(${channel})`;
}
