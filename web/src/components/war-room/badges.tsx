import type { CSSProperties } from "react";

import { statusLabel } from "@/lib/agent-status";
import type { AgentSummary, Verdict } from "@/lib/api";
import { verdictLabel } from "@/lib/agent-status";

const BADGE: CSSProperties = {
  display: "inline-block",
  padding: "4px 7px",
  borderRadius: 2,
  whiteSpace: "nowrap",
};

// Each verdict differs in border style and decoration as well as hue (solid, dashed,
// struck through), and always carries its word, so it reads without colour.
const VERDICT_STYLE: Record<Verdict, CSSProperties> = {
  pass: {
    background: "color-mix(in oklch, var(--up) 18%, transparent)",
    color: "var(--up)",
    border: "1px solid color-mix(in oklch, var(--up) 45%, transparent)",
  },
  probation: {
    background: "color-mix(in oklch, var(--c-amber) 16%, transparent)",
    color: "var(--c-amber)",
    border: "1px dashed var(--c-amber)",
  },
  killed: {
    color: "var(--down)",
    border: "1px solid color-mix(in oklch, var(--down) 50%, transparent)",
    textDecoration: "line-through",
  },
};

/** The Red Team verdict as advice: PASSED, CAUTION or FAILED. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className="font-mono text-[10.5px] leading-none font-semibold tracking-[0.1em]"
      style={{ ...BADGE, ...VERDICT_STYLE[verdict] }}
    >
      <span className="sr-only">Red Team verdict: </span>
      {verdictLabel(verdict)}
    </span>
  );
}

function dotStyle(status: AgentSummary["status"]): CSSProperties {
  if (status === "trading") {
    return {
      background: "var(--up)",
      boxShadow: "0 0 0 3px color-mix(in oklch, var(--up) 22%, transparent)",
    };
  }
  return { border: `1.5px solid ${status === "killed" ? "var(--down)" : "var(--muted)"}` };
}

/** Status dot plus its word: filled for trading, hollow for sitting out or killed. */
export function AgentStatus({ agent }: { agent: Pick<AgentSummary, "status" | "verdict" | "stop_month"> }) {
  const { status } = agent;
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] leading-none whitespace-nowrap text-muted">
      <span aria-hidden className="inline-block size-[7px] flex-none rounded-full" style={dotStyle(status)} />
      {statusLabel(agent)}
    </span>
  );
}
