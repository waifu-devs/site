import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { StatusComponent, StatusIncident, StatusReport, StatusState } from "@waifu-devs/domain/api";
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Gauge } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { LevelKey, UptimeBars } from "@/components/status/UptimeBars";
import { Card } from "@/components/ui/card";
import { title } from "@/lib/head";
import { cn } from "@/lib/utils";
import { duration, ms, percent, useDarkTheme, utcTime } from "@/lib/viz";
import { getStatus } from "@/server/insights";

export const Route = createFileRoute("/status")({
  loader: () => getStatus(),
  head: () => ({
    meta: [title("Status"), { name: "description", content: "Whether fuwa.chat and waifu.dev are up, and how they did over the last 90 days." }],
  }),
  component: StatusPage,
});

const STATE: Record<StatusState, { word: string; color: string; Icon: ComponentType<{ className?: string }> }> = {
  up: { word: "Running", color: "var(--good)", Icon: CircleCheck },
  slow: { word: "Slow", color: "var(--warning)", Icon: Gauge },
  down: { word: "Down", color: "var(--critical)", Icon: CircleX },
  unknown: { word: "Not checked lately", color: "var(--muted-foreground)", Icon: CircleDashed },
};

/** The page's one line: the worst state of anything, in words. */
function overall(components: readonly StatusComponent[]): { state: StatusState; headline: string } {
  if (components.length === 0) return { state: "unknown", headline: "No checks yet" };
  const down = components.filter((c) => c.state === "down");
  if (down.length) return { state: "down", headline: down.length === 1 ? `${down[0]!.name} is down` : `${down.length} parts are down` };
  if (components.some((c) => c.state === "slow")) return { state: "slow", headline: "Everything's up, some of it slowly" };
  if (components.every((c) => c.state === "unknown")) return { state: "unknown", headline: "Not checked lately" };
  return { state: "up", headline: "Everything's running" };
}

/** Seconds since `iso`, ticking, once the page is in the browser (the server renders no clock). */
function useAgo(iso: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  if (!iso || now === null) return null;
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return seconds < 60 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

/** Reloads the status every minute while the tab is showing. */
function useRefresh(everySeconds: number) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void router.invalidate();
    }, everySeconds * 1000);
    return () => clearInterval(id);
  }, [router, everySeconds]);
}

function StatusPage() {
  const report = Route.useLoaderData();
  const dark = useDarkTheme();
  useRefresh(report?.everySeconds ?? 60);
  return (
    <main className={cn("viz mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:py-16", dark && "viz-dark")}>
      {report ? <Report report={report} /> : <Unavailable />}
    </main>
  );
}

function Unavailable() {
  return (
    <Card className="rise items-center gap-3 px-6 py-12 text-center">
      <p className="float text-4xl">(・・;)</p>
      <h1 className="text-2xl font-extrabold">Status can't be read right now</h1>
      <p className="max-w-md text-muted-foreground">
        The part of waifu.dev that runs the checks isn't answering. That says something on its own; try again in a minute.
      </p>
    </Card>
  );
}

function Report({ report }: { report: StatusReport }) {
  const { state, headline } = overall(report.components);
  const { word, color, Icon } = STATE[state];
  const checked = report.components.reduce<string | null>((latest, c) => (c.checkedAt && (!latest || c.checkedAt > latest) ? c.checkedAt : latest), null);
  const ago = useAgo(checked);
  const today = report.at.slice(0, 10);
  const groups = [
    { key: "fuwa", title: "fuwa.chat", blurb: "The fuwa instance we host" },
    { key: "site", title: "waifu.dev", blurb: "This site and what it runs on" },
  ] as const;

  return (
    <>
      <header className="rise flex flex-col gap-4">
        <p className="text-sm font-bold text-muted-foreground">Status</p>
        <div className="flex items-center gap-4">
          <span className="status-pulse grid size-12 shrink-0 place-items-center rounded-full" style={{ color }}>
            <Icon className="relative z-10 size-12" />
          </span>
          <div className="min-w-0">
            <h1 className="text-balance text-3xl font-extrabold leading-tight sm:text-4xl">{headline}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="sr-only">{word}. </span>
              Checked every minute from our own servers{ago && <> · last check {ago}</>}
            </p>
          </div>
        </div>
      </header>

      {groups.map((group) => {
        const components = report.components.filter((c) => c.group === group.key);
        if (!components.length) return null;
        return (
          <section key={group.key} className="rise flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-extrabold">{group.title}</h2>
                <p className="text-sm text-muted-foreground">{group.blurb}</p>
              </div>
              <LevelKey />
            </div>
            <Card className="gap-0 divide-y py-0">
              {components.map((component) => (
                <Row key={component.id} component={component} today={today} window={report.window} />
              ))}
            </Card>
          </section>
        );
      })}

      <Incidents incidents={report.incidents} now={report.at} />
    </>
  );
}

function Row({ component, today, window }: { component: StatusComponent; today: string; window: number }) {
  const { word, color, Icon } = STATE[component.state];
  return (
    <div className="flex flex-col gap-3 px-4 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-bold">{component.name}</h3>
          <p className="text-sm text-muted-foreground">{component.description}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ color }}>
          <Icon className="size-3.5" />
          <span className="text-foreground">{word}</span>
          {component.state !== "down" && component.latencyMs !== null && (
            <span className="font-normal text-muted-foreground">· {ms(component.latencyMs)}</span>
          )}
        </span>
      </div>
      <UptimeBars days={component.days} today={today} window={window} name={component.name} />
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="sm:hidden">30 days ago</span>
          <span className="max-sm:hidden">{window} days ago</span>
        </span>
        <span className="font-bold text-foreground">{component.uptime === null ? "No checks yet" : `${percent(component.uptime)} answered`}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function Incidents({ incidents, now }: { incidents: readonly StatusIncident[]; now: string }) {
  return (
    <section className="rise flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold">Incidents</h2>
        <p className="text-sm text-muted-foreground">Any part that missed two checks in a row, until it answered again. Times are UTC.</p>
      </div>
      {incidents.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-10 text-center">
          <p className="text-2xl">(˶ᵔ ᵕ ᵔ˶)</p>
          <p className="text-muted-foreground">Nothing has gone down.</p>
        </Card>
      ) : (
        <Card className="stagger gap-0 divide-y py-0">
          {incidents.map((incident) => {
            const open = incident.endedAt === null;
            const lasted = Date.parse(incident.endedAt ?? now) - Date.parse(incident.startedAt);
            return (
              <div key={incident.id} className="flex items-start gap-3 px-4 py-4 sm:px-6">
                {open ? (
                  <CircleAlert className="mt-0.5 size-5 shrink-0" style={{ color: "var(--critical)" }} />
                ) : (
                  <CircleCheck className="mt-0.5 size-5 shrink-0" style={{ color: "var(--good)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {incident.name} {open ? "is down" : "was down"}
                    <span className="font-normal text-muted-foreground"> · {incident.reason}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {open ? <>Since {utcTime(incident.startedAt)}, {duration(lasted)} so far</> : <>{utcTime(incident.startedAt)} for {duration(lasted)}</>}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                  style={{ color: open ? "var(--critical)" : "var(--muted-foreground)" }}
                >
                  {open ? "Ongoing" : "Resolved"}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
