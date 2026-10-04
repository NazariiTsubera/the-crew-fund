"use client";

import { useMemo, type MouseEvent } from "react";

import { agentColorVar } from "@/components/glyph";
import { KICKER } from "@/components/war-room/page-frame";
import type { AgentSummary } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { agentShares, stackAreas, type BookMonth } from "@/lib/holdings-history";

const W = 1000;
const H = 260;

type Props = {
  months: BookMonth[];
  agents: AgentSummary[];
  /** The month the table shows: hovered, else pinned, else the latest. */
  shown: string;
  pinned: string | null;
  onHover: (month: string | null) => void;
  onPin: (month: string | null) => void;
};

/**
 * The fund's book over time, one band per agent (its share of the positions that month), in the
 * War Room's colours. Hover a month to see its positions below; click to pin it.
 */
export function HoldingsChart({ months, agents, shown, pinned, onHover, onPin }: Props) {
  const ids = useMemo(() => agents.map((a) => a.id), [agents]);
  const areas = useMemo(() => stackAreas(agentShares(months, ids), ids, W, H), [months, ids]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  const n = months.length;
  const at = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    return months[Math.min(Math.max(i, 0), n - 1)].month;
  };
  const xOf = (month: string) => {
    const i = months.findIndex((m) => m.month === month);
    return n > 1 && i >= 0 ? (i / (n - 1)) * 100 : 100;
  };
  const years = months.filter((m, i) => i > 0 && m.month.endsWith("-01"));

  if (n < 2) return null;
  return (
    <section aria-label="Holdings over time" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={KICKER}>
          THE BOOK BY AGENT · {formatMonth(months[0].month).toUpperCase()} → {formatMonth(months[n - 1].month).toUpperCase()}
        </div>
        <div className="font-mono text-[11px] leading-none text-faint">
          {pinned ? "PINNED · CLICK AGAIN TO RELEASE" : "HOVER A MONTH · CLICK TO PIN"}
        </div>
      </div>
      <div className="border border-line bg-panel px-3 pt-4 pb-[30px] sm:px-4">
        <div
          role="img"
          aria-label="Share of the fund's book held by each agent, month by month"
          onPointerMove={(e) => onHover(at(e))}
          onPointerLeave={() => onHover(null)}
          onClick={(e) => {
            const m = at(e);
            onPin(pinned === m ? null : m);
          }}
          className="relative h-[220px] cursor-crosshair select-none sm:h-[260px]"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="crew-draw absolute inset-0 size-full">
            {areas.map((a) => {
              const agent = byId.get(a.id);
              return (
                <path
                  key={a.id}
                  d={a.d}
                  fill={agent ? agentColorVar(agent.color) : "var(--faint)"}
                  fillOpacity={0.55}
                  stroke={agent ? agentColorVar(agent.color) : "var(--faint)"}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-ink" style={{ left: `${xOf(shown)}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 bg-ink px-[5px] py-[2px] font-mono text-[10px] leading-none font-semibold whitespace-nowrap text-bg">
              {formatMonth(shown).toUpperCase()}
            </span>
          </div>
          {years.map((m) => (
            <span
              key={m.month}
              className="absolute -bottom-[22px] -translate-x-1/2 font-mono text-[10px] leading-none text-faint"
              style={{ left: `${xOf(m.month)}%` }}
            >
              <span className={Number(m.month.slice(0, 4)) % 2 ? "hidden sm:inline" : ""}>{m.month.slice(0, 4)}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
