import { describe, expect, it } from "vitest";

import { countUp, easeOutCubic, prefersReducedMotion, REDUCED_MOTION_QUERY, staggerMs } from "@/lib/motion";

describe("easeOutCubic", () => {
  it("starts at 0 and ends at exactly 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("moves fast first, so the number is near its value well before the end", () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });

  it("clamps outside the unit interval", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("countUp", () => {
  it("starts from the old value", () => {
    expect(countUp(0, 0.412, 0, 800)).toBe(0);
  });

  it("lands on exactly the real value at the end and after it", () => {
    expect(countUp(0, 0.4123456789, 800, 800)).toBe(0.4123456789);
    expect(countUp(0, 0.4123456789, 5000, 800)).toBe(0.4123456789);
  });

  it("passes through eased values in between, for negatives too", () => {
    expect(countUp(0, -0.2, 400, 800)).toBeCloseTo(-0.175);
    expect(countUp(1, 2, 400, 800)).toBeCloseTo(1.875);
  });

  it("jumps straight to the value when there is no time to animate", () => {
    expect(countUp(0, 1.5, 0, 0)).toBe(1.5);
  });

  it("never interpolates a non-finite value", () => {
    expect(countUp(0, Number.NaN, 400, 800)).toBeNaN();
    expect(countUp(0, Number.POSITIVE_INFINITY, 400, 800)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("staggerMs", () => {
  it("delays each item by one step after the start", () => {
    expect(staggerMs(0, 900, 140)).toBe(900);
    expect(staggerMs(3, 900, 140)).toBe(1320);
  });
});

describe("prefersReducedMotion", () => {
  const withMatch = (matches: boolean) => ({
    matchMedia: (q: string) => ({ matches: q === REDUCED_MOTION_QUERY && matches }),
  });

  it("reads the OS setting through matchMedia", () => {
    expect(prefersReducedMotion(withMatch(true))).toBe(true);
    expect(prefersReducedMotion(withMatch(false))).toBe(false);
  });

  it("assumes motion is fine where there is no matchMedia, as on the server", () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});
