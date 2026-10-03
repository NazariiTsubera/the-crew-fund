import type { LogEntry } from "@/lib/api";
import type { LoadError } from "@/lib/load-error";

// The Live floor replays stored log entries; it never invents intraday trades. Everything the
// tape shows is a row of GET /log, revealed one at a time from the oldest in the window.

/** GET /log's ceiling: the floor loads the newest 500 entries and replays them. */
export const TAPE_LIMIT = 500;

export type TapeSpeed = 1 | 4;
export const TAPE_SPEEDS: readonly TapeSpeed[] = [1, 4];

const BASE_STEP_MS = 1200;

/** Milliseconds between two revealed rows at a given speed. */
export function stepMs(speed: TapeSpeed): number {
  return BASE_STEP_MS / speed;
}

/** The window oldest first. GET /log is newest first, ties included, so ties reverse with it. */
export function replayOrder(entries: LogEntry[]): LogEntry[] {
  return [...entries].reverse().sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * The cursor after one tick: just past the next entry the filter shows. When no shown entry
 * remains, the tape is over and the cursor sits at the end, so `cursor >= length` means ended.
 */
export function nextCursor(ordered: LogEntry[], cursor: number, show: (e: LogEntry) => boolean): number {
  let i = cursor;
  while (i < ordered.length && !show(ordered[i])) i++;
  if (i >= ordered.length) return ordered.length;
  const after = i + 1;
  return ordered.slice(after).some(show) ? after : ordered.length;
}

/** The replayed entries the filter shows, newest on top like a tape. */
export function visibleRows(ordered: LogEntry[], cursor: number, show: (e: LogEntry) => boolean): LogEntry[] {
  return ordered.slice(0, cursor).filter(show).reverse();
}

/** "2024-11-28 16:00 → 2026-08-28 16:05": the window being replayed. */
export function tapePeriod(ordered: LogEntry[]): string {
  if (ordered.length === 0) return "";
  return `${ordered[0].ts} → ${ordered[ordered.length - 1].ts}`;
}

export function tapeCount(replayed: number, total: number): string {
  return `${replayed} of ${total}`;
}

export function endOfTape(ordered: LogEntry[]): string {
  return `End of tape: ${ordered.at(-1)?.ts ?? ""}`;
}

export type TapeWho = { kind: "agent"; id: string; name: string } | { kind: "house"; name: string };

/** Who an entry belongs to: its agent, or the Mastermind / Red Team for fund-wide entries. */
export function tapeWho(entry: LogEntry, crew: ReadonlyMap<string, { name: string }>): TapeWho {
  if (entry.agent_id) {
    return { kind: "agent", id: entry.agent_id, name: crew.get(entry.agent_id)?.name ?? entry.agent_id };
  }
  if (entry.type === "mastermind") return { kind: "house", name: "Mastermind" };
  if (entry.type === "redteam") return { kind: "house", name: "Red Team" };
  return { kind: "house", name: "Fund" };
}

/** GET /log answers an empty list before the seed workflow has written anything. */
export const EMPTY_LOG: LoadError = {
  kind: "unseeded",
  title: "The fund has not been seeded yet",
  detail: "The API is up but the log is empty. Seed the crew, then reload this page.",
};
