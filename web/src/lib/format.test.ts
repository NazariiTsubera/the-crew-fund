import { describe, expect, it } from "vitest";

import { formatDay, formatMonth, formatNum, formatPct, formatShare } from "@/lib/format";

describe("formatPct", () => {
  it("signs gains with a plus and one decimal", () => {
    expect(formatPct(0.7)).toBe("+70.0%");
  });

  it("uses a true minus sign for losses, as the design does", () => {
    expect(formatPct(-0.161)).toBe("−16.1%");
  });

  it("respects the requested number of decimals", () => {
    expect(formatPct(0.12345, 2)).toBe("+12.35%");
  });

  it("never prints a negative zero", () => {
    expect(formatPct(-0.00001)).toBe("+0.0%");
    expect(formatPct(0)).toBe("+0.0%");
  });
});

describe("formatShare", () => {
  it("prints capital shares as whole, unsigned percentages", () => {
    expect(formatShare(0.38)).toBe("38%");
    expect(formatShare(0.155)).toBe("16%");
    expect(formatShare(0)).toBe("0%");
  });
});

describe("formatNum", () => {
  it("prints two decimals by default without a plus", () => {
    expect(formatNum(1.234)).toBe("1.23");
  });

  it("uses a true minus sign", () => {
    expect(formatNum(-0.4)).toBe("−0.40");
    expect(formatNum(-1.25, 1)).toBe("−1.3");
  });

  it("never prints a negative zero", () => {
    expect(formatNum(-0.001)).toBe("0.00");
  });
});

describe("formatMonth", () => {
  it("labels a month the way the design does", () => {
    expect(formatMonth("2026-08")).toBe("Aug 2026");
    expect(formatMonth("2017-01")).toBe("Jan 2017");
  });

  it("accepts a full date", () => {
    expect(formatMonth("2020-03-31")).toBe("Mar 2020");
  });

  it("rejects anything that is not a month", () => {
    expect(() => formatMonth("2026-13")).toThrow(RangeError);
    expect(() => formatMonth("Aug 2026")).toThrow(RangeError);
  });
});

describe("formatDay", () => {
  it("prints a date as the design's day, short month and year in capitals", () => {
    expect(formatDay("2026-08-31")).toBe("31 AUG 2026");
    expect(formatDay("2026-09-02")).toBe("2 SEP 2026");
  });

  it("falls back to the month for a month-only value", () => {
    expect(formatDay("2025-01")).toBe("JAN 2025");
  });
});
