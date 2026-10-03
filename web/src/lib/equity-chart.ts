import type { CurvePoint } from "@/lib/api";

const DAY_MS = 86_400_000;

function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;
}

function isoOfDay(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// Candidate gridlines in growth-of-$1 terms; only those inside the plotted range are kept.
const TICKS = [0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export type ChartMonth = {
  month: string;
  date: string;
  x: number;
  y: number;
  value: number;
  /** The benchmark on that date, when it has a point by then. */
  bench: number | null;
};

export type EquityChart = {
  width: number;
  height: number;
  x: (date: string) => number;
  y: (value: number) => number;
  mainPath: string;
  benchPath: string;
  yTicks: { value: number; y: number }[];
  years: { label: string; x: number }[];
  months: ChartMonth[];
  /** Where the sealed holdout window starts, when a cutoff was given. */
  holdout: { x: number; date: string } | null;
};

type Options = {
  width: number;
  height: number;
  /** The first sealed date; the axis runs `holdoutDays` past it so the window shows. */
  holdoutCutoff?: string | null;
  holdoutDays?: number;
};

function sorted(series: CurvePoint[]): CurvePoint[] {
  return [...series].sort((a, b) => a.date.localeCompare(b.date));
}

/** The value of the latest point on or before `date`, or null. Assumes date-sorted input. */
function valueAt(series: CurvePoint[], date: string): number | null {
  let found: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    found = p.value;
  }
  return found;
}

/**
 * Scales an agent's equity curve and its benchmark into a width × height box on a log axis, so
 * equal percentage moves look equal across nine years.
 */
export function equityChart(mainIn: CurvePoint[], benchIn: CurvePoint[], opts: Options): EquityChart {
  const { width, height } = opts;
  const main = sorted(mainIn);
  const bench = sorted(benchIn);
  const all = [...main, ...bench];

  const days = all.map((p) => day(p.date));
  let d0 = days.length ? Math.min(...days) : 0;
  let d1 = days.length ? Math.max(...days) : 1;
  const cutoff = opts.holdoutCutoff ? day(opts.holdoutCutoff) : null;
  if (cutoff !== null) d1 = Math.max(d1, cutoff + (opts.holdoutDays ?? 30));
  if (d1 === d0) {
    d0 -= 1;
    d1 += 1;
  }

  const values = all.map((p) => p.value).filter((v) => v > 0);
  const lo = Math.log((values.length ? Math.min(...values) : 1) * 0.95);
  const hi = Math.log((values.length ? Math.max(...values) : 1) * 1.04);

  const xDay = (d: number) => ((d - d0) / (d1 - d0)) * width;
  const x = (date: string) => xDay(day(date));
  const y = (value: number) => height - ((Math.log(Math.max(value, 1e-9)) - lo) / (hi - lo)) * height;

  const path = (series: CurvePoint[]) =>
    series.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");

  const yTicks = TICKS.map((value) => ({ value, y: y(value) })).filter((t) => t.y > 0 && t.y < height);

  const years: EquityChart["years"] = [];
  const firstYear = Number(isoOfDay(d0).slice(0, 4));
  const lastYear = Number(isoOfDay(d1).slice(0, 4));
  for (let yr = firstYear; yr <= lastYear; yr++) {
    const d = day(`${yr}-01-01`);
    if (d > d0 && d <= d1) years.push({ label: String(yr), x: xDay(d) });
  }

  const ends = new Map<string, CurvePoint>();
  for (const p of main) ends.set(p.date.slice(0, 7), p);
  const months = [...ends].map(([month, p]) => ({
    month,
    date: p.date,
    x: x(p.date),
    y: y(p.value),
    value: p.value,
    bench: valueAt(bench, p.date),
  }));

  return {
    width,
    height,
    x,
    y,
    mainPath: path(main),
    benchPath: path(bench),
    yTicks,
    years,
    months,
    holdout: cutoff !== null && opts.holdoutCutoff ? { x: xDay(cutoff), date: opts.holdoutCutoff } : null,
  };
}

/** The month whose point sits closest to x (in chart units), for click and hover. */
export function nearestMonth(months: ChartMonth[], x: number): ChartMonth | null {
  let best: ChartMonth | null = null;
  for (const m of months) if (!best || Math.abs(m.x - x) < Math.abs(best.x - x)) best = m;
  return best;
}

/** The benchmark's return from its base to `date`, e.g. the S&P over the agent's life. */
export function benchmarkReturnAt(benchIn: CurvePoint[], date: string): number | null {
  const bench = sorted(benchIn);
  if (!bench.length || bench[0].value === 0) return null;
  const v = valueAt(bench, date);
  return v === null ? null : v / bench[0].value - 1;
}
