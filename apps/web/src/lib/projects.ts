import { Cloud, Database, House, KeyRound, Layers, Palette, UserRound, type LucideIcon } from "lucide-react";

/*
 * The projects shown on /projects. They're defined here in code for now; add
 * one by appending to PROJECTS (and, for a custom visual, a case in
 * components/projects/Project.tsx).
 */

export type ProjectStatus = "live" | "building" | "planned";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  live: "Live",
  building: "In development",
  planned: "Planned",
};

export type Project = {
  slug: string;
  name: string;
  /** A word or two in Japanese, drawn huge and outlined behind the name. */
  glyph: string;
  tagline: string;
  /** Markdown, rendered with the shared Markdown component. */
  description: string;
  status: ProjectStatus;
  /** `owner/name` on GitHub. */
  repo: string;
  /** Where it runs, if it runs somewhere. */
  url?: string;
  stack: string[];
  highlights: { icon: LucideIcon; title: string; body: string }[];
  roadmap?: { label: string; state: RoadmapState }[];
};

/** Done has landed, now is being built (or is in review), next hasn't started. */
export type RoadmapState = "done" | "now" | "next";

export const PROJECTS: Project[] = [
  {
    slug: "fuwa",
    name: "fuwa",
    glyph: "ふわ",
    tagline: "Chat servers you can own. Hosted by us, or by you.",
    description: `**fuwa** (ふわ, as in *fuwafuwa*: fluffy) is a chat app in the spirit of Discord that you can run yourself.

Every community server keeps its members, channels and messages in **its own database file** (Turso, so it still opens as plain SQLite): a whole community is one file you can back up, move or hand to a friend. The server and the desktop app are written in Rust, and one client holds as many servers as you like: ones Waifu Devs hosts (soon), your friend's, and the one humming in your closet.`,
    status: "building",
    repo: "waifu-devs/fuwa",
    stack: ["Rust", "Turso", "gRPC", "React"],
    highlights: [
      { icon: Database, title: "One file per server", body: "Members, channels, messages and events live in that server's own Turso database file." },
      { icon: House, title: "Self-host it", body: "Run one small Rust binary on your own box, with accounts of its own and every message kept at home." },
      { icon: Cloud, title: "Or let us host it", body: "Hosted fuwa servers on waifu.dev are on the way, for when you just want to chat." },
      { icon: Layers, title: "One client, many servers", body: "Hosted and self-hosted servers sit together in one sidebar, in your browser or the desktop app." },
    ],
    roadmap: [
      { label: "Rust server with a Turso file per community server", state: "now" },
      { label: "Standalone accounts, no waifu.dev needed", state: "now" },
      { label: "Web client, served by every fuwa server", state: "now" },
      { label: "Desktop app in Rust", state: "next" },
      { label: "Sign in with waifu.dev, invites and roles", state: "next" },
      { label: "Hosted servers on waifu.dev", state: "next" },
    ],
  },
  {
    slug: "site",
    name: "waifu.dev",
    glyph: "家",
    tagline: "The community's home on the web. You're standing in it.",
    description: `The site you're on right now. Sign in with GitHub, make a profile at \`/u/you\`, and design a theme that repaints every page, for you and for anyone who visits your profile.

It's written end to end with [Effect](https://effect.website): an API server and a [TanStack Start](https://tanstack.com/start) web app on Postgres, hosted on Railway.`,
    status: "live",
    repo: "waifu-devs/site",
    url: "https://www.waifu.dev",
    stack: ["TypeScript", "Effect", "TanStack Start", "Postgres"],
    highlights: [
      { icon: KeyRound, title: "GitHub sign-in", body: "One click, and your login and avatar follow you in." },
      { icon: UserRound, title: "Profiles", body: "Bio, status, skills, links and a banner at /u/you." },
      { icon: Palette, title: "Themes", body: "Paint a theme in the live editor and the whole site wears it." },
    ],
  },
];
