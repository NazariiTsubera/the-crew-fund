import type { CapitalMonth } from "@/lib/api";

const MINUS = "−";

/** A scrubber position kept inside a history of `length` months. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(Math.round(index), 0), length - 1);
}

export type ShareRow = {
  id: string;
  share: number;
  /** Change against the month before, in percentage points; null for the first month. */
  change: number | null;
};

/** Each agent's capital share in month `index`, and how far it moved since the month before. */
export function shareRows(months: CapitalMonth[], index: number, ids: string[]): ShareRow[] {
  if (!months.length) return [];
  const i = clampIndex(index, months.length);
  const cur = months[i].shares;
  const prev = i > 0 ? months[i - 1].shares : null;
  return ids.map((id) => {
    const share = cur[id] ?? 0;
    return { id, share, change: prev ? (share - (prev[id] ?? 0)) * 100 : null };
  });
}

/** "▲ +2.0pt", "▼ −1.3pt" or "— flat": the arrow and sign carry the direction, not colour. */
export function formatChange(change: number | null): string {
  if (change === null) return "—";
  if (Math.abs(change) < 0.05) return "— flat";
  return `${change > 0 ? "▲ +" : `▼ ${MINUS}`}${Math.abs(change).toFixed(1)}pt`;
}

/** Where a replay of the last `span` months begins. */
export function replayStart(length: number, span = 24): number {
  return Math.max(0, length - span);
}
