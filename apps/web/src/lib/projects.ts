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
  roadmap?: { label: string; done: boolean }[];
};

export const PROJECTS: Project[] = [
  {
    slug: "fuwa",
    name: "fuwa",
    glyph: "ふわ",
    tagline: "Chat servers you can own. Hosted by us, or by you.",
    description: `**fuwa** (ふわ, as in *fuwafuwa*: fluffy) is a chat app in the spirit of Discord that you can run yourself.

Every server keeps its channels, messages and history in **its own SQLite database**, so a whole community is one file you can back up, move or hand to a friend. The desktop client keeps as many servers in its sidebar as you like, side by side: ones Waifu Devs hosts (soon), your friend's, and the one humming in your closet.`,
    status: "building",
    repo: "waifu-devs/fuwa",
    stack: ["Go", "gRPC", "SQLite", "Raylib"],
    highlights: [
      { icon: Database, title: "One file per server", body: "Channels, messages and events live in that server's own SQLite database." },
      { icon: House, title: "Self-host it", body: "Run one small Go binary on your own box and keep every message at home." },
      { icon: Cloud, title: "Or let us host it", body: "Hosted fuwa servers on waifu.dev are on the way, for when you just want to chat." },
      { icon: Layers, title: "One client, many servers", body: "Hosted and self-hosted servers sit together in the same sidebar." },
    ],
    roadmap: [
      { label: "Event-driven gRPC server", done: true },
      { label: "A SQLite database per server", done: true },
      { label: "Desktop client that joins many servers", done: true },
      { label: "One-command self-hosting", done: false },
      { label: "Hosted servers on waifu.dev", done: false },
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
