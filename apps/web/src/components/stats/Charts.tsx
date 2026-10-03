/**
 * The stats page's charts, drawn as SVG here rather than with a chart library:
 * one y axis each, thin marks, a recessive grid, a crosshair with a tooltip,
 * and a legend whenever there's more than one series. Lines draw in and bars
 * grow up with transforms only; reduced motion skips both (app.css).
 */
import { useId, useMemo, useState, type PointerEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import { niceTicks, shortDay } from "@/lib/viz";

export type Series = {
  key: string;
  label: string;
  /** A --series-N variable. */
  color: string;
  /** One value per label; null where there's nothing to show. */
  values: ReadonlyArray<number | null>;
};

type ChartProps = {
  /** The x axis: one UTC day (or week start) per point. */
  labels: readonly string[];
  series: readonly Series[];
  format: (n: number) => string;
  height?: number;
  /** "Week of" in the tooltip when points are weeks. */
  weekly?: boolean;
  label: string;
};

const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

/** Where things go: x per point, y per value. */
function useScales(width: number, height: number, labels: readonly string[], max: number) {
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const inner = { w: Math.max(0, width - PAD.left - PAD.right), h: height - PAD.top - PAD.bottom };
  const step = labels.length > 1 ? inner.w / (labels.length - 1) : 0;
  const x = (i: number) => PAD.left + (labels.length > 1 ? i * step : inner.w / 2);
  const y = (v: number) => PAD.top + inner.h - (top > 0 ? (v / top) * inner.h : 0);
  return { ticks, x, y, inner };
}

/** About five dates along the bottom, never crowded. */
function xTicks(labels: readonly string[], width: number) {
  const room = Math.max(2, Math.floor(width / 90));
  const every = Math.max(1, Math.ceil(labels.length / room));
  return labels.map((l, i) => ({ l, i })).filter(({ i }) => (labels.length - 1 - i) % every === 0);
}

function Axes({ ticks, x, y, labels, width, format }: { ticks: number[]; x: (i: number) => number; y: (v: number) => number; labels: readonly string[]; width: number; format: (n: number) => string }) {
  return (
    <g aria-hidden className="text-[10px]" fill="var(--muted-foreground)">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border)" : "var(--grid)"} strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {xTicks(labels, width).map(({ l, i }) => (
        <text key={l} x={x(i)} y={y(0) + 16} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}>
          {shortDay(l)}
        </text>
      ))}
    </g>
  );
}

/** The tooltip for the point under the pointer: its day, and each series' value with its color. */
function Tip({ left, width, title, rows }: { left: number | null; width: number; title: string; rows: Array<{ label: string; color: string; value: string }> }) {
  const flip = left !== null && left > width / 2;
  return (
    <div
      className={cn(
        "viz-tip pointer-events-none absolute top-0 z-20 min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg",
        left === null ? "opacity-0" : "opacity-100",
      )}
      style={{ left: left ?? 0, translate: flip ? "calc(-100% - 12px) 0" : "12px 0" }}
    >
      <p className="mb-1 font-bold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-bold tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Which point the pointer is nearest. */
function usePointer(labels: readonly string[], x: (i: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    let best = 0;
    for (let i = 1; i < labels.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setIndex(best);
  };
  return { index, onPointer, clear: () => setIndex(null) };
}

const tipTitle = (label: string, weekly?: boolean) => (weekly ? `Week of ${shortDay(label)}` : shortDay(label));

export function LineChart({ labels, series, format, height = 200, weekly, label }: ChartProps) {
  const id = useId();
  const max = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const [ref, { width }] = useMeasure();
  const { ticks, x, y } = useScales(width, height, labels, max);
  const { index, onPointer, clear } = usePointer(labels, x);

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = "";
        let pen = false;
        s.values.forEach((v, i) => {
          if (v === null) return void (pen = false);
          d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
        });
        return { ...s, d };
      }),
    [series, x, y],
  );

  return (
    <figure ref={ref} className="relative m-0 w-full" style={{ height }} aria-label={label}>
      {width > 0 && (
        <svg width={width} height={height} className="touch-pan-y overflow-visible" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={clear}>
          <Axes ticks={ticks} x={x} y={y} labels={labels} width={width} format={format} />
          <clipPath id={`${id}-clip`}>
            <rect className="viz-reveal" x={PAD.left - 4} y={0} width={width - PAD.left - PAD.right + 8} height={height} />
          </clipPath>
          <g clipPath={`url(#${id}-clip)`}>
            {paths.map((p) => (
              <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* A lone point (one day of data) still shows. */}
            {paths.map((p) =>
              p.values.map((v, i) =>
                v !== null && p.values[i - 1] == null && p.values[i + 1] == null ? <circle key={`${p.key}${i}`} cx={x(i)} cy={y(v)} r={3} fill={p.color} /> : null,
              ),
            )}
          </g>
          {index !== null && (
            <g aria-hidden>
              <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
              {series.map((s) =>
                s.values[index] == null ? null : <circle key={s.key} cx={x(index)} cy={y(s.values[index]!)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />,
              )}
            </g>
          )}
        </svg>
      )}
      <Tip
        left={index === null ? null : x(index)}
        width={width}
        title={index === null ? "" : tipTitle(labels[index]!, weekly)}
        rows={index === null ? [] : series.map((s) => ({ label: s.label, color: s.color, value: s.values[index] == null ? "–" : format(s.values[index]!) }))}
      />
    </figure>
  );
}

/** Bars, stacked when there's more than one series. */
export function BarChart({ labels, series, format, height = 200, weekly, label }: ChartProps) {
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(0, ...totals);
  const [ref, { width }] = useMeasure();
  const inner = Math.max(0, width - PAD.left - PAD.right);
  const slot = labels.length ? inner / labels.length : 0;
  // Bars sit in slots; the axis labels and crosshair use slot middles.
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  const { ticks, y } = useScales(width, height, labels, max);
  const { index, onPointer, clear } = usePointer(labels, x);
  const barWidth = Math.max(1, Math.min(28, slot - Math.min(4, slot * 0.3)));
  const radius = Math.min(4, barWidth / 2);

  return (
    <figure ref={ref} className="relative m-0 w-full" style={{ height }} aria-label={label}>
      {width > 0 && (
        <svg width={width} height={height} className="touch-pan-y overflow-visible" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={clear}>
          <Axes ticks={ticks} x={x} y={y} labels={labels} width={width} format={format} />
          {labels.map((day, i) => {
            let base = 0;
            const segments = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter(({ v }) => v > 0)
              .map(({ s, v }, n, all) => {
                const from = base;
                base += v;
                // A 2px gap below every segment but the first, in the card's color.
                const bottom = y(from) - (n === 0 ? 0 : 2);
                const h = Math.max(1, bottom - y(from + v));
                const left = x(i) - barWidth / 2;
                // Only the top of the bar is rounded.
                const r = n === all.length - 1 ? Math.min(radius, h) : 0;
                const d = `M${left},${bottom}V${bottom - h + r}q0,-${r} ${r},-${r}h${barWidth - 2 * r}q${r},0 ${r},${r}V${bottom}Z`;
                return <path key={s.key} d={d} fill={s.color} opacity={index === null || index === i ? 1 : 0.55} />;
              });
            return (
              <g key={day} className="viz-bar" style={{ ["--i" as string]: i }}>
                {segments}
              </g>
            );
          })}
        </svg>
      )}
      <Tip
        left={index === null ? null : x(index)}
        width={width}
        title={index === null ? "" : tipTitle(labels[index]!, weekly)}
        rows={
          index === null
            ? []
            : [
                ...series.map((s) => ({ label: s.label, color: s.color, value: format(s.values[index] ?? 0) })),
                ...(series.length > 1 ? [{ label: "Total", color: "transparent", value: format(totals[index]!) }] : []),
              ]
        }
      />
    </figure>
  );
}

export function Legend({ series }: { series: ReadonlyArray<Pick<Series, "key" | "label" | "color">> }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color, height: 3 }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line with no axes, for tiles and table rows. */
export function Sparkline({ values, color = "var(--series-1)", className }: { values: ReadonlyArray<number | null>; color?: string; className?: string }) {
  const id = useId();
  const w = 100;
  const h = 28;
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...nums);
  const min = Math.min(0, ...nums);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) return void (pen = false);
    const px = values.length > 1 ? (i / (values.length - 1)) * w : w / 2;
    const py = h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
    d += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    pen = true;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-7 w-full overflow-visible", className)} aria-hidden>
      <clipPath id={`${id}-clip`}>
        <rect className="viz-reveal" x={-2} y={-2} width={w + 4} height={h + 4} />
      </clipPath>
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id}-clip)`} />
    </svg>
  );
}

