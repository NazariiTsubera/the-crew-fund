import { describe, expect, it } from "vitest";

import { statusLabel } from "@/lib/agent-status";

describe("statusLabel", () => {
  it("names a Red Team kill a kill", () => {
    expect(statusLabel({ status: "killed", verdict: "killed", stop_month: null })).toBe("Killed");
  });

  it("names a Mastermind firing a firing, whatever the Red Team said", () => {
    expect(statusLabel({ status: "killed", verdict: "probation", stop_month: "2020-05" })).toBe("Fired");
  });

  it("keeps the live statuses", () => {
    expect(statusLabel({ status: "trading", verdict: "pass", stop_month: null })).toBe("Trading");
    expect(statusLabel({ status: "sitting_out", verdict: "probation", stop_month: null })).toBe("Sitting out");
  });
});
