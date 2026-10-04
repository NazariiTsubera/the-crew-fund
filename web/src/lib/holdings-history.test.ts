import { describe, expect, it } from "vitest";

import { agentShares, stackAreas } from "@/lib/holdings-history";

const months = [
  { month: "2020-01", holdings: [
    { ticker: "A", weight: 0.3, reason: null, agent_id: "x" },
    { ticker: "B", weight: 0.2, reason: null, agent_id: "x" },
    { ticker: "C", weight: 0.5, reason: null, agent_id: "y" },
  ] },
  { month: "2020-02", holdings: [{ ticker: "C", weight: 1, reason: null, agent_id: "y" }] },
];

describe("agentShares", () => {
  it("sums each month's book by the agent holding it", () => {
    expect(agentShares(months, ["x", "y"])).toEqual([
      { month: "2020-01", shares: { x: 0.5, y: 0.5 } },
      { month: "2020-02", shares: { x: 0, y: 1 } },
    ]);
  });
});

describe("stackAreas", () => {
  it("stacks the agents' bands bottom to top across the chart", () => {
    const areas = stackAreas(agentShares(months, ["x", "y"]), ["x", "y"], 100, 100);
    expect(areas.map((a) => a.id)).toEqual(["x", "y"]);
    // x: from the bottom up to 50% in January, nothing in February.
    expect(areas[0].d).toBe("M0.0 50.0 L100.0 100.0 L100.0 100.0 L0.0 100.0 Z");
    // y: on top of x, reaching the top both months.
    expect(areas[1].d).toBe("M0.0 0.0 L100.0 0.0 L100.0 100.0 L0.0 50.0 Z");
  });
});
