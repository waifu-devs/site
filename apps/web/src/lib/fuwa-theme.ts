import type { Theme } from "@waifu-devs/domain/api";

/**
 * A theme as a fuwa theme file (fuwa's docs/themes.md): fuwa's Settings,
 * Themes, Import reads it. No backdrop, so it uses the app's own.
 */
export function fuwaThemeFile(theme: Theme) {
  return {
    format: "fuwa-theme",
    version: 1,
    name: theme.name,
    description: theme.description ?? "",
    colors: { ...theme.variant.tokens },
    radius: theme.variant.radius,
    backdrop: null,
  };
}

export const fuwaFileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "theme"
  }.fuwa-theme.json`;

/** Saves the theme file, made right here in the browser. */
export function downloadForFuwa(theme: Theme) {
  const blob = new Blob([JSON.stringify(fuwaThemeFile(theme), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fuwaFileName(theme.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
