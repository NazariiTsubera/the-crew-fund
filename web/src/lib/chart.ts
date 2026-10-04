import type { CurvePoint } from "@/lib/api";
import { monthEnds } from "@/lib/curve";
import { formatPct } from "@/lib/format";

/** One month of the War Room chart: the fund's and the S&P 500's month-end equity. */
export type ChartPoint = { month: string; fund: number; spx: number | null };

/** Month-end fund values with the benchmark's value for the same month, if it has one. */
export function alignSeries(curve: CurvePoint[], benchmark: CurvePoint[]): ChartPoint[] {
  const spx = new Map(monthEnds(benchmark).map((p) => [p.month, p.value]));
  return monthEnds(curve).map((p) => ({ month: p.month, fund: p.value, spx: spx.get(p.month) ?? null }));
}

const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const MAX_TICKS = 6;

/**
 * Gridline levels in equity terms (1 = the start), at round returns: the smallest step from
 * TICK_STEPS that keeps the count readable. 1 is always a candidate so "0%" anchors the axis.
 */
export function equityTicks(lo: number, hi: number): number[] {
  for (const step of TICK_STEPS) {
    const first = Math.ceil((lo - 1) / step - 1e-9);
    const last = Math.floor((hi - 1) / step + 1e-9);
    if (last - first + 1 <= MAX_TICKS) {
      const ticks: number[] = [];
      for (let k = first; k <= last; k++) {
        const v = Math.round((1 + k * step) * 1e6) / 1e6;
        if (v > 0) ticks.push(v);
      }
      return ticks;
    }
  }
  return [1];
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

// A holdout further out than this would squash the curve into the left of the plot for an
// empty stretch, so the marker is dropped instead.
const MAX_HOLDOUT_GAP = 3;

export type ChartOptions = {
  log: boolean;
  /** The first sealed date; the marker sits at the month that contains it. */
  holdoutCutoff: string;
  ddMonth: string | null;
  width?: number;
  height?: number;
};

export type ChartModel = {
  /** Number of month slots on the x axis; one more than the data when the holdout starts after it. */
  slots: number;
  x: (index: number) => number;
  y: (value: number) => number;
  fundPath: string;
  spxPath: string;
  yTicks: { value: number; y: number; label: string }[];
  years: { label: string; x: number }[];
  holdoutX: number | null;
  dd: { index: number; x: number; y: number } | null;
};

const r1 = (v: number) => v.toFixed(1);

/** Scales and paths for the fund-vs-S&P chart, in a width × height viewBox. */
export function chartModel(points: ChartPoint[], opts: ChartOptions): ChartModel {
  const { log, holdoutCutoff, ddMonth, width = 1000, height = 300 } = opts;
  const n = points.length;
  const first = n ? monthIndex(points[0].month) : 0;
  const holdoutIdx = n ? monthIndex(holdoutCutoff.slice(0, 7)) - first : -1;
  const holdout = holdoutIdx >= 0 && holdoutIdx <= n - 1 + MAX_HOLDOUT_GAP ? holdoutIdx : null;
  const span = Math.max(1, n - 1, holdout ?? 0);
  const x = (i: number) => (i / span) * width;

  const f = (v: number) => (log ? Math.log(Math.max(v, 1e-9)) : v);
  const values = points.flatMap((p) => (p.spx === null ? [p.fund] : [p.fund, p.spx]));
  const min = values.length ? Math.min(...values) : 1;
  const max = values.length ? Math.max(...values) : 1;
  const loV = min * 0.95;
  const hiV = max * 1.04;
  const lo = f(loV);
  const hi = f(hiV);
  const y = (v: number) => height - ((f(v) - lo) / (hi - lo || 1)) * height;

  const fundPath = points.map((p, i) => `${i ? "L" : "M"}${r1(x(i))} ${r1(y(p.fund))}`).join(" ");
  let pen = false;
  const spxParts: string[] = [];
  points.forEach((p, i) => {
    if (p.spx === null) {
      pen = false;
      return;
    }
    spxParts.push(`${pen ? "L" : "M"}${r1(x(i))} ${r1(y(p.spx))}`);
    pen = true;
  });

  const yTicks = equityTicks(loV, hiV).map((value) => ({
    value,
    y: y(value),
    label: value === 1 ? "0%" : formatPct(value - 1, 0),
  }));

  const years = points.flatMap((p, i) => (i > 0 && p.month.endsWith("-01") ? [{ label: p.month.slice(0, 4), x: x(i) }] : []));

  const ddIndex = ddMonth ? points.findIndex((p) => p.month === ddMonth.slice(0, 7)) : -1;
  const dd = ddIndex >= 0 ? { index: ddIndex, x: x(ddIndex), y: y(points[ddIndex].fund) } : null;

  return {
    slots: span + 1,
    x,
    y,
    fundPath,
    spxPath: spxParts.join(" "),
    yTicks,
    years,
    holdoutX: holdout === null ? null : x(holdout),
    dd,
  };
}

/** The month under a pointer at `fraction` across an axis of `slots` months, `count` of them with data. */
export function indexAtFraction(fraction: number, slots: number, count: number): number {
  const i = Math.round(fraction * Math.max(0, slots - 1));
  return Math.min(Math.max(i, 0), Math.max(0, count - 1));
}

const tidy = (v: number) => String(Number(v.toFixed(1)));

/**
 * A sparkline path on a log scale, so a steady compounder reads as a straight line. `slots` is
 * the fund's month count: an agent that stopped trading early ends short of the right edge.
 */
export function sparkPath(values: number[], box: { width: number; height: number; slots: number }): string {
  const { width, height, slots } = box;
  if (!values.length) return "";
  const mid = height / 2;
  if (values.length === 1) return `M0 ${tidy(mid)} L${tidy(width)} ${tidy(mid)}`;
  const logs = values.map((v) => Math.log(Math.max(v, 1e-9)));
  const mn = Math.min(...logs);
  const mx = Math.max(...logs);
  const step = width / Math.max(1, Math.max(slots, values.length) - 1);
  return logs
    .map((l, i) => {
      const yy = mx === mn ? mid : height - 1 - ((l - mn) / (mx - mn)) * (height - 2);
      return `${i ? "L" : "M"}${tidy(i * step)} ${tidy(yy)}`;
    })
    .join(" ");
}

/**
 * An agent's month-end equity scaled to its share of the fund: 1 + share × its return, i.e. the
 * part of the fund's growth it carried. Empty for an agent with no share (fired).
 */
export function contributionValues(spark: number[], share: number): number[] {
  if (share <= 0 || !spark.length) return [];
  const base = spark[0] || 1;
  return spark.map((v) => 1 + share * (v / base - 1));
}

/** A path for `values` (month-end, from the fund's first month) on the fund chart's axes. */
export function contributionPath(m: ChartModel, values: number[]): string {
  return values.map((v, i) => `${i ? "L" : "M"}${r1(m.x(i))} ${r1(m.y(v))}`).join(" ");
}
