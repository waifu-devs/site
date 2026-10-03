import { describe, expect, it } from "vitest";
import { levelOf, overall, renderMain, renderPage } from "../src/Page.ts";
import type { StatusComponent } from "../src/Report.ts";

const part = (over: Partial<StatusComponent>): StatusComponent => ({
  id: "site.web",
  group: "site",
  name: "www.waifu.dev",
  description: "The community site",
  state: "up",
  latencyMs: 20,
  checkedAt: "2026-10-03T12:00:00.000Z",
  since: "2026-10-01T00:00:00.000Z",
  uptime: 1,
  days: [{ day: "2026-10-03", checks: 720, up: 720, slow: 0, avgMs: 20 }],
  ...over,
});

describe("status page", () => {
  it("grades a day from its checks", () => {
    expect(levelOf(undefined)).toBe("none");
    expect(levelOf({ day: "2026-10-03", checks: 1000, up: 1000, slow: 0, avgMs: 10 })).toBe("good");
    expect(levelOf({ day: "2026-10-03", checks: 1000, up: 998, slow: 0, avgMs: 10 })).toBe("warning");
    expect(levelOf({ day: "2026-10-03", checks: 1000, up: 1000, slow: 200, avgMs: 10 })).toBe("warning");
    expect(levelOf({ day: "2026-10-03", checks: 1000, up: 900, slow: 0, avgMs: 10 })).toBe("critical");
  });

  it("names the worst state", () => {
    expect(overall([part({})]).headline).toBe("Everything's running");
    expect(overall([part({}), part({ state: "down", name: "Calls" })]).headline).toBe("Calls is down");
    expect(overall([]).state).toBe("unknown");
  });

  it("renders 90 days, escaped, with no inline styles or scripts", () => {
    const html = renderPage({
      at: "2026-10-03T12:00:00.000Z",
      window: 90,
      everySeconds: 60,
      components: [part({ description: "<img src=x onerror=alert(1)>" })],
      incidents: [],
    });
    expect(html.match(/class="bar /g)).toHaveLength(90);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/style="|<style|<script>/);
    expect(html).not.toMatch(/https?:\/\/(?!fuwa\.chat|www\.waifu\.dev|www\.w3\.org)/);
  });

  it("says so when nothing can be read", () => {
    expect(renderMain(null)).toContain("can't be read");
  });
});
