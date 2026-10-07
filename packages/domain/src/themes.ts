/**
 * Themes are shadcn/ui theme variants: every theme, built-in or made by a
 * member, is a full set of values for the same shadcn CSS variables
 * (--background, --primary, --radius, ...). Components only ever reference
 * those variables, so any theme restyles every component.
 */

export const TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
] as const;
export type Token = (typeof TOKENS)[number];
export type ThemeTokens = Record<Token, string>;

export type ThemeVariant = { tokens: ThemeTokens; radius: number };

export type Theme = {
  id: string;
  name: string;
  description: string | null;
  variant: ThemeVariant;
  builtin: boolean;
  isPublic?: boolean;
  ownerUsername?: string;
};

/** The handful of colors the quick editor exposes; everything else is derived from them. */
export const SEEDS = ["background", "foreground", "card", "primary", "primary-foreground", "muted-foreground", "border"] as const;
export type Seed = (typeof SEEDS)[number];
export type ThemeSeeds = Record<Seed, string>;

export const TOKEN_LABELS: Record<Token, string> = {
  background: "Background",
  foreground: "Text",
  card: "Cards",
  "card-foreground": "Card text",
  popover: "Menus",
  "popover-foreground": "Menu text",
  primary: "Primary",
  "primary-foreground": "Text on primary",
  secondary: "Secondary",
  "secondary-foreground": "Text on secondary",
  muted: "Muted",
  "muted-foreground": "Muted text",
  accent: "Hover",
  "accent-foreground": "Hover text",
  destructive: "Danger",
  border: "Borders",
  input: "Inputs",
  ring: "Focus ring",
};

/** A #rrggbb color. */
export const HEX = /^#[0-9a-f]{6}$/i;

/** Mixes `a` into `b` by `amount` (0..1) in sRGB. */
export function mix(a: string, b: string, amount: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v * amount + pb[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** Expands the quick-editor seeds into a full shadcn token set. */
export function deriveTokens(s: ThemeSeeds): ThemeTokens {
  return {
    background: s.background,
    foreground: s.foreground,
    card: s.card,
    "card-foreground": s.foreground,
    popover: s.card,
    "popover-foreground": s.foreground,
    primary: s.primary,
    "primary-foreground": s["primary-foreground"],
    secondary: mix(s.primary, s.card, 0.12),
    "secondary-foreground": s.foreground,
    muted: mix(s.border, s.background, 0.45),
    "muted-foreground": s["muted-foreground"],
    accent: mix(s.primary, s.background, 0.14),
    "accent-foreground": s.foreground,
    destructive: "#e5484d",
    border: s.border,
    input: s.border,
    ring: s.primary,
  };
}

export function seedsOf(tokens: ThemeTokens): ThemeSeeds {
  return Object.fromEntries(SEEDS.map((k) => [k, tokens[k]])) as ThemeSeeds;
}

function builtin(id: string, name: string, description: string, radius: number, seeds: ThemeSeeds): Theme {
  return { id, name, description, builtin: true, variant: { tokens: deriveTokens(seeds), radius } };
}

export const BUILTIN_THEMES: Theme[] = [
  builtin("sakura", "Sakura", "Soft cherry blossom pink. The default.", 1, {
    background: "#fff5f8",
    foreground: "#3b2330",
    card: "#ffffff",
    primary: "#f06292",
    "primary-foreground": "#ffffff",
    "muted-foreground": "#8a6577",
    border: "#f8d3e0",
  }),
  builtin("yoru", "Yoru", "Late night coding under neon signs.", 0.75, {
    background: "#14111f",
    foreground: "#ece6ff",
    card: "#1f1a2e",
    primary: "#b388ff",
    "primary-foreground": "#14111f",
    "muted-foreground": "#9a90b8",
    border: "#342b4d",
  }),
  builtin("matcha", "Matcha", "Calm green tea and warm paper.", 0.5, {
    background: "#f4f6ec",
    foreground: "#243021",
    card: "#fffef7",
    primary: "#5a8a3c",
    "primary-foreground": "#ffffff",
    "muted-foreground": "#66735f",
    border: "#d9e2c8",
  }),
  builtin("sora", "Sora", "Clear skies and summer clouds.", 1.25, {
    background: "#f0f7ff",
    foreground: "#1a2b44",
    card: "#ffffff",
    primary: "#3b8beb",
    "primary-foreground": "#ffffff",
    "muted-foreground": "#5f7391",
    border: "#cfe2f7",
  }),
  builtin("tsundere", "Tsundere", "It's not like I made this theme for you or anything.", 0.25, {
    background: "#1a0f12",
    foreground: "#ffe9ec",
    card: "#2a171c",
    primary: "#ff4d6d",
    "primary-foreground": "#1a0f12",
    "muted-foreground": "#c28c96",
    border: "#4a2630",
  }),
];

export const DEFAULT_THEME = BUILTIN_THEMES[0];

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 1.5;

/** The inline style that applies a theme variant to an element and everything inside it. */
export function themeStyle(variant: ThemeVariant): Record<string, string> {
  const style: Record<string, string> = { "--radius": `${variant.radius}rem` };
  for (const key of TOKENS) style[`--${key}`] = variant.tokens[key];
  return style;
}

// ---------------------------------------------------------------------------
// Marketplace filters

/** Whether a theme is light or dark, by its background. */
export const THEME_MODES = ["light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Color families, by a theme's primary color; "neutral" is for grays and near-grays. */
export const THEME_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "neutral"] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

/** A color to show for each family in the filter. */
export const COLOR_SWATCHES: Record<ThemeColor, string> = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#ffc53d",
  green: "#46a758",
  teal: "#12a594",
  blue: "#0090ff",
  purple: "#8e4ec6",
  pink: "#e93d82",
  neutral: "#8b8d98",
};

/** Corner styles, by radius (rem): under 0.375 is sharp, under 1 soft, the rest round. */
export const THEME_CORNERS = ["sharp", "soft", "round"] as const;
export type ThemeCorners = (typeof THEME_CORNERS)[number];
export const CORNER_BOUNDS = { soft: 0.375, round: 1 } as const;

/** How recently a theme was made. */
export const THEME_PERIODS = ["week", "month", "year"] as const;
export type ThemePeriod = (typeof THEME_PERIODS)[number];
export const PERIOD_DAYS: Record<ThemePeriod, number> = { week: 7, month: 30, year: 365 };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Relative luminance (WCAG), 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function modeOf(tokens: ThemeTokens): ThemeMode {
  return luminance(tokens.background) < 0.2 ? "dark" : "light";
}

export function colorOf(tokens: ThemeTokens): ThemeColor {
  const [r, g, b] = rgb(tokens.primary);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.18 || l < 0.1 || l > 0.94) return "neutral";
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const hue = (h + 360) % 360;
  if (hue < 10 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 195) return "teal";
  if (hue < 255) return "blue";
  if (hue < 290) return "purple";
  return "pink";
}

export function cornersOf(radius: number): ThemeCorners {
  return radius < CORNER_BOUNDS.soft ? "sharp" : radius < CORNER_BOUNDS.round ? "soft" : "round";
}
