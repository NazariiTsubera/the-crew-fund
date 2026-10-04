import type { AgentSummary } from "@/lib/api";

// The API has one "killed" status for two different fates: the Red Team killing an agent at
// creation, and the Mastermind firing a trading agent later (stop_month set). Judges read them
// differently, so the screen names them apart.

type StatusFields = Pick<AgentSummary, "status" | "verdict" | "stop_month">;

export const STATUS_TEXT: Record<AgentSummary["status"], string> = {
  trading: "Trading",
  sitting_out: "Sitting out",
  killed: "Killed",
};

export function isFired(a: StatusFields): boolean {
  return a.status === "killed" && a.verdict !== "killed" && a.stop_month !== null;
}

export function statusLabel(a: StatusFields): string {
  return isFired(a) ? "Fired" : STATUS_TEXT[a.status];
}

// The Red Team advises; it never stops an agent. "killed" stays the API's word for a failed
// attack, but on screen it reads as a warning the judge can weigh.
const VERDICT_TEXT: Record<AgentSummary["verdict"], string> = {
  pass: "PASSED",
  probation: "CAUTION",
  killed: "FAILED",
};

export function verdictLabel(verdict: AgentSummary["verdict"]): string {
  return VERDICT_TEXT[verdict];
}
