import { describe, expect, it } from "vitest";

import type { CapitalMonth } from "@/lib/api";
import { clampIndex, formatChange, replayStart, shareRows } from "@/lib/capital";

const months: CapitalMonth[] = [
  { month: "2026-06", shares: { a: 0.5, b: 0.5 }, invested: 0.8 },
  { month: "2026-07", shares: { a: 0.6, b: 0.4 }, invested: 0.8 },
  { month: "2026-08", shares: { a: 0.6, b: 0.25, c: 0.15 }, invested: 0.78 },
];

describe("shareRows", () => {
  it("gives each agent's share and its change against the month before, in points", () => {
    const rows = shareRows(months, 1, ["a", "b"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "a", share: 0.6 });
    expect(rows[0].change).toBeCloseTo(10);
    expect(rows[1].change).toBeCloseTo(-10);
  });

  it("treats an agent missing from a month as holding nothing", () => {
    const rows = shareRows(months, 2, ["a", "b", "c"]);
    expect(rows[2]).toMatchObject({ id: "c", share: 0.15 });
    expect(rows[2].change).toBeCloseTo(15);
  });

  it("has no change to report for the first month", () => {
    expect(shareRows(months, 0, ["a"])[0].change).toBeNull();
  });

  it("clamps an out-of-range month and returns nothing for an empty history", () => {
    expect(shareRows(months, 9, ["c"])[0].share).toBe(0.15);
    expect(shareRows([], 0, ["a"])).toEqual([]);
  });
});

describe("formatChange", () => {
  it("prints a direction arrow and signed points so the change never relies on colour", () => {
    expect(formatChange(2)).toBe("▲ +2.0pt");
    expect(formatChange(-1.26)).toBe("▼ −1.3pt");
    expect(formatChange(0.01)).toBe("— flat");
    expect(formatChange(null)).toBe("—");
  });
});

describe("clampIndex", () => {
  it("keeps a scrubber position inside the history", () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-2, 3)).toBe(0);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(4, 0)).toBe(0);
  });
});

describe("replayStart", () => {
  it("starts a replay 24 months back, or at the first month of a shorter history", () => {
    expect(replayStart(30)).toBe(6);
    expect(replayStart(24)).toBe(0);
    expect(replayStart(10)).toBe(0);
    expect(replayStart(30, 12)).toBe(18);
  });
});
