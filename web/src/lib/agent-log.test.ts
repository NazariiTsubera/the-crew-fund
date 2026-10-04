import { describe, expect, it } from "vitest";

import { addMonths, entriesInMonth, lastTwelveMonths, logTag } from "@/lib/agent-log";
import type { LogEntry } from "@/lib/api";

const entry = (ts: string, type: LogEntry["type"], text: string): LogEntry => ({ ts, type, text, agent_id: "a" });

describe("logTag", () => {
  it("tags the judge's own decisions YOU, and a firing FIRE", () => {
    expect(logTag(entry("2026-10-04 13:00", "judge", "You set the split: A 75%, B 25%"))).toBe("YOU");
    expect(logTag(entry("2026-10-04 13:00", "judge", "You fired The Lookout"))).toBe("FIRE");
  });

  it("tells buys from sells by the engine's verbs", () => {
    expect(logTag(entry("2026-08-03 15:30", "trade", "Bought MSFT 8.0% — x"))).toBe("BUY");
    expect(logTag(entry("2026-08-03 15:30", "trade", "Sold MSFT — faded"))).toBe("SELL");
  });

  it("does not call a trade line a buy unless it says Bought", () => {
    expect(logTag(entry("2026-08-03 15:30", "trade", "Rebalanced"))).toBe("TRADE");
  });

  it("tags risk lines, sit-outs included, as RISK", () => {
    expect(logTag(entry("2026-08-03 10:02", "risk", "Risk: ann. vol 17% above target"))).toBe("RISK");
    expect(logTag(entry("2026-08-03 10:02", "risk", "Sat out: no name passed the filters"))).toBe("RISK");
  });

  it("tags Mastermind memos MM, and a firing FIRE", () => {
    expect(logTag(entry("2026-08-01 16:00", "mastermind", "Raised The Accountant 30% → 38%"))).toBe("MM");
    expect(logTag(entry("2026-08-01 16:00", "mastermind", "Cut The Inside Man 25% → 15%"))).toBe("MM");
    expect(logTag(entry("2025-03-01 16:00", "mastermind", "Fired The Wheelman · picks' Sharpe"))).toBe("FIRE");
  });

  it("tags red team lines RED", () => {
    expect(logTag(entry("2026-08-01 16:00", "redteam", "Red Team: shuffle test passed"))).toBe("RED");
  });
});

describe("addMonths", () => {
  it("steps across year boundaries both ways", () => {
    expect(addMonths("2026-08", -11)).toBe("2025-09");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", 0)).toBe("2026-03");
  });
});

describe("lastTwelveMonths", () => {
  const log = [
    entry("2026-08-28 16:05", "mastermind", "Raised"),
    entry("2026-01-15 15:00", "trade", "Bought A"),
    entry("2025-09-01 09:00", "trade", "Bought B"),
    entry("2025-08-31 16:00", "trade", "Sold C"),
    entry("2026-09-01 09:00", "trade", "Bought D"),
  ];

  it("keeps the twelve months ending with the given month, newest first", () => {
    expect(lastTwelveMonths(log, "2026-08").map((e) => e.text)).toEqual(["Raised", "Bought A", "Bought B"]);
  });

  it("sorts by timestamp, newest first, whatever the input order", () => {
    const out = lastTwelveMonths([...log].reverse(), "2026-08");
    expect(out.map((e) => e.ts)).toEqual(["2026-08-28 16:05", "2026-01-15 15:00", "2025-09-01 09:00"]);
  });
});

describe("entriesInMonth", () => {
  it("keeps only that month's lines, newest first", () => {
    const log = [
      entry("2026-08-28 16:05", "trade", "a"),
      entry("2026-07-01 16:00", "trade", "b"),
      entry("2026-07-31 16:00", "trade", "c"),
    ];
    expect(entriesInMonth(log, "2026-07").map((e) => e.text)).toEqual(["c", "b"]);
  });
});
