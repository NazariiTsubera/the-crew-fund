import { describe, expect, it } from "vitest";

import { formatPct } from "@/lib/format";

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
});
