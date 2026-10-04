import type { Holding } from "@/lib/api";

// The Holdings chart: the fund's book month by month, as one band per agent whose height is the
// share of the book that agent's picks made up that month.

export type BookMonth = { month: string; holdings: Holding[] };
export type ShareMonth = { month: string; shares: Record<string, number> };

const r1 = (v: number) => v.toFixed(1);

export function agentShares(months: BookMonth[], ids: string[]): ShareMonth[] {
  return months.map(({ month, holdings }) => {
    const shares: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const h of holdings) if (h.agent_id && h.agent_id in shares) shares[h.agent_id] += h.weight;
    return { month, shares };
  });
}

/** One closed area path per agent, stacked bottom to top in `ids` order, in a width × height box. */
export function stackAreas(series: ShareMonth[], ids: string[], width: number, height: number) {
  const n = series.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * width : 0);
  const y = (v: number) => height - Math.min(Math.max(v, 0), 1) * height;
  const base = series.map(() => 0);
  return ids.map((id) => {
    const lo = [...base];
    const hi = series.map((m, i) => (base[i] += m.shares[id] ?? 0));
    const top = hi.map((v, i) => `${i ? "L" : "M"}${r1(x(i))} ${r1(y(v))}`);
    const bottom = lo.map((v, i) => `L${r1(x(i))} ${r1(y(v))}`).reverse();
    return { id, d: `${top.join(" ")} ${bottom.join(" ")} Z` };
  });
}
