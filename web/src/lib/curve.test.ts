import { describe, expect, it } from "vitest";

import { lastMonthReturn, monthEnds } from "@/lib/curve";

const daily = [
  { date: "2026-07-30", value: 1.0 },
  { date: "2026-07-31", value: 1.2 },
  { date: "2026-08-03", value: 1.1 },
  { date: "2026-08-14", value: 1.26 },
];

describe("monthEnds", () => {
  it("keeps the last point of each month", () => {
    expect(monthEnds(daily)).toEqual([
      { month: "2026-07", value: 1.2 },
      { month: "2026-08", value: 1.26 },
    ]);
  });

  it("does not depend on input order", () => {
    expect(monthEnds([...daily].reverse())).toEqual(monthEnds(daily));
  });
});

describe("lastMonthReturn", () => {
  it("measures the latest month against the previous month-end", () => {
    const r = lastMonthReturn(daily);
    expect(r?.month).toBe("2026-08");
    expect(r?.value).toBeCloseTo(0.05, 10);
  });

  it("has nothing to say about a curve shorter than two months", () => {
    expect(lastMonthReturn(daily.slice(0, 2))).toBeNull();
    expect(lastMonthReturn([])).toBeNull();
  });
});
