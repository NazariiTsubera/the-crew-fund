import type { LogEntry } from "@/lib/api";

/** The design's feed tags. The engine writes trades as "Bought …"/"Sold …" and firings as "Fired …". */
export type LogTag = "BUY" | "SELL" | "TRADE" | "RISK" | "MM" | "FIRE" | "RED";

export function logTag(entry: LogEntry): LogTag {
  switch (entry.type) {
    case "trade":
      if (entry.text.startsWith("Sold")) return "SELL";
      if (entry.text.startsWith("Bought")) return "BUY";
      return "TRADE";
    case "risk":
      return "RISK";
    case "mastermind":
      return entry.text.startsWith("Fired") ? "FIRE" : "MM";
    case "redteam":
      return "RED";
  }
}

/** "2026-08" plus n months, n may be negative. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function newestFirst(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => b.ts.localeCompare(a.ts));
}

/** The twelve months ending with `endMonth` (inclusive), newest first. */
export function lastTwelveMonths(entries: LogEntry[], endMonth: string): LogEntry[] {
  const start = addMonths(endMonth, -11);
  return newestFirst(
    entries.filter((e) => {
      const month = e.ts.slice(0, 7);
      return month >= start && month <= endMonth;
    }),
  );
}

export function entriesInMonth(entries: LogEntry[], month: string): LogEntry[] {
  return newestFirst(entries.filter((e) => e.ts.startsWith(month)));
}
