import { describe, expect, it } from "vitest";

import { bookSummary, sortHoldings } from "@/lib/holdings";

const h = (ticker: string, weight: number) => ({ ticker, weight, reason: null, agent_id: null });

describe("sortHoldings", () => {
  it("puts the largest position first, then by ticker", () => {
    expect(sortHoldings([h("B", 0.1), h("C", 0.2), h("A", 0.2)]).map((x) => x.ticker)).toEqual(["A", "C", "B"]);
  });
});

describe("bookSummary", () => {
  it("counts positions, sums weights and finds the largest for the bar scale", () => {
    expect(bookSummary([h("A", 0.5), h("B", 0.25)])).toEqual({ count: 2, total: 0.75, maxWeight: 0.5 });
  });

  it("handles an empty book", () => {
    expect(bookSummary([])).toEqual({ count: 0, total: 0, maxWeight: 0 });
  });
});
