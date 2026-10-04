import type { CSSProperties } from "react";

import type { LogTag } from "@/lib/agent-log";
import type { Verdict } from "@/lib/api";

// The design's tagStyle() and badge(): soft fills for direction, dashed amber for risk, the
// accent for the Mastermind, struck-through red for failures.

export type TagKind = LogTag | "PASS" | "FAIL";

const TAG_BASE: CSSProperties = {
  display: "inline-block",
  textAlign: "center",
  padding: "3px 0",
  width: 44,
  flex: "none",
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  fontSize: 9.5,
  lineHeight: 1,
  letterSpacing: "0.08em",
  borderRadius: 2,
};

function soft(color: string, pct = 18): CSSProperties {
  return { ...TAG_BASE, background: `color-mix(in oklch, ${color} ${pct}%, transparent)`, color };
}

export function tagStyle(kind: TagKind): CSSProperties {
  switch (kind) {
    case "BUY":
    case "PASS":
      return soft("var(--up)");
    case "SELL":
      return soft("var(--down)");
    case "FAIL":
      return { ...soft("var(--down)"), textDecoration: "line-through" };
    case "RISK":
      return { ...TAG_BASE, border: "1px dashed var(--c-amber)", color: "var(--c-amber)", padding: "2px 0" };
    case "MM":
      return { ...TAG_BASE, background: "var(--accent)", color: "var(--on-accent)" };
    case "FIRE":
      return { ...TAG_BASE, background: "var(--down)", color: "var(--bg)" };
    case "TRADE":
      return { ...TAG_BASE, border: "1px solid var(--line-strong)", color: "var(--dim)", padding: "2px 0" };
    case "RED":
      return soft("var(--c-rose)", 16);
  }
}

export function Tag({ kind }: { kind: TagKind }) {
  return <span style={tagStyle(kind)}>{kind}</span>;
}

const BADGE_BASE: CSSProperties = {
  display: "inline-block",
  padding: "4px 7px",
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
  fontSize: 10.5,
  lineHeight: 1,
  letterSpacing: "0.1em",
  borderRadius: 2,
};

export function badgeStyle(verdict: Verdict): CSSProperties {
  switch (verdict) {
    case "pass":
      return {
        ...BADGE_BASE,
        background: "color-mix(in oklch, var(--up) 18%, transparent)",
        color: "var(--up)",
        border: "1px solid color-mix(in oklch, var(--up) 45%, transparent)",
      };
    case "probation":
      return {
        ...BADGE_BASE,
        background: "color-mix(in oklch, var(--c-amber) 16%, transparent)",
        color: "var(--c-amber)",
        border: "1px dashed var(--c-amber)",
      };
    case "killed":
      return {
        ...BADGE_BASE,
        color: "var(--down)",
        border: "1px solid color-mix(in oklch, var(--down) 50%, transparent)",
        textDecoration: "line-through",
      };
  }
}

export function statusDotStyle(status: "trading" | "sitting_out" | "killed" | "fired"): CSSProperties {
  const trading = status === "trading";
  return {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    flex: "none",
    background: trading ? "var(--up)" : "transparent",
    boxShadow: trading ? "0 0 0 3px color-mix(in oklch, var(--up) 22%, transparent)" : "none",
    border: trading ? "none" : `1.5px solid ${status === "killed" || status === "fired" ? "var(--down)" : "var(--muted)"}`,
  };
}

