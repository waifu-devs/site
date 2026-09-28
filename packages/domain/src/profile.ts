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

/** Pictures members upload to replace their GitHub avatar or the animated banner. */
export const IMAGE_KINDS = ["avatar", "banner"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/** Largest upload accepted, before resizing. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** What uploads are resized (and cropped) to. */
export const IMAGE_SIZES: Record<ImageKind, { width: number; height: number }> = {
  avatar: { width: 512, height: 512 },
  banner: { width: 1500, height: 500 },
};
