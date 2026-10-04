import { describe, expect, it } from "vitest";

import type { RecipeOut } from "@/lib/api";
import { FEATURES, MARKET_WIDE } from "@/lib/features";
import {
  addable,
  addFeature,
  canAdd,
  canRemove,
  flipDirection,
  isEdited,
  MAX_FEATURES,
  normalized,
  removeFeature,
  setLookback,
  setSitOut,
  setTopN,
  setWeight,
} from "@/lib/whatif";

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
    addFeature(base, "atm_iv");
    removeFeature(base, "kyle_lambda");
    setLookback(base, 24);
    expect(base).toEqual(copy);
  });
});

describe("adding and dropping signals", () => {
  it("offers every glossary feature the recipe does not already use", () => {
    const names = addable(base).map((f) => f.name);
    expect(names).toHaveLength(Object.keys(FEATURES).length - 3);
    expect(names).not.toContain("kyle_lambda");
    expect(names).toContain("atm_iv");
  });

  it("marks the market-wide signals, which cannot rank stocks on their own", () => {
    const wide = addable(base).filter((f) => f.marketWide).map((f) => f.name);
    expect(wide.sort()).toEqual([...MARKET_WIDE].sort());
    expect(addable(base).find((f) => f.name === "atm_iv")?.meaning).toBe(FEATURES.atm_iv);
  });

  it("adds a feature ranking high, at an average weight", () => {
    const r = addFeature(base, "atm_iv");
    expect(r.features.map((f) => f.name)).toEqual([...base.features.map((f) => f.name), "atm_iv"]);
    expect(r.features[3]).toEqual({ name: "atm_iv", weight: 1 / 3, direction: "high" });
  });

  it("refuses a duplicate, an unknown feature, or a ninth", () => {
    expect(addFeature(base, "kyle_lambda")).toEqual(base);
    expect(addFeature(base, "secret_alpha")).toEqual(base);
    const names = Object.keys(FEATURES).filter((n) => !base.features.some((f) => f.name === n));
    const full = names.slice(0, MAX_FEATURES - 3).reduce(addFeature, base);
    expect(full.features).toHaveLength(MAX_FEATURES);
    expect(canAdd(full)).toBe(false);
    expect(addFeature(full, names[MAX_FEATURES])).toEqual(full);
  });

  it("drops a feature but always keeps one", () => {
    const r = removeFeature(base, "kyle_lambda");
    expect(r.features.map((f) => f.name)).toEqual(["liquidity_roc", "minute_realized_diffusion"]);
    const one = removeFeature(removeFeature(base, "kyle_lambda"), "liquidity_roc");
    expect(canRemove(one)).toBe(false);
    expect(removeFeature(one, "minute_realized_diffusion")).toEqual(one);
  });

  it("clamps the lookback to 1–60 months", () => {
    expect(setLookback(base, 0).lookback_months).toBe(1);
    expect(setLookback(base, 99).lookback_months).toBe(60);
    expect(setLookback(base, 6.4).lookback_months).toBe(6);
  });

  it("counts an added, dropped or reordered signal and a new lookback as edits", () => {
    expect(isEdited(base, addFeature(base, "atm_iv"))).toBe(true);
    expect(isEdited(base, removeFeature(base, "kyle_lambda"))).toBe(true);
    expect(isEdited(base, setLookback(base, 12))).toBe(true);
    expect(isEdited(addFeature(base, "atm_iv"), base)).toBe(true);
  });
});
