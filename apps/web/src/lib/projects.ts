import { Cloud, Database, House, KeyRound, Layers, Newspaper, Palette, UserRound, type LucideIcon } from "lucide-react";
import type { Key } from "@/i18n/i18n";

/*
 * The projects shown on /projects. They're defined here in code for now; add
 * one by appending to PROJECTS (and, for a custom visual, a case in
 * components/projects/Project.tsx).
 */

export type ProjectStatus = "live" | "building" | "planned";

export const STATUS_LABELS: Record<ProjectStatus, Key> = {
  live: "projects.status.live",
  building: "projects.status.building",
  planned: "projects.status.planned",
};

/**
 * A styled piece of a description paragraph, filling one of its {placeholders}:
 * a catalog key (`k`) or a name that isn't translated (`text`), shown bold,
 * italic or as code, and maybe a link.
 */
export type Run = ({ k: Key } | { text: string }) & { style?: "strong" | "em" | "code"; href?: string };

/** One paragraph of a description: a catalog key and the runs for its placeholders. */
export type Paragraph = { k: Key; values?: Record<string, Run> };

export type Project = {
  slug: string;
  name: string;
  /** A word or two in Japanese, drawn huge and outlined behind the name. */
  glyph: string;
  tagline: Key;
  description: Paragraph[];
  status: ProjectStatus;
  /** `owner/name` on GitHub. */
  repo: string;
  /** Where it runs, if it runs somewhere. */
  url?: string;
  stack: string[];
  highlights: { icon: LucideIcon; title: Key; body: Key }[];
  roadmap?: RoadmapItem[];
  /** When the roadmap was last brought up to date, as YYYY-MM-DD. */
  roadmapUpdated?: string;
};

export type RoadmapItem = {
  label: Key;
  state: RoadmapState;
  /** When a done item landed, as YYYY-MM-DD. */
  date?: string;
};

/** Done has landed, now is being built (or is in review), next hasn't started. */
export type RoadmapState = "done" | "now" | "next";

export const PROJECTS: Project[] = [
  {
    slug: "fuwa",
    name: "fuwa",
    glyph: "ふわ",
    tagline: "projects.fuwa.tagline",
    description: [
      {
        k: "projects.fuwa.description.intro",
        values: {
          name: { text: "fuwa", style: "strong" },
          fuwafuwa: { text: "fuwafuwa", style: "em" },
          link: { text: "fuwa.chat", href: "https://fuwa.chat" },
        },
      },
      { k: "projects.fuwa.description.files", values: { databaseFile: { k: "projects.fuwa.description.databaseFile", style: "strong" } } },
    ],
    status: "live",
    repo: "waifu-devs/fuwa",
    url: "https://fuwa.chat",
    stack: ["Rust", "Turso", "gRPC", "WebRTC", "MLS", "React", "GPUI"],
    highlights: [
      { icon: Database, title: "projects.fuwa.highlight.file.title", body: "projects.fuwa.highlight.file.body" },
      { icon: House, title: "projects.fuwa.highlight.selfHost.title", body: "projects.fuwa.highlight.selfHost.body" },
      { icon: Cloud, title: "projects.fuwa.highlight.hosted.title", body: "projects.fuwa.highlight.hosted.body" },
      { icon: Layers, title: "projects.fuwa.highlight.manyServers.title", body: "projects.fuwa.highlight.manyServers.body" },
    ],
    roadmapUpdated: "2026-10-03",
    roadmap: [
      { label: "projects.fuwa.roadmap.server", state: "done", date: "2026-09-28" },
      { label: "projects.fuwa.roadmap.webApp", state: "done", date: "2026-09-29" },
      { label: "projects.fuwa.roadmap.images", state: "done", date: "2026-09-30" },
      { label: "projects.fuwa.roadmap.scaleOut", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.signIn", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.launch", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.backups", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.e2ee", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.voice", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.agents", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.sso", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.proxy", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.reorder", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.desktop", state: "done", date: "2026-10-02" },
      { label: "projects.fuwa.roadmap.video", state: "done", date: "2026-10-03" },
      { label: "projects.fuwa.roadmap.themes", state: "done", date: "2026-10-03" },
      { label: "projects.fuwa.roadmap.shortcuts", state: "done", date: "2026-10-03" },
      { label: "projects.fuwa.roadmap.recording", state: "done", date: "2026-10-03" },
      { label: "projects.fuwa.roadmap.reports", state: "done", date: "2026-10-03" },
      { label: "projects.fuwa.roadmap.desktopSettings", state: "now" },
      { label: "projects.fuwa.roadmap.screenAudio", state: "now" },
      { label: "projects.fuwa.roadmap.regions", state: "now" },
      { label: "projects.fuwa.roadmap.desktopCalls", state: "next" },
      { label: "projects.fuwa.roadmap.desktopShaders", state: "next" },
      { label: "projects.fuwa.roadmap.recordingLimits", state: "next" },
      { label: "projects.fuwa.roadmap.cameraModeration", state: "next" },
      { label: "projects.fuwa.roadmap.relay", state: "next" },
      { label: "projects.fuwa.roadmap.tray", state: "next" },
      { label: "projects.fuwa.roadmap.overlay", state: "next" },
    ],
  },
  {
    slug: "site",
    name: "waifu.dev",
    glyph: "家",
    tagline: "projects.site.tagline",
    description: [
      { k: "projects.site.description.intro", values: { path: { text: "/u/you", style: "code" } } },
      {
        k: "projects.site.description.stack",
        values: {
          effect: { text: "Effect", href: "https://effect.website" },
          tanstackStart: { text: "TanStack Start", href: "https://tanstack.com/start" },
        },
      },
    ],
    status: "live",
    repo: "waifu-devs/site",
    url: "https://www.waifu.dev",
    stack: ["TypeScript", "Effect", "TanStack Start", "Postgres"],
    highlights: [
      { icon: KeyRound, title: "projects.site.highlight.signIn.title", body: "projects.site.highlight.signIn.body" },
      { icon: UserRound, title: "projects.site.highlight.profiles.title", body: "projects.site.highlight.profiles.body" },
      { icon: Palette, title: "projects.site.highlight.themes.title", body: "projects.site.highlight.themes.body" },
      { icon: Newspaper, title: "projects.site.highlight.news.title", body: "projects.site.highlight.news.body" },
    ],
  },
];
