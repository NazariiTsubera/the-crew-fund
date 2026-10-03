import type { Holding } from "@/lib/api";

/** Largest position first; ties in ticker order so the table never reshuffles. */
export function sortHoldings<T extends Pick<Holding, "ticker" | "weight">>(holdings: readonly T[]): T[] {
  return [...holdings].sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
}

/** The footer line's figures, and the largest weight that scales the bars. */
export function bookSummary(holdings: readonly Pick<Holding, "weight">[]): {
  count: number;
  total: number;
  maxWeight: number;
} {
  return {
    count: holdings.length,
    total: holdings.reduce((sum, h) => sum + h.weight, 0),
    maxWeight: holdings.reduce((max, h) => Math.max(max, h.weight), 0),
  };
}
