import type { AgentSummary } from "@/lib/api";

type Sortable = Pick<AgentSummary, "name" | "status" | "capital_share">;

/** The crew as the War Room lists it: biggest capital share first, killed agents at the bottom. */
export function sortCrew<T extends Sortable>(agents: readonly T[]): T[] {
  return [...agents].sort(
    (a, b) =>
      Number(a.status === "killed" || a.status === "fired") - Number(b.status === "killed" || b.status === "fired") ||
      b.capital_share - a.capital_share ||
      a.name.localeCompare(b.name),
  );
}
