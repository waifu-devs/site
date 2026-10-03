import { Cloud, Database, House, KeyRound, Layers, Newspaper, Palette, UserRound, type LucideIcon } from "lucide-react";

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
  roadmap?: RoadmapItem[];
  /** When the roadmap was last brought up to date, as YYYY-MM-DD. */
  roadmapUpdated?: string;
};

export type RoadmapItem = {
  label: string;
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
    tagline: "Chat servers you can own. Hosted by us, or by you.",
    description: `**fuwa** (ふわ, as in *fuwafuwa*: fluffy) is a chat app in the spirit of Discord that you can run yourself, or use right now at [fuwa.chat](https://fuwa.chat).

Every community server keeps its members, channels and messages in **its own database file** (Turso, so it still opens as plain SQLite): a whole community is one file you can back up, move or hand to a friend. The server and the desktop app are written in Rust, direct messages and their calls are end-to-end encrypted, and one app holds as many servers as you like: ones on fuwa.chat, your friend's, and the one humming in your closet.`,
    status: "live",
    repo: "waifu-devs/fuwa",
    url: "https://fuwa.chat",
    stack: ["Rust", "Turso", "gRPC", "WebRTC", "MLS", "React", "GPUI"],
    highlights: [
      { icon: Database, title: "One file per server", body: "Members, channels, messages and events live in that server's own Turso database file." },
      { icon: House, title: "Self-host it", body: "One Docker image or one Rust binary on your own box, with accounts of its own and every message kept at home." },
      { icon: Cloud, title: "Or let us host it", body: "fuwa.chat is up and running, for when you just want to chat." },
      { icon: Layers, title: "One app, many servers", body: "Hosted and self-hosted servers sit together in one sidebar, in your browser or the desktop app." },
    ],
    roadmapUpdated: "2026-10-03",
    roadmap: [
      { label: "Rust server on Turso, a database file per community server, with its own accounts", state: "done", date: "2026-09-28" },
      { label: "Web app served by every fuwa server, with every setting in the app: roles, bans, automod, welcome screens, audit log and instance admin", state: "done", date: "2026-09-29" },
      { label: "Avatars, banners and server icons", state: "done", date: "2026-09-30" },
      { label: "One binary that splits into gateways, a directory and shards to scale out", state: "done", date: "2026-10-02" },
      { label: "Sign in with waifu.dev or a standalone account, invites, roles, server rules and applications to join", state: "done", date: "2026-10-02" },
      { label: "fuwa.chat goes live, with release 0.1.0, a Docker image and a self-hosting guide", state: "done", date: "2026-10-02" },
      { label: "fuwa.chat split across machines, with every database copied to backup storage", state: "done", date: "2026-10-02" },
      { label: "End-to-end encrypted direct messages (MLS): the server only ever sees ciphertext", state: "done", date: "2026-10-02" },
      { label: "Voice channels and direct message calls, end-to-end encrypted in DMs, with your ping on screen", state: "done", date: "2026-10-02" },
      { label: "Agents, bots and apps that chat, and talk in voice channels", state: "done", date: "2026-10-02" },
      { label: "Single sign-on (SSO and SAML) for a whole instance or a single server, off until you turn it on", state: "done", date: "2026-10-02" },
      { label: "No leaked IP addresses: pictures and link previews come through your fuwa server, never straight to your device", state: "done", date: "2026-10-02" },
      { label: "Drag channels and categories into order", state: "done", date: "2026-10-02" },
      { label: "Native desktop app for Windows, macOS and Linux, written in Rust with GPUI: chat, DMs, settings, themes and shortcuts (installers arrive with the next release)", state: "done", date: "2026-10-02" },
      { label: "Cameras and screen sharing in calls, each one able to pop out into its own window", state: "done", date: "2026-10-03" },
      { label: "Custom themes, background pictures, moving GPU effects and shaders you write yourself", state: "done", date: "2026-10-03" },
      { label: "Keyboard shortcuts you can change, the same on the web and the desktop", state: "done", date: "2026-10-03" },
      { label: "Record calls on your device, and voice channels on the server with a track per person", state: "done", date: "2026-10-03" },
      { label: "Anonymous bug, speed and usage reports, with an off switch in every app", state: "done", date: "2026-10-03" },
      { label: "The last server settings pages in the desktop app: automod, welcome screen and agents", state: "now" },
      { label: "Sound with a shared screen, from a tab or the whole system", state: "now" },
      { label: "Servers in more regions (US, Europe, Asia), with each server's data kept in the region its owner picks", state: "now" },
      { label: "Calls in the desktop app, with each camera in a window of its own", state: "next" },
      { label: "Your own shaders in the desktop app", state: "next" },
      { label: "Limits on how much a server records, and old recordings cleared away by themselves", state: "next" },
      { label: "Camera controls for moderators", state: "next" },
      { label: "A relay on fuwa.chat so calls connect on strict networks", state: "next" },
      { label: "The desktop app in your system tray", state: "next" },
      { label: "An in-game overlay", state: "next" },
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
      { icon: Newspaper, title: "News", body: "Share links and posts at /news, vote them up and talk them over." },
    ],
  },
];
