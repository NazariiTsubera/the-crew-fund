import { describe, expect, it } from "vitest";

import { alignSeries, chartModel, equityTicks, indexAtFraction, sparkPath } from "@/lib/chart";

const curve = [
  { date: "2020-01-31", value: 1 },
  { date: "2020-02-15", value: 1.2 },
  { date: "2020-02-29", value: 1.1 },
  { date: "2020-03-31", value: 0.8 },
  { date: "2020-04-30", value: 1.5 },
];
const bench = [
  { date: "2020-01-31", value: 1 },
  { date: "2020-02-29", value: 0.9 },
  { date: "2020-04-30", value: 1.2 },
];

describe("alignSeries", () => {
  it("joins month-end fund and benchmark values by month", () => {
    expect(alignSeries(curve, bench)).toEqual([
      { month: "2020-01", fund: 1, spx: 1 },
      { month: "2020-02", fund: 1.1, spx: 0.9 },
      { month: "2020-03", fund: 0.8, spx: null },
      { month: "2020-04", fund: 1.5, spx: 1.2 },
    ]);
  });
});

describe("equityTicks", () => {
  it("picks round return levels inside the range, always including the start", () => {
    expect(equityTicks(0.7, 1.7)).toEqual([0.75, 1, 1.25, 1.5]);
  });

  it("widens the step so a long range keeps at most six lines", () => {
    const ticks = equityTicks(0.9, 4.2);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks).toContain(1);
    expect(ticks).toContain(2);
  });
});

describe("chartModel", () => {
  const points = alignSeries(curve, bench);

  it("maps the first and last month to the plot's edges when the holdout is inside", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2020-03-10", ddMonth: null });
    expect(m.x(0)).toBe(0);
    expect(m.x(3)).toBe(1000);
    expect(m.holdoutX).toBeCloseTo((2 / 3) * 1000);
  });

  it("stretches the x axis to show a holdout that starts after the last month", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2020-05-02", ddMonth: null });
    expect(m.x(3)).toBe(750);
    expect(m.holdoutX).toBe(1000);
  });

  it("drops the holdout marker when the cutoff is before the curve", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2019-01-01", ddMonth: null });
    expect(m.holdoutX).toBeNull();
  });

  it("drops the holdout marker rather than leave a long empty stretch after the curve", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2021-01-01", ddMonth: null });
    expect(m.holdoutX).toBeNull();
    expect(m.x(3)).toBe(1000);
  });

  it("puts higher values higher on the plot, in both scales", () => {
    for (const log of [false, true]) {
      const m = chartModel(points, { log, holdoutCutoff: "2020-05-01", ddMonth: null });
      expect(m.y(1.5)).toBeLessThan(m.y(1));
      expect(m.y(1.5)).toBeGreaterThanOrEqual(0);
      expect(m.y(0.8)).toBeLessThanOrEqual(300);
    }
  });

  it("spaces equal ratios equally on the log scale", () => {
    const m = chartModel(points, { log: true, holdoutCutoff: "2020-05-01", ddMonth: null });
    expect(m.y(0.8) - m.y(1)).toBeCloseTo(m.y(1) - m.y(1.25));
  });

  it("draws the benchmark with a gap where a month is missing", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2020-05-01", ddMonth: null });
    expect(m.fundPath.match(/[ML]/g)).toEqual(["M", "L", "L", "L"]);
    expect(m.spxPath.match(/[ML]/g)).toEqual(["M", "L", "M"]);
  });

  it("anchors the max-drawdown annotation on its month", () => {
    const m = chartModel(points, { log: false, holdoutCutoff: "2020-05-01", ddMonth: "2020-03" });
    expect(m.dd).toEqual({ index: 2, x: m.x(2), y: m.y(0.8) });
    const none = chartModel(points, { log: false, holdoutCutoff: "2020-05-01", ddMonth: "1999-01" });
    expect(none.dd).toBeNull();
  });

  it("labels a January tick for each year after the first", () => {
    const long = alignSeries(
      [
        { date: "2019-11-30", value: 1 },
        { date: "2019-12-31", value: 1 },
        { date: "2020-01-31", value: 1 },
        { date: "2020-02-29", value: 1 },
      ],
      [],
    );
    const m = chartModel(long, { log: false, holdoutCutoff: "2021-01-01", ddMonth: null });
    expect(m.years).toEqual([{ label: "2020", x: m.x(2) }]);
  });

  it("returns ticks inside the plot with return labels", () => {
    const m = chartModel(points, { log: true, holdoutCutoff: "2020-05-01", ddMonth: null });
    expect(m.yTicks.find((t) => t.value === 1)?.label).toBe("0%");
    for (const t of m.yTicks) {
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(300);
    }
  });
});

describe("indexAtFraction", () => {
  it("snaps a pointer position to the nearest month and clamps to the data", () => {
    expect(indexAtFraction(0, 10, 10)).toBe(0);
    expect(indexAtFraction(0.5, 11, 11)).toBe(5);
    expect(indexAtFraction(1.2, 11, 11)).toBe(10);
    // The axis spans 13 slots but only 10 months have data.
    expect(indexAtFraction(1, 13, 10)).toBe(9);
    expect(indexAtFraction(-1, 13, 10)).toBe(0);
  });
});

describe("sparkPath", () => {
  const coords = (d: string) =>
    d
      .split(/[ML]/)
      .filter((p) => p.trim())
      .map((p) => p.trim().split(" ").map(Number));

  it("runs from the left edge to the slot of the last value, highest value on top", () => {
    const c = coords(sparkPath([1, 2, 4], { width: 120, height: 34, slots: 5 }));
    expect(c[0][0]).toBe(0);
    expect(c[2][0]).toBe(60);
    expect(c[2][1]).toBe(1);
    expect(c[0][1]).toBe(33);
    // Log scale: 2 sits halfway between 1 and 4.
    expect(c[1][1]).toBe(17);
  });

  it("draws a flat line for a single point and nothing for no data", () => {
    expect(sparkPath([1], { width: 120, height: 34, slots: 1 })).toBe("M0 17 L120 17");
    expect(sparkPath([], { width: 120, height: 34, slots: 1 })).toBe("");
  });
});
