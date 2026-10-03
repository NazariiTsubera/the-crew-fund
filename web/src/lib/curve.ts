import type { CurvePoint } from "@/lib/api";

/** The last value of each month, in date order. The API's curves are daily; the mocks monthly. */
export function monthEnds(curve: CurvePoint[]): { month: string; value: number }[] {
  const last = new Map<string, number>();
  for (const point of [...curve].sort((a, b) => a.date.localeCompare(b.date))) {
    last.set(point.date.slice(0, 7), point.value);
  }
  return [...last].map(([month, value]) => ({ month, value }));
}

/**
 * The latest month's return, from the previous month-end to the last point. The sidebar shows
 * this as the fund's most recent figure because the store has no intraday P&L to show instead.
 */
export function lastMonthReturn(curve: CurvePoint[]): { month: string; value: number } | null {
  const ends = monthEnds(curve);
  if (ends.length < 2) return null;
  const [prev, last] = ends.slice(-2);
  if (prev.value === 0) return null;
  return { month: last.month, value: last.value / prev.value - 1 };
}
