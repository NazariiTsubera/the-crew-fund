import { describe, expect, it } from "vitest";

import type { RecipeOut } from "@/lib/api";
import { flipDirection, isEdited, normalized, setSitOut, setTopN, setWeight } from "@/lib/whatif";

const base: RecipeOut = {
  features: [
    { name: "liquidity_roc", weight: 0.45, direction: "high" },
    { name: "kyle_lambda", weight: 0.3, direction: "low" },
    { name: "minute_realized_diffusion", weight: 0.25, direction: "high" },
  ],
  filters: [],
  lookback_months: 3,
  top_n: 15,
  rebalance: "monthly",
  sit_out_if_trailing_sharpe_below: -0.4,
};

describe("what-if edits", () => {
  it("re-normalizes weights after one changes", () => {
    const r = normalized(setWeight(base, "kyle_lambda", 0.75));
    expect(r.features.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1);
    expect(r.features[1].weight).toBeCloseTo(0.75 / 1.45);
  });

  it("never lets a weight reach zero, which the recipe grammar refuses", () => {
    expect(setWeight(base, "kyle_lambda", 0).features[1].weight).toBeGreaterThan(0);
  });

  it("flips one feature's direction", () => {
    expect(flipDirection(base, "kyle_lambda").features[1].direction).toBe("high");
    expect(flipDirection(base, "kyle_lambda").features[0].direction).toBe("high");
  });

  it("clamps top N and the sit-out floor to what the API accepts", () => {
    expect(setTopN(base, 0).top_n).toBe(1);
    expect(setTopN(base, 99).top_n).toBe(50);
    expect(setSitOut(base, 9).sit_out_if_trailing_sharpe_below).toBe(3);
    expect(setSitOut(base, null).sit_out_if_trailing_sharpe_below).toBeNull();
  });

  it("knows an untouched recipe from an edited one, whatever the weight scale", () => {
    expect(isEdited(base, base)).toBe(false);
    expect(isEdited(base, normalized(base))).toBe(false);
    expect(isEdited(base, setTopN(base, 10))).toBe(true);
    expect(isEdited(base, flipDirection(base, "kyle_lambda"))).toBe(true);
  });

  it("never mutates the recipe it is given", () => {
    const copy = structuredClone(base);
    setWeight(base, "kyle_lambda", 0.9);
    flipDirection(base, "kyle_lambda");
    expect(base).toEqual(copy);
  });
});
