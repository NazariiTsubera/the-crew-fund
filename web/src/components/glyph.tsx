import type { CSSProperties } from "react";

import type { AgentColor, AgentShape } from "@/lib/api";

// Each agent is a shape plus a colour so the crew stays distinguishable in charts and lists
// even for colour-blind viewers (the design's glyph() in crew-data.js).
export function glyphStyle(shape: AgentShape, size: number, tone: string): CSSProperties {
  const s: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    flex: "none",
    background: tone,
  };
  const stroke = Math.max(2, Math.round(size / 5));
  switch (shape) {
    case "circle":
      return { ...s, borderRadius: "50%" };
    case "diamond":
      return { ...s, transform: "rotate(45deg) scale(0.76)" };
    case "ring":
      return { ...s, background: "transparent", border: `${stroke}px solid ${tone}`, borderRadius: "50%" };
    case "triangle":
      return { ...s, clipPath: "polygon(50% 4%, 100% 96%, 0 96%)" };
    case "box":
      return { ...s, background: "transparent", border: `${stroke}px solid ${tone}` };
    case "half":
      return {
        ...s,
        background: `linear-gradient(90deg, ${tone} 50%, transparent 50%)`,
        border: `1.5px solid ${tone}`,
        borderRadius: "50%",
      };
    case "plus":
      return {
        ...s,
        clipPath:
          "polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)",
      };
    case "square":
      return s;
  }
}

export function agentColorVar(color: AgentColor): string {
  return `var(--c-${color})`;
}

type GlyphProps = {
  shape: AgentShape;
  color?: AgentColor;
  size?: number;
  /** Killed agents are drawn in the faint tone. */
  dim?: boolean;
  label?: string;
};

export function Glyph({ shape, color, size = 12, dim = false, label }: GlyphProps) {
  const tone = dim ? "var(--faint)" : color ? agentColorVar(color) : "var(--ink)";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={glyphStyle(shape, size, tone)}
    />
  );
}
