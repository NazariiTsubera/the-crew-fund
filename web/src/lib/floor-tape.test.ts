import { describe, expect, it } from "vitest";

import type { LogEntry } from "@/lib/api";
import {
  EMPTY_LOG,
  endOfTape,
  nextCursor,
  replayOrder,
  stepMs,
  tapeCount,
  tapePeriod,
  tapeWho,
  visibleRows,
} from "@/lib/floor-tape";

const e = (ts: string, type: LogEntry["type"], text: string, agent_id: string | null = null): LogEntry => ({
  ts,
  type,
  text,
  agent_id,
});

// As GET /log serves them: newest first, ties in the order the engine wrote them (newest first).
const LOG: LogEntry[] = [
  e("2026-08-28 16:05", "mastermind", "Mastermind: capital raised to 38%", "accountant"),
  e("2026-08-28 16:00", "mastermind", "Capital cut: The Inside Man → 15%"),
  e("2026-08-26 15:45", "trade", "Sold XOM 3.9%", "lookout"),
  e("2026-08-21 10:02", "risk", "Risk: gross trimmed to 87%", "lookout"),
  e("2026-08-20 15:46", "trade", "Bought NVDA 4.0%", "fence"),
];

const all = () => true;
const tradesOnly = (x: LogEntry) => x.type === "trade";

describe("replayOrder", () => {
  it("plays the window oldest first", () => {
    expect(replayOrder(LOG).map((x) => x.ts)).toEqual([
      "2026-08-20 15:46",
      "2026-08-21 10:02",
      "2026-08-26 15:45",
      "2026-08-28 16:00",
      "2026-08-28 16:05",
    ]);
  });

  it("keeps entries with the same timestamp in the order they were written", () => {
    const tied = [e("2026-08-28 16:00", "risk", "second"), e("2026-08-28 16:00", "risk", "first")];
    expect(replayOrder(tied).map((x) => x.text)).toEqual(["first", "second"]);
  });

  it("does not mutate its input", () => {
    const copy = [...LOG];
    replayOrder(LOG);
    expect(LOG).toEqual(copy);
  });
});

describe("stepMs", () => {
  it("ticks four times as often at 4×", () => {
    expect(stepMs(4) * 4).toBe(stepMs(1));
    expect(stepMs(1)).toBeGreaterThan(0);
  });
});

describe("nextCursor", () => {
  const ordered = replayOrder(LOG);

  it("reveals one more entry per tick", () => {
    expect(nextCursor(ordered, 0, all)).toBe(1);
    expect(nextCursor(ordered, 1, all)).toBe(2);
  });

  it("skips entries the filter hides so every tick shows a row", () => {
    // ordered: trade, risk, trade, mm, mm
    expect(nextCursor(ordered, 1, (x) => x.type !== "risk")).toBe(3);
  });

  it("jumps to the end once no shown entry remains", () => {
    expect(nextCursor(ordered, 3, tradesOnly)).toBe(ordered.length);
    expect(nextCursor(ordered, 0, () => false)).toBe(ordered.length);
  });

  it("stays at the end of the tape", () => {
    expect(nextCursor(ordered, ordered.length, all)).toBe(ordered.length);
  });

  it("skips trailing hidden entries after the last shown one", () => {
    expect(nextCursor(ordered, 2, tradesOnly)).toBe(ordered.length);
  });
});

describe("visibleRows", () => {
  const ordered = replayOrder(LOG);

  it("shows what has been replayed, newest on top", () => {
    expect(visibleRows(ordered, 3, all).map((x) => x.ts)).toEqual([
      "2026-08-26 15:45",
      "2026-08-21 10:02",
      "2026-08-20 15:46",
    ]);
  });

  it("applies the filter", () => {
    expect(visibleRows(ordered, 5, tradesOnly).map((x) => x.text)).toEqual(["Sold XOM 3.9%", "Bought NVDA 4.0%"]);
  });

  it("shows nothing before the first tick", () => {
    expect(visibleRows(ordered, 0, all)).toEqual([]);
  });

  it("returns only entries from the log, unchanged", () => {
    for (const row of visibleRows(ordered, 5, all)) expect(LOG).toContain(row);
  });
});

describe("tapePeriod", () => {
  it("spans the first and last timestamps of the window", () => {
    expect(tapePeriod(replayOrder(LOG))).toBe("2026-08-20 15:46 → 2026-08-28 16:05");
  });

  it("is empty for an empty window", () => {
    expect(tapePeriod([])).toBe("");
  });
});

describe("tapeCount", () => {
  it("reads replayed of total", () => {
    expect(tapeCount(412, 500)).toBe("412 of 500");
  });
});

describe("endOfTape", () => {
  it("names the last real timestamp", () => {
    expect(endOfTape(replayOrder(LOG))).toBe("End of tape: 2026-08-28 16:05");
  });
});

describe("tapeWho", () => {
  const crew = new Map([["lookout", { id: "lookout", name: "The Lookout" }]]);

  it("names the agent the entry belongs to", () => {
    expect(tapeWho(LOG[2], crew)).toEqual({ kind: "agent", id: "lookout", name: "The Lookout" });
  });

  it("falls back to the id for an agent the crew list does not know", () => {
    expect(tapeWho(LOG[4], crew)).toEqual({ kind: "agent", id: "fence", name: "fence" });
  });

  it("credits fund-wide entries to the Mastermind or the Red Team", () => {
    expect(tapeWho(LOG[1], crew)).toEqual({ kind: "house", name: "Mastermind" });
    expect(tapeWho(e("2026-08-01 09:00", "redteam", "Red Team: pass"), crew)).toEqual({
      kind: "house",
      name: "Red Team",
    });
    expect(tapeWho(e("2026-08-01 09:00", "risk", "Fund gross capped"), crew)).toEqual({ kind: "house", name: "Fund" });
  });
});

describe("EMPTY_LOG", () => {
  it("says the fund has not been seeded", () => {
    expect(EMPTY_LOG).toMatchObject({ kind: "unseeded", title: "The fund has not been seeded yet" });
  });
});
