import { describe, expect, it } from "vitest";

import { sortCrew } from "@/lib/crew";

const agent = (id: string, status: "trading" | "sitting_out" | "killed", capital_share: number) => ({
  id,
  name: id.toUpperCase(),
  status,
  capital_share,
});

describe("sortCrew", () => {
  it("orders by capital share, with killed agents last", () => {
    const sorted = sortCrew([
      agent("w", "killed", 0),
      agent("l", "sitting_out", 0.16),
      agent("a", "trading", 0.38),
      agent("i", "trading", 0.15),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["a", "l", "i", "w"]);
  });

  it("breaks ties by name and leaves the input untouched", () => {
    const input = [agent("b", "trading", 0.2), agent("a", "trading", 0.2)];
    expect(sortCrew(input).map((a) => a.id)).toEqual(["a", "b"]);
    expect(input.map((a) => a.id)).toEqual(["b", "a"]);
  });
});
