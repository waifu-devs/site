/**
 * The status page: one HTML document, its stylesheet and a small script, all
 * served from here (CSP 'self' only: no inline code, nothing from anywhere
 * else, the font included). The page is whole without the script; the script
 * adds the day tooltips and swaps in fresh results every minute.
 */
import type { StatusComponent, StatusDay, StatusIncident, StatusReport, StatusState } from "./Report.ts";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const longDay = (day: string) => `${shortDay(day)}, ${day.slice(0, 4)}`;
const utcTime = (iso: string) => `${shortDay(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
const addDays = (day: string, n: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")} s` : `${Math.round(n)} ms`);
/** Never rounds up to 100% unless it is. */
const percent = (share: number) => (share >= 1 ? "100%" : `${(Math.floor(share * 10_000) / 100).toFixed(2)}%`);
const duration = (millis: number) => {
  const minutes = Math.max(1, Math.round(millis / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${Math.floor(hours / 24)} d`;
};

// Lucide's icons, drawn inline.
const icon = (paths: string, cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  dashed:
    '<path d="M10.1 2.18a9.93 9.93 0 0 1 3.8 0"/><path d="M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7"/><path d="M21.82 10.1a9.93 9.93 0 0 1 0 3.8"/><path d="M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69"/><path d="M13.9 21.82a9.94 9.94 0 0 1-3.8 0"/><path d="M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7"/><path d="M2.18 13.9a9.93 9.93 0 0 1 0-3.8"/><path d="M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
};

const STATE: Record<StatusState, { word: string; tone: string; icon: string }> = {
  up: { word: "Running", tone: "good", icon: ICONS.check },
  slow: { word: "Slow", tone: "warning", icon: ICONS.gauge },
  down: { word: "Down", tone: "critical", icon: ICONS.x },
  unknown: { word: "Not checked lately", tone: "muted", icon: ICONS.dashed },
};

type Level = "good" | "warning" | "critical" | "none";
const LEVEL_WORD: Record<Level, string> = { good: "Running", warning: "Some trouble", critical: "Down for a while", none: "Not checked" };

/** How a day went: every check answered quickly, some trouble, real trouble, or never checked. */
export function levelOf(day: StatusDay | undefined): Level {
  if (!day || day.checks === 0) return "none";
  const up = day.up / day.checks;
  if (up < 0.99) return "critical";
  if (up < 0.999 || day.slow / day.checks > 0.1) return "warning";
  return "good";
}

/** The page's one line: the worst state of anything, in words. */
export function overall(components: readonly StatusComponent[]): { state: StatusState; headline: string } {
  if (components.length === 0) return { state: "unknown", headline: "No checks yet" };
  const down = components.filter((c) => c.state === "down");
  if (down.length) return { state: "down", headline: down.length === 1 ? `${down[0]!.name} is down` : `${down.length} parts are down` };
  if (components.some((c) => c.state === "slow")) return { state: "slow", headline: "Everything's up, some of it slowly" };
  if (components.every((c) => c.state === "unknown")) return { state: "unknown", headline: "Not checked lately" };
  return { state: "up", headline: "Everything's running" };
}

const key = () =>
  `<div class="key">${(["good", "warning", "critical", "none"] as const).map((l) => `<span><i class="sw l-${l}"></i>${LEVEL_WORD[l]}</span>`).join("")}</div>`;

function bars(component: StatusComponent, today: string, window: number) {
  const byDay = new Map(component.days.map((d) => [d.day, d]));
  const cells = Array.from({ length: window }, (_, i) => {
    const day = addDays(today, i - window + 1);
    const data = byDay.get(day);
    const level = levelOf(data);
    const detail =
      data && data.checks > 0
        ? `${percent(data.up / data.checks)} of ${data.checks.toLocaleString("en-US")} checks answered${data.avgMs !== null ? ` · ${ms(data.avgMs)} on average` : ""}${data.slow > 0 ? ` · ${data.slow} slow` : ""}`
        : "No checks that day.";
    // Phones show the last 30 days.
    const old = i < window - 30 ? " old" : "";
    return `<span class="bar l-${level}${old}" data-day="${longDay(day)}" data-level="${level}" data-word="${LEVEL_WORD[level]}" data-detail="${escape(detail)}"></span>`;
  }).join("");
  return `<div class="bars" tabindex="0" role="img" aria-label="${escape(component.name)}: the last ${window} days. Use the arrow keys to read each day.">${cells}</div>`;
}

function row(c: StatusComponent, today: string, window: number) {
  const s = STATE[c.state];
  const latency = c.state !== "down" && c.latencyMs !== null ? `<span class="soft">· ${ms(c.latencyMs)}</span>` : "";
  return `<div class="row">
  <div class="row-head">
    <div><h3>${escape(c.name)}</h3><p class="soft small">${escape(c.description)}</p></div>
    <span class="pill t-${s.tone}">${icon(s.icon, "i14")}<b>${s.word}</b>${latency}</span>
  </div>
  <div class="strip">${bars(c, today, window)}</div>
  <div class="row-foot soft"><span><span class="phone">30 days ago</span><span class="wide">${window} days ago</span></span><b>${c.uptime === null ? "No checks yet" : `${percent(c.uptime)} answered`}</b><span>Today</span></div>
</div>`;
}

function incidents(list: readonly StatusIncident[], now: string) {
  const items = list
    .map((i) => {
      const open = i.endedAt === null;
      const lasted = Date.parse(i.endedAt ?? now) - Date.parse(i.startedAt);
      const when = open ? `Since ${utcTime(i.startedAt)}, ${duration(lasted)} so far` : `${utcTime(i.startedAt)} for ${duration(lasted)}`;
      return `<div class="incident">
  ${open ? icon(ICONS.alert, "i20 t-critical") : icon(ICONS.check, "i20 t-good")}
  <div class="grow"><p><b>${escape(i.name)} ${open ? "is down" : "was down"}</b><span class="soft"> · ${escape(i.reason)}</span></p><p class="soft small">${when}</p></div>
  <span class="tag ${open ? "t-critical" : "soft"}">${open ? "Ongoing" : "Resolved"}</span>
</div>`;
    })
    .join("");
  return `<section class="rise">
  <h2>Incidents</h2>
  <p class="soft small">Any part that missed two checks in a row, until it answered again. Times are UTC.</p>
  ${list.length ? `<div class="card list">${items}</div>` : `<div class="card empty"><p class="kao">(˶ᵔ ᵕ ᵔ˶)</p><p class="soft">Nothing has gone down.</p></div>`}
</section>`;
}

/** Everything inside <main>: what the script swaps in on each refresh. */
export function renderMain(report: StatusReport | null): string {
  if (!report) {
    return `<div class="card empty rise"><p class="kao">(・・;)</p><h1>Status can't be read right now</h1><p class="soft">The checks' own storage isn't answering. Try again in a minute.</p></div>`;
  }
  const { state, headline } = overall(report.components);
  const s = STATE[state];
  const checked = report.components.reduce<string | null>((latest, c) => (c.checkedAt && (!latest || c.checkedAt > latest) ? c.checkedAt : latest), null);
  const today = report.at.slice(0, 10);
  const groups = [
    { key: "fuwa", title: "fuwa.chat", blurb: "The fuwa instance Waifu Devs hosts" },
    { key: "site", title: "waifu.dev", blurb: "The community site and what it runs on" },
  ] as const;
  const sections = groups
    .map((g) => {
      const components = report.components.filter((c) => c.group === g.key);
      if (!components.length) return "";
      return `<section class="rise">
  <div class="section-head"><div><h2>${g.title}</h2><p class="soft small">${g.blurb}</p></div>${key()}</div>
  <div class="card list">${components.map((c) => row(c, today, report.window)).join("")}</div>
</section>`;
    })
    .join("");
  return `<header class="hero rise" data-checked="${checked ?? ""}" data-every="${report.everySeconds}">
  <span class="pulse t-${s.tone}">${icon(s.icon, "i48")}</span>
  <div><h1>${escape(headline)}</h1><p class="soft small"><span class="sr">${s.word}. </span>Checked every minute from outside<span class="ago"></span></p></div>
</header>
${sections}
${incidents(report.incidents, report.at)}`;
}

export function renderPage(report: StatusReport | null): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waifu Devs status</title>
<meta name="description" content="Whether fuwa.chat and waifu.dev are up, and how they did over the last 90 days.">
<link rel="preload" href="/fonts/m-plus-rounded-1c-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%F0%9F%92%97%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/app.css">
<script src="/app.js" defer></script>
</head>
<body>
<div class="top"><a href="https://www.waifu.dev" class="brand"><span class="heart">♡</span> waifu.dev <span class="soft">status</span></a><a class="soft small" href="https://fuwa.chat">fuwa.chat</a></div>
<main id="main">${renderMain(report)}</main>
<div class="tip" role="status" aria-live="polite" hidden></div>
<footer class="soft small">Made with ♡ by the <a href="https://www.waifu.dev">Waifu Devs</a> community · <a href="/status.json">JSON</a></footer>
</body>
</html>`;
}

const FONT_WEIGHTS = [400, 700, 800];

export const CSS = `
${FONT_WEIGHTS.map((w) => `@font-face{font-family:"M PLUS Rounded 1c";font-style:normal;font-display:swap;font-weight:${w};src:url("/fonts/m-plus-rounded-1c-latin-${w}-normal.woff2") format("woff2")}`).join("\n")}
:root{
  --background:#fff5f8;--foreground:#3b2330;--card:#fff;--muted-foreground:#8a6577;--border:#f8d3e0;--primary:#f06292;
  --good:#0ca30c;--warning:#fab219;--critical:#d03b3b;--no-data:color-mix(in srgb,var(--muted-foreground) 22%,var(--card));
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --background:#14111f;--foreground:#ece6ff;--card:#1f1a2e;--muted-foreground:#9a90b8;--border:#342b4d;--primary:#b388ff;color-scheme:dark;
}}
*{box-sizing:border-box}
html,body{margin:0;overflow-x:clip}
body{background:var(--background);color:var(--foreground);font-family:"M PLUS Rounded 1c",ui-rounded,ui-sans-serif,system-ui,sans-serif;line-height:1.5;min-height:100vh;display:flex;flex-direction:column}
a{color:inherit}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(1.9rem,5vw,2.25rem);font-weight:800;line-height:1.15;text-wrap:balance}
h2{font-size:1.25rem;font-weight:800}
h3{font-size:1rem;font-weight:700}
.soft{color:var(--muted-foreground)}
.small{font-size:.875rem}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.top{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem max(1rem,calc(50% - 28rem));border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--card) 75%,transparent);backdrop-filter:blur(12px)}
.brand{font-weight:800;font-size:1.1rem;text-decoration:none}
.heart{color:var(--primary);display:inline-block;animation:heartbeat 1.8s ease-in-out infinite}
main{flex:1;width:100%;max-width:56rem;margin:0 auto;padding:3rem 1rem;display:flex;flex-direction:column;gap:2.5rem}
footer{text-align:center;padding:1.5rem 1rem;border-top:1px solid var(--border)}
.card{background:var(--card);border:1px solid var(--border);border-radius:1rem;box-shadow:0 1px 2px rgb(0 0 0/.04)}
.list>*+*{border-top:1px solid var(--border)}
.empty{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:2.5rem 1.5rem;text-align:center}
.kao{font-size:1.6rem}
.hero{display:flex;align-items:center;gap:1rem}
.pulse{position:relative;display:grid;place-items:center;flex-shrink:0;width:3rem;height:3rem}
.pulse::after{content:"";position:absolute;inset:0;border-radius:9999px;background:currentColor;animation:ping 2.4s cubic-bezier(0,0,.2,1) infinite}
.pulse svg{position:relative;z-index:1}
section{display:flex;flex-direction:column;gap:1rem}
.section-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.5rem}
.key{display:flex;flex-wrap:wrap;gap:.25rem 1rem;font-size:.75rem;color:var(--muted-foreground)}
.key span{display:flex;align-items:center;gap:.375rem}
.sw{display:inline-block;width:.625rem;height:.625rem;border-radius:3px}
.row{display:flex;flex-direction:column;gap:.75rem;padding:1.25rem 1.5rem}
.row-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
.row-foot{display:flex;justify-content:space-between;gap:.5rem;font-size:.75rem}
.row-foot b{color:var(--foreground)}
.pill{display:flex;flex-shrink:0;align-items:center;gap:.375rem;border:1px solid var(--border);border-radius:9999px;padding:.25rem .625rem;font-size:.75rem}
.pill b{color:var(--foreground)}
.tag{flex-shrink:0;border:1px solid var(--border);border-radius:9999px;padding:.125rem .625rem;font-size:.75rem;font-weight:700}
.incident{display:flex;align-items:flex-start;gap:.75rem;padding:1rem 1.5rem}
.grow{flex:1;min-width:0}
.i14{width:.875rem;height:.875rem}.i20{width:1.25rem;height:1.25rem;flex-shrink:0;margin-top:.15rem}.i48{width:3rem;height:3rem}
.t-good{color:var(--good)}.t-warning{color:var(--warning)}.t-critical{color:var(--critical)}.t-muted{color:var(--muted-foreground)}
.l-good{background:var(--good)}.l-warning{background:var(--warning)}.l-critical{background:var(--critical)}.l-none{background:var(--no-data)}
.strip{position:relative}
.bars{display:flex;align-items:flex-end;gap:2px;height:2.25rem;border-radius:3px;outline:none;touch-action:pan-y}
.bars:focus-visible{box-shadow:0 0 0 2px var(--primary)}
.bar{flex:1;min-width:0;height:100%;border-radius:3px;transform-origin:bottom;transition:transform .18s cubic-bezier(.3,1.6,.5,1);animation:grow .5s cubic-bezier(.2,.8,.2,1) backwards}
.bar.on{transform:scaleY(1.12)}
.phone{display:none}
@media (max-width:639px){.bar.old{display:none}.phone{display:inline}.wide{display:none}.row,.incident{padding:1.1rem 1rem}}
${Array.from({ length: 90 }, (_, i) => `.bar:nth-child(${i + 1}){animation-delay:${i * 5}ms}`).join("")}
@media (max-width:639px){${Array.from({ length: 30 }, (_, i) => `.bar:nth-child(${i + 61}){animation-delay:${i * 10}ms}`).join("")}}
.tip{position:absolute;z-index:50;width:max-content;max-width:15rem;padding:.5rem .75rem;border:1px solid var(--border);border-radius:.6rem;background:var(--card);font-size:.75rem;box-shadow:0 10px 30px -10px rgb(0 0 0/.3);pointer-events:none;transition:opacity .15s ease,translate .12s ease-out;translate:-50% 0}
.tip p+p{margin-top:.25rem}
.tip .day{font-weight:700}
.tip .dot{display:inline-block;width:.5rem;height:.5rem;border-radius:9999px;margin-right:.375rem}
.rise{animation:rise .7s cubic-bezier(.2,.8,.2,1) backwards}
section.rise:nth-of-type(2){animation-delay:.08s}section.rise:nth-of-type(3){animation-delay:.16s}
.fresh .rise,.fresh .bar{animation:none}
@keyframes rise{from{opacity:0;transform:translateY(20px)}}
@keyframes grow{from{transform:scaleY(.15);opacity:0}}
@keyframes ping{0%{transform:scale(.8);opacity:.35}80%,100%{transform:scale(1.7);opacity:0}}
@keyframes heartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}45%{transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export const JS = `
"use strict";
(() => {
  const tip = document.querySelector(".tip");
  const main = document.getElementById("main");
  let active = null;

  function show(bar) {
    if (active) active.classList.remove("on");
    active = bar;
    if (!bar) return void (tip.hidden = true);
    bar.classList.add("on");
    tip.replaceChildren();
    const day = document.createElement("p");
    day.className = "day";
    day.textContent = bar.dataset.day;
    const word = document.createElement("p");
    const dot = document.createElement("span");
    dot.className = "dot l-" + bar.dataset.level;
    word.append(dot, bar.dataset.word);
    const detail = document.createElement("p");
    detail.className = "soft";
    detail.textContent = bar.dataset.detail;
    tip.append(day, word, detail);
    tip.hidden = false;
    const box = bar.getBoundingClientRect();
    const strip = bar.parentElement.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(box.left + box.width / 2, strip.left + half), strip.right - half);
    tip.style.left = x + window.scrollX + "px";
    tip.style.top = strip.top + window.scrollY - tip.offsetHeight - 8 + "px";
  }
  const visible = (bars) => [...bars.children].filter((b) => b.offsetWidth > 0);
  const pick = (event) => {
    const bars = event.target.closest(".bars");
    if (!bars) return;
    const list = visible(bars);
    show(list.find((b) => event.clientX <= b.getBoundingClientRect().right + 1) || list[list.length - 1]);
  };
  main.addEventListener("pointermove", pick);
  main.addEventListener("pointerdown", pick);
  main.addEventListener("pointerout", (event) => {
    if (event.target.closest(".bars") && !event.relatedTarget?.closest?.(".bars")) show(null);
  });
  main.addEventListener("focusout", () => show(null));
  main.addEventListener("keydown", (event) => {
    const bars = event.target.closest(".bars");
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!bars || !step) return;
    event.preventDefault();
    const list = visible(bars);
    const now = active && active.parentElement === bars ? list.indexOf(active) : list.length;
    show(list[Math.min(list.length - 1, Math.max(0, now + step))]);
  });

  // "last check 12 s ago", ticking.
  function ago() {
    const hero = main.querySelector(".hero");
    const out = hero && hero.querySelector(".ago");
    if (!out || !hero.dataset.checked) return;
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(hero.dataset.checked)) / 1000));
    out.textContent = " · last check " + (seconds < 60 ? seconds + " s" : Math.round(seconds / 60) + " min") + " ago";
  }
  ago();
  setInterval(ago, 5000);

  // Fresh results every minute while the tab shows, without replaying the entrance.
  async function refresh() {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/?part=main", { cache: "no-store" });
      if (!response.ok) return;
      const html = await response.text();
      show(null);
      document.body.classList.add("fresh");
      main.innerHTML = html;
      ago();
    } catch {}
  }
  setInterval(refresh, 60000);
})();
`;
