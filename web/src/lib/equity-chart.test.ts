import { describe, expect, it } from "vitest";

import { benchmarkReturnAt, equityChart, nearestMonth } from "@/lib/equity-chart";

const main = [
  { date: "2020-01-31", value: 1 },
  { date: "2020-02-29", value: 1.1 },
  { date: "2020-03-15", value: 0.9 },
  { date: "2020-03-31", value: 1.2 },
];
const bench = [
  { date: "2020-01-31", value: 1 },
  { date: "2020-02-29", value: 1.05 },
  { date: "2020-03-31", value: 1.02 },
  { date: "2020-04-30", value: 1.08 },
];

describe("equityChart", () => {
  const chart = equityChart(main, bench, { width: 1000, height: 300 });

  it("spans both series' dates on the x axis", () => {
    expect(chart.x("2020-01-31")).toBe(0);
    expect(chart.x("2020-04-30")).toBe(1000);
  });

  it("puts higher values higher on screen, inside the box", () => {
    expect(chart.y(1.2)).toBeLessThan(chart.y(0.9));
    expect(chart.y(1.2)).toBeGreaterThan(0);
    expect(chart.y(0.9)).toBeLessThan(300);
  });

  it("draws each series as one path through every point", () => {
    expect(chart.mainPath.startsWith("M0.0 ")).toBe(true);
    expect(chart.mainPath.match(/L/g)).toHaveLength(main.length - 1);
    expect(chart.benchPath.match(/L/g)).toHaveLength(bench.length - 1);
  });

  it("offers one clickable point per month of the agent, at that month's last value", () => {
    expect(chart.months.map((m) => m.month)).toEqual(["2020-01", "2020-02", "2020-03"]);
    expect(chart.months[2].value).toBe(1.2);
    expect(chart.months[2].bench).toBe(1.02);
    expect(chart.months[2].x).toBe(chart.x("2020-03-31"));
  });

  it("keeps y ticks inside the plotted range", () => {
    expect(chart.yTicks.length).toBeGreaterThan(0);
    for (const t of chart.yTicks) {
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(300);
    }
    expect(chart.yTicks.map((t) => t.value)).toContain(1);
  });

  it("has no holdout marker unless given a cutoff", () => {
    expect(chart.holdout).toBeNull();
  });

  it("extends the axis to show the sealed holdout window after the cutoff", () => {
    const sealed = equityChart(main, bench, {
      width: 1000,
      height: 300,
      holdoutCutoff: "2020-05-01",
      holdoutDays: 30,
    });
    expect(sealed.holdout).not.toBeNull();
    expect(sealed.holdout!.x).toBeGreaterThan(sealed.x("2020-04-30"));
    expect(sealed.x("2020-05-31")).toBeCloseTo(1000, 6);
  });

  it("labels each January that falls inside the axis", () => {
    const long = equityChart(
      [
        { date: "2018-06-30", value: 1 },
        { date: "2020-06-30", value: 1.3 },
      ],
      [],
      { width: 1000, height: 300 },
    );
    expect(long.years.map((y) => y.label)).toEqual(["2019", "2020"]);
  });

  it("survives empty series", () => {
    const empty = equityChart([], [], { width: 1000, height: 300 });
    expect(empty.mainPath).toBe("");
    expect(empty.months).toEqual([]);
  });
});

describe("nearestMonth", () => {
  const chart = equityChart(main, bench, { width: 1000, height: 300 });

  it("picks the month whose point is closest to the pointer", () => {
    expect(nearestMonth(chart.months, 10)?.month).toBe("2020-01");
    expect(nearestMonth(chart.months, chart.x("2020-03-20"))?.month).toBe("2020-03");
  });

  it("returns null when there are no months", () => {
    expect(nearestMonth([], 10)).toBeNull();
  });
});

describe("benchmarkReturnAt", () => {
  it("reads the benchmark's return up to the given date", () => {
    expect(benchmarkReturnAt(bench, "2020-03-31")).toBeCloseTo(0.02, 10);
    expect(benchmarkReturnAt(bench, "2020-03-20")).toBeCloseTo(0.05, 10);
  });

  it("returns null when the benchmark has no point by then", () => {
    expect(benchmarkReturnAt(bench, "2019-12-31")).toBeNull();
    expect(benchmarkReturnAt([], "2020-03-31")).toBeNull();
  });
});
