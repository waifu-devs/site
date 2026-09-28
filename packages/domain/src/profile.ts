/**
 * What a member can put on their profile page beyond the basics: an animated
 * banner, a status line, skills and links. The banner is drawn from the
 * profile's theme tokens, so every banner suits every theme.
 */

export const BANNERS = ["blobs", "petals", "stars", "waves", "grid", "plain"] as const;
export type Banner = (typeof BANNERS)[number];
export const DEFAULT_BANNER: Banner = "blobs";

export const BANNER_LABELS: Record<Banner, string> = {
  blobs: "Blobs",
  petals: "Petals",
  stars: "Starry",
  waves: "Waves",
  grid: "Grid",
  plain: "Plain",
};

export const MAX_SKILLS = 12;
export const MAX_SKILL_LENGTH = 24;
export const MAX_LINKS = 5;
export const MAX_LINK_LENGTH = 200;

/** A link as it reads on a profile: host and path, without the scheme or trailing slash. */
export function linkLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
