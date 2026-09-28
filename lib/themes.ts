export const THEME_KEYS = ["bg", "surface", "text", "muted", "accent", "accentText", "border"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeColors = Record<ThemeKey, string>;

export type Theme = {
  id: string;
  name: string;
  description: string | null;
  colors: ThemeColors;
  builtin: boolean;
  isPublic?: boolean;
  ownerUsername?: string;
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  bg: "Background",
  surface: "Cards",
  text: "Text",
  muted: "Muted text",
  accent: "Accent",
  accentText: "Text on accent",
  border: "Borders",
};

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "sakura",
    name: "Sakura",
    description: "Soft cherry blossom pink. The default.",
    builtin: true,
    colors: {
      bg: "#fff5f8",
      surface: "#ffffff",
      text: "#3b2330",
      muted: "#8a6577",
      accent: "#f06292",
      accentText: "#ffffff",
      border: "#f8d3e0",
    },
  },
  {
    id: "yoru",
    name: "Yoru",
    description: "Late night coding under neon signs.",
    builtin: true,
    colors: {
      bg: "#14111f",
      surface: "#1f1a2e",
      text: "#ece6ff",
      muted: "#9a90b8",
      accent: "#b388ff",
      accentText: "#14111f",
      border: "#342b4d",
    },
  },
  {
    id: "matcha",
    name: "Matcha",
    description: "Calm green tea and warm paper.",
    builtin: true,
    colors: {
      bg: "#f4f6ec",
      surface: "#fffef7",
      text: "#243021",
      muted: "#66735f",
      accent: "#5a8a3c",
      accentText: "#ffffff",
      border: "#d9e2c8",
    },
  },
  {
    id: "sora",
    name: "Sora",
    description: "Clear skies and summer clouds.",
    builtin: true,
    colors: {
      bg: "#f0f7ff",
      surface: "#ffffff",
      text: "#1a2b44",
      muted: "#5f7391",
      accent: "#3b8beb",
      accentText: "#ffffff",
      border: "#cfe2f7",
    },
  },
  {
    id: "tsundere",
    name: "Tsundere",
    description: "It's not like I made this theme for you or anything.",
    builtin: true,
    colors: {
      bg: "#1a0f12",
      surface: "#2a171c",
      text: "#ffe9ec",
      muted: "#c28c96",
      accent: "#ff4d6d",
      accentText: "#1a0f12",
      border: "#4a2630",
    },
  },
];

export const DEFAULT_THEME = BUILTIN_THEMES[0];

const HEX = /^#[0-9a-f]{6}$/i;

/** Returns a validated palette, or null if any color is missing or not a #rrggbb hex. */
export function parseColors(input: unknown): ThemeColors | null {
  if (!input || typeof input !== "object") return null;
  const out = {} as ThemeColors;
  for (const key of THEME_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "string" || !HEX.test(value)) return null;
    out[key] = value.toLowerCase();
  }
  return out;
}

export function themeStyle(colors: ThemeColors): Record<string, string> {
  return {
    "--theme-bg": colors.bg,
    "--theme-surface": colors.surface,
    "--theme-text": colors.text,
    "--theme-muted": colors.muted,
    "--theme-accent": colors.accent,
    "--theme-accent-text": colors.accentText,
    "--theme-border": colors.border,
  };
}
