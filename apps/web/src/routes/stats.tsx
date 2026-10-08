import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useMemo, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import { BarChart, Legend, LineChart, type Series, Sparkline } from "@/components/stats/Charts";
import { Card } from "@/components/ui/card";
import { T, useI18n } from "@/i18n/react";
import { headT, title } from "@/lib/head";
import { APPS, appKey, appLabel, type Insights, RANGES, type Range } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { addDays, useDarkTheme, useFormats } from "@/lib/viz";
import { getStats } from "@/server/insights";

export const Route = createFileRoute("/stats")({
  validateSearch: (search: Record<string, unknown>): { days?: Range } => {
    const days = Number(search.days);
    return RANGES.includes(days as Range) ? { days: days as Range } : {};
  },
  loaderDeps: ({ search }) => ({ days: search.days ?? 90 }),
  loader: ({ deps }) => getStats({ data: deps.days }),
  head: ({ matches }) => ({ meta: [title(headT(matches)("stats.title"))] }),
  component: StatsPage,
});

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"] as const;
/** Each app keeps its color whichever are shown. */
const APP_COLOR: Record<string, string> = Object.fromEntries(APPS.map((a, i) => [a.key, SERIES[i]!]));

type Grain = "day" | "week";

/** Every UTC day of the range, oldest first. */
const daysOf = (today: string, days: number) => Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));

/** The Monday a day's week starts on. */
function weekOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/**
 * Turns per-day values into points at the chosen grain: counts of things that
 * happened add up over a week, totals (accounts, installs) take the week's last
 * day, and timings average the days that had any.
 */
function regrain(days: string[], grain: Grain) {
  if (grain === "day") return { labels: days, points: days.map((d) => [d]) };
  const weeks = new Map<string, string[]>();
  for (const d of days) weeks.set(weekOf(d), [...(weeks.get(weekOf(d)) ?? []), d]);
  return { labels: [...weeks.keys()], points: [...weeks.values()] };
}
type Kind = "sum" | "last" | "mean";
function fold(points: string[][], value: (day: string) => number | null, kind: Kind): Array<number | null> {
  return points.map((days) => {
    const values = days.map(value).filter((v): v is number => v !== null);
    if (!values.length) return kind === "sum" ? 0 : null;
    if (kind === "sum") return values.reduce((a, b) => a + b, 0);
    if (kind === "last") return values.at(-1)!;
    return values.reduce((a, b) => a + b, 0) / values.length;
  });
}

function StatsPage() {
  const { days, today, insights } = Route.useLoaderData();
  const dark = useDarkTheme();
  const { t } = useI18n();
  const navigate = useNavigate({ from: "/stats" });
  const [grain, setGrain] = useState<Grain>("day");
  const [app, setApp] = useState<string>("all");

  return (
    <main className={cn("viz mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12", dark && "viz-dark")}>
      <header className="rise flex flex-col gap-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t("stats.title")}</h1>
        <p className="max-w-2xl text-muted-foreground">
          {t("stats.intro")}
        </p>
      </header>

      {/* Filters: one row, above every chart. */}
      <div className="rise sticky top-[61px] z-30 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-md max-sm:top-[88px]">
        <Tabs value={String(days)} onValueChange={(value) => void navigate({ search: { days: Number(value) as Range }, replace: true })}>
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={String(r)} className="px-3">
                {r === 365 ? t("stats.range.year") : t("stats.range.days", { count: r })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={grain} onValueChange={(value) => setGrain(value as Grain)}>
          <TabsList>
            <TabsTrigger value="day" className="px-3">
              {t("stats.grain.day")}
            </TabsTrigger>
            <TabsTrigger value="week" className="px-3">
              {t("stats.grain.week")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
          {t("stats.app.label")}
          <select
            value={app}
            onChange={(event) => setApp(event.target.value)}
            className="h-9 rounded-lg border bg-card px-2 text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t("stats.app.all")}</option>
            {APPS.map((a) => (
              <option key={a.key} value={a.key}>
                {t(a.label)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {insights ? (
        <Dashboard insights={insights} today={today} days={days} grain={grain} app={app} />
      ) : (
        <Card className="items-center gap-3 px-6 py-12 text-center">
          <p className="float text-4xl">(・・;)</p>
          <h2 className="text-xl font-extrabold">{t("stats.unavailable.title")}</h2>
          <p className="max-w-md text-muted-foreground">{t("stats.unavailable.body")}</p>
        </Card>
      )}
    </main>
  );
}

function Dashboard({ insights, today, days, grain, app }: { insights: Insights; today: string; days: number; grain: Grain; app: string }) {
  const { t } = useI18n();
  const { compact, bytes, ms, shortDay } = useFormats();
  const range = useMemo(() => daysOf(today, days), [today, days]);
  const { labels, points } = useMemo(() => regrain(range, grain), [range, grain]);
  const weekly = grain === "week";

  const usage = useMemo(() => {
    // Days by hosting kind, and summed across them.
    const byDay = new Map<string, Insights["usage"]["days"]>();
    for (const row of insights.usage.days) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
    const total = (key: Exclude<keyof Insights["usage"]["days"][number], "day" | "hosting">, hosting?: string) => (day: string) => {
      const values = (byDay.get(day) ?? []).filter((r) => !hosting || r.hosting === hosting).flatMap((r) => (r[key] === null ? [] : [r[key]]));
      return values.length ? values.reduce((sum, v) => sum + v, 0) : null;
    };
    // Builds from before agents don't count them apart.
    const agents = insights.usage.days.some((r) => r.agents !== null);
    return { total, agents, any: insights.usage.days.length > 0 };
  }, [insights]);

  const charts = useMemo(() => {
    const shows = (row: { source: string; app: string }) => app === "all" || appKey(row) === app;
    const { total } = usage;
    const installs: Series[] = [
      { key: "self", label: t("stats.series.selfHosted"), color: "var(--series-1)", values: fold(points, total("installs", "self_hosted"), "last") },
      { key: "hosted", label: t("stats.series.hosted"), color: "var(--series-2)", values: fold(points, total("installs", "hosted"), "last") },
    ];
    const allAccounts = fold(points, total("accounts"), "last");
    const agents = fold(points, total("agents"), "last");
    const accounts: Series[] = usage.agents
      ? [
          {
            key: "users",
            label: t("stats.series.users"),
            color: "var(--series-3)",
            values: allAccounts.map((n, i) => (n === null ? null : Math.max(0, n - (agents[i] ?? 0)))),
          },
          { key: "agents", label: t("stats.series.agents"), color: "var(--series-4)", values: agents },
        ]
      : [{ key: "all", label: t("stats.series.accounts"), color: "var(--series-3)", values: allAccounts }];
    const active: Series[] = [
      { key: "month", label: t("stats.series.activeMonth"), color: "var(--series-1)", values: fold(points, total("accounts_active_30d"), "last") },
      { key: "day", label: t("stats.series.activeDay"), color: "var(--series-2)", values: fold(points, total("accounts_active_1d"), "last") },
    ];
    const servers: Series[] = [
      { key: "self", label: t("stats.series.selfHosted"), color: "var(--series-1)", values: fold(points, total("servers", "self_hosted"), "last") },
      { key: "hosted", label: t("stats.series.hosted"), color: "var(--series-2)", values: fold(points, total("servers", "hosted"), "last") },
    ];
    const messages: Series[] = [{ key: "sent", label: t("stats.series.messagesSent"), color: "var(--series-1)", values: fold(points, total("messages_sent"), "sum") }];
    const storage: Series[] = [{ key: "storage", label: t("stats.series.storage"), color: "var(--series-1)", values: fold(points, total("storage_bytes"), "last") }];

    // Failures per app, each app in its own color.
    const errorRows = insights.errors.filter(shows);
    const errorApps = APPS.filter((a) => errorRows.some((r) => appKey(r) === a.key));
    const errors: Series[] = errorApps.map((a) => ({
      key: a.key,
      label: t(a.label),
      color: APP_COLOR[a.key]!,
      values: fold(points, (day) => errorRows.filter((r) => r.day === day && appKey(r) === a.key).reduce((n, r) => n + r.count, 0), "sum"),
    }));

    // The four busiest timed things, by their p95.
    const timingRows = insights.timings.filter(shows);
    const busiest = [...new Set(timingRows.map((r) => `${appKey(r)}|${r.metric}`))]
      .map((key) => ({ key, count: timingRows.filter((r) => `${appKey(r)}|${r.metric}` === key).reduce((n, r) => n + r.count, 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const slow: Series[] = busiest.map(({ key }, i) => {
      const [which, metric] = key.split("|") as [string, string];
      return {
        key,
        label: app === "all" ? t("stats.series.slowLabel", { metric, app: appLabel(which, t) }) : metric,
        color: SERIES[i]!,
        values: fold(points, (day) => timingRows.find((r) => r.day === day && `${appKey(r)}|${r.metric}` === key)?.p95_ms ?? null, "mean"),
      };
    });

    const featureKeys = [...new Set(insights.features.filter(shows).map((r) => `${appKey(r)}|${r.feature}`))];
    const features = featureKeys
      .map((key) => {
        const rows = insights.features.filter((r) => `${appKey(r)}|${r.feature}` === key);
        const values = fold(points, (day) => rows.filter((r) => r.day === day).reduce((n, r) => n + r.count, 0), "sum");
        return { key, app: key.split("|")[0]!, feature: key.split("|")[1]!, values, total: rows.reduce((n, r) => n + r.count, 0) };
      })
      .sort((a, b) => b.total - a.total);

    return { installs, accounts, active, servers, messages, storage, errors, slow, features };
  }, [insights, points, usage, app, t]);

  const sum = (values: ReadonlyArray<number | null>) => values.reduce<number>((a, b) => a + (b ?? 0), 0);
  const last = (values: ReadonlyArray<number | null>) => [...values].reverse().find((v) => v !== null) ?? null;
  const first = (values: ReadonlyArray<number | null>) => values.find((v) => v !== null) ?? null;
  /** Stacked series added up per point; null where none has a value. */
  const stacked = (series: readonly Series[]) => labels.map((_, i) => (series.some((s) => s.values[i] != null) ? series.reduce((n, s) => n + (s.values[i] ?? 0), 0) : null));
  /** The last point any of the series has a value at, so a total and its parts are from the same day. */
  const latestAt = (series: readonly Series[]) => stacked(series).findLastIndex((v) => v !== null);
  /** Each series' value at that point, for a legend. */
  const latest = (series: readonly Series[]) => {
    const at = latestAt(series);
    return series.map((s) => ({ ...s, value: s.values[at] == null ? "–" : compact(s.values[at]!) }));
  };
  const latestTotal = (series: readonly Series[]) => {
    const at = latestAt(series);
    return at < 0 ? undefined : compact(stacked(series)[at]!);
  };
  const installsTotal = stacked(charts.installs);
  const change = (values: ReadonlyArray<number | null>) => {
    const a = first(values);
    const b = last(values);
    if (a === null || b === null) return null;
    const d = b - a;
    return t("stats.change", { change: `${d >= 0 ? "+" : "−"}${compact(Math.abs(d))}`, date: shortDay(labels[values.findIndex((v) => v !== null)]!) });
  };
  const lastRange = days === 365 ? t("stats.tile.lastYear") : t("stats.tile.lastDays", { count: days });
  const errorTotal = charts.errors.reduce((n, s) => n + sum(s.values), 0);
  const errorDaily = labels.map((_, i) => charts.errors.reduce((n, s) => n + (s.values[i] ?? 0), 0));

  const problems = insights.problems.errors.filter((row) => app === "all" || appKey(row) === app).slice(0, 15);

  return (
    <div className="flex flex-col gap-10">
      <section className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("stats.tile.installs")} value={last(installsTotal)} note={change(installsTotal)} values={installsTotal} parts={latest(charts.installs)} />
        <Tile label={t("stats.tile.activeAccounts")} value={last(charts.active[0]!.values)} note={change(charts.active[0]!.values)} values={charts.active[0]!.values} />
        <Tile label={t("stats.tile.messages")} value={sum(charts.messages[0]!.values)} note={lastRange} values={charts.messages[0]!.values} />
        <Tile
          label={app === "all" ? t("stats.tile.problems") : t("stats.tile.problemsIn", { app: appLabel(app, t) })}
          value={errorTotal}
          note={lastRange}
          values={errorDaily}
          color="var(--series-2)"
          parts={app === "all" ? charts.errors.map((s) => ({ ...s, value: compact(sum(s.values)) })) : undefined}
        />
      </section>

      <Section title={t("stats.fuwa.title")} blurb={t("stats.fuwa.blurb")}>
        {usage.any ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t("stats.fuwa.installs")} value={latestTotal(charts.installs)} note={t("stats.fuwa.installsNote")} legend={latest(charts.installs)}>
              <BarChart labels={labels} series={charts.installs} format={compact} weekly={weekly} label={t("stats.fuwa.installsChart")} />
            </ChartCard>
            <ChartCard title={t("stats.fuwa.servers")} value={latestTotal(charts.servers)} note={t("stats.fuwa.serversNote")} legend={latest(charts.servers)}>
              <BarChart labels={labels} series={charts.servers} format={compact} weekly={weekly} label={t("stats.fuwa.serversChart")} />
            </ChartCard>
            <ChartCard
              title={t("stats.fuwa.accounts")}
              value={latestTotal(charts.accounts)}
              note={usage.agents ? t("stats.fuwa.accountsNote") : t("stats.fuwa.accountsNoAgents")}
              legend={latest(charts.accounts)}
            >
              <BarChart labels={labels} series={charts.accounts} format={compact} weekly={weekly} label={t("stats.fuwa.accountsChart")} />
            </ChartCard>
            <ChartCard title={t("stats.fuwa.active")} note={t("stats.fuwa.activeNote")} legend={latest(charts.active)}>
              <LineChart labels={labels} series={charts.active} format={compact} weekly={weekly} label={t("stats.fuwa.activeChart")} />
            </ChartCard>
            <ChartCard title={weekly ? t("stats.fuwa.messagesWeek") : t("stats.fuwa.messagesDay")}>
              <BarChart labels={labels} series={charts.messages} format={compact} weekly={weekly} label={t("stats.fuwa.messagesChart")} />
            </ChartCard>
            <ChartCard title={t("stats.fuwa.storage")} note={t("stats.fuwa.storageNote")}>
              <LineChart labels={labels} series={charts.storage} format={bytes} weekly={weekly} label={t("stats.fuwa.storageChart")} />
            </ChartCard>
          </div>
        ) : (
          <Empty>{t("stats.fuwa.empty")}</Empty>
        )}
      </Section>

      <Section title={t("stats.versions.title")} blurb={t("stats.versions.blurb")}>
        <Versions insights={insights} app={app} />
      </Section>

      <Section title={t("stats.health.title")} blurb={t("stats.health.blurb")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={weekly ? t("stats.health.problemsWeek") : t("stats.health.problemsDay")} note={t("stats.health.problemsNote")} legend={charts.errors}>
            {charts.errors.length ? (
              <BarChart labels={labels} series={charts.errors} format={compact} weekly={weekly} label={t("stats.health.problemsChart")} />
            ) : (
              <Empty>{t("stats.health.noProblems")}</Empty>
            )}
          </ChartCard>
          <ChartCard title={t("stats.health.slow")} note={weekly ? t("stats.health.slowNoteWeekly") : t("stats.health.slowNote")} legend={charts.slow}>
            {charts.slow.length ? (
              <LineChart labels={labels} series={charts.slow} format={ms} weekly={weekly} label={t("stats.health.slowChart")} />
            ) : (
              <Empty>{t("stats.health.noTimings")}</Empty>
            )}
          </ChartCard>
        </div>
        <Problems problems={problems} />
      </Section>

      <Section title={t("stats.features.title")} blurb={t("stats.features.blurb")}>
        {charts.features.length ? (
          <Card className="gap-0 divide-y py-0">
            {charts.features.map((f) => (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-4 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem_6rem] sm:px-6">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold">{f.feature}</p>
                  <p className="text-xs text-muted-foreground">{appLabel(f.app, t)}</p>
                </div>
                <Sparkline values={f.values} color={APP_COLOR[f.app]} className="max-sm:hidden" />
                <p className="text-right font-bold tabular-nums">{compact(f.total)}</p>
              </div>
            ))}
          </Card>
        ) : (
          <Empty>{t("stats.features.empty")}</Empty>
        )}
      </Section>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function ChartCard({
  title,
  value,
  note,
  legend,
  children,
}: {
  title: string;
  /** The latest total, beside the title. */
  value?: string;
  note?: string;
  legend?: ComponentProps<typeof Legend>["series"];
  children: ReactNode;
}) {
  return (
    <Card className="rise min-w-0 gap-3 px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="font-bold">
            {title}
            {value !== undefined && <span className="ml-2 tabular-nums text-muted-foreground">{value}</span>}
          </h3>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {legend && <Legend series={legend} />}
      </div>
      {children}
    </Card>
  );
}

function Tile({
  label,
  value,
  note,
  values,
  color,
  parts,
}: {
  label: string;
  value: number | null;
  note: string | null;
  values: ReadonlyArray<number | null>;
  color?: string;
  /** What the value is made of, each with its color. */
  parts?: ReadonlyArray<{ key: string; label: string; color: string; value: string }>;
}) {
  const { t } = useI18n();
  const { compact } = useFormats();
  return (
    <Card className="card-pop min-w-0 gap-2 px-4 py-4">
      <p className="truncate text-xs font-bold text-muted-foreground">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums">{value === null ? "–" : compact(value)}</p>
      {parts && parts.length > 1 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              <b className="text-foreground tabular-nums">{p.value}</b> {p.label}
            </li>
          ))}
        </ul>
      )}
      <Sparkline values={values} color={color} />
      <p className="truncate text-xs text-muted-foreground">{note ?? t("stats.tile.nothingYet")}</p>
    </Card>
  );
}

/** The versions each app runs: fuwa servers from their usage signal, the other apps from the reports they're in. */
function Versions({ insights, app }: { insights: Insights; app: string }) {
  const { t } = useI18n();
  const { compact } = useFormats();
  const groups = useMemo(() => {
    const byApp = new Map<string, Map<string, { installs: number; hosted: number }>>();
    const add = (key: string, version: string, installs: number, hosted: number) => {
      const versions = byApp.get(key) ?? new Map();
      const held = versions.get(version) ?? { installs: 0, hosted: 0 };
      versions.set(version, { installs: held.installs + installs, hosted: held.hosted + hosted });
      byApp.set(key, versions);
    };
    for (const v of insights.usage.versions) add("fuwa:server", v.version, v.installs, v.hosting === "hosted" ? v.installs : 0);
    // A fuwa server's own reports only count when no signal says what it runs.
    const signals = byApp.has("fuwa:server");
    for (const v of insights.versions) if (!(signals && appKey(v) === "fuwa:server")) add(appKey(v), v.version, v.installs, 0);
    const known: string[] = APPS.map((a) => a.key);
    return [...byApp]
      .filter(([key]) => app === "all" || key === app)
      .sort(([a], [b]) => (known.indexOf(a) + 1 || known.length + 1) - (known.indexOf(b) + 1 || known.length + 1))
      .map(([key, versions]) => ({ key, rows: [...versions].sort((a, b) => b[1].installs - a[1].installs).slice(0, 6) }));
  }, [insights, app]);

  return (
    <Card className="rise min-w-0 gap-4 px-4 py-5 sm:px-5">
      <p className="text-xs text-muted-foreground">{t("stats.versions.note")}</p>
      {groups.length ? (
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {groups.map(({ key, rows }) => {
            const max = Math.max(1, ...rows.map(([, n]) => n.installs));
            const color = APP_COLOR[key] ?? "var(--series-1)";
            return (
              <div key={key} className="flex min-w-0 flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <span className="size-2.5 rounded-full" style={{ background: color }} />
                  {appLabel(key, t)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {rows.map(([version, n], i) => (
                    <li key={version} className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="font-mono font-bold">{version}</span>
                        {n.hosted > 0 && (
                          <span className="rounded-full border px-1.5 text-[10px] font-bold text-muted-foreground" title={t("stats.versions.hostedTitle")}>
                            {t("stats.series.hosted")}
                          </span>
                        )}
                      </span>
                      <span className="h-3 overflow-hidden rounded-r-[4px]">
                        <span
                          className="viz-hbar block h-full rounded-r-[4px]"
                          style={{ width: `${(n.installs / max) * 100}%`, background: color, ["--i" as string]: i * 8 }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{compact(n.installs)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>{t("stats.versions.empty")}</Empty>
      )}
    </Card>
  );
}

function Problems({ problems }: { problems: Insights["problems"]["errors"] }) {
  const { t } = useI18n();
  const { compact, shortDay } = useFormats();
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-baseline justify-between gap-4 border-b px-4 py-4 sm:px-6">
        <h3 className="font-bold">{t("stats.problems.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("stats.problems.note")}</p>
      </div>
      {problems.length ? (
        <div className="divide-y">
          {problems.map((p) => (
            <div key={`${p.source}|${p.app}|${p.version}|${p.kind}|${p.place}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {p.kind}{" "}
                  <span className="font-normal text-muted-foreground">{t("stats.problems.where", { app: appLabel(`${p.source}:${p.app}`, t), version: p.version })}</span>
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={p.place}>
                  {p.place}
                </p>
              </div>
              <p className="flex shrink-0 gap-4 text-xs text-muted-foreground sm:text-right">
                <span>
                  <T k="stats.problems.times" values={{ count: p.count, number: <b className="text-sm text-foreground tabular-nums">{compact(p.count)}</b> }} />
                </span>
                <span>
                  <T k="stats.problems.installs" values={{ count: p.installs, number: <b className="text-sm text-foreground tabular-nums">{compact(p.installs)}</b> }} />
                </span>
                <span>{t("stats.problems.last", { date: shortDay(p.last_seen.slice(0, 10)) })}</span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <Empty>{t("stats.problems.empty")}</Empty>
      )}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="grid min-h-32 place-items-center px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
