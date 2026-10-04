"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { KICKER } from "@/components/war-room/page-frame";
import { agentColorVar } from "@/components/glyph";
import type { AgentColor, Fund } from "@/lib/api";
import { alignSeries, chartModel, contributionPath, indexAtFraction } from "@/lib/chart";
import { formatMonth, formatPct } from "@/lib/format";
import { DRAW_MS } from "@/lib/motion";

const W = 1000;
const H = 300;
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

function ScaleToggle({ log, onChange }: { log: boolean; onChange: (log: boolean) => void }) {
  const option = (on: boolean, label: string, value: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(value)}
      className={`h-6 cursor-pointer px-2 font-mono text-[10px] leading-none font-medium tracking-[0.1em] focus-visible:outline focus-visible:outline-accent ${on ? "bg-ink text-bg" : "bg-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <span role="group" aria-label="Chart scale" className="flex rounded-[2px] border border-line-strong">
      {option(log, "LOG", true)}
      {option(!log, "LINEAR", false)}
    </span>
  );
}

/** The fund's equity curve against the S&P 500 since inception, with the holdout and worst drawdown marked. */
/** An agent's contribution line: 1 + its share × its return, in its colour. */
export type AgentLine = { id: string; color: AgentColor; values: number[] };

export function FundChart({ vault, lines = [] }: { vault: Fund; lines?: AgentLine[] }) {
  const [log, setLog] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(() => alignSeries(vault.curve, vault.benchmark), [vault.curve, vault.benchmark]);
  const ddMonth = vault.kpis.max_drawdown_month;
  const m = useMemo(
    () => chartModel(points, { log, holdoutCutoff: vault.holdout_cutoff, ddMonth, width: W, height: H }),
    [points, log, vault.holdout_cutoff, ddMonth],
  );

  if (points.length < 2) {
    return (
      <section aria-label="Performance" className="flex min-w-0 flex-col gap-2.5">
        <div className={KICKER}>FUND VS S&amp;P 500</div>
        <div className="border border-line bg-panel p-6 font-mono text-xs text-muted">
          The fund has no equity curve yet.
        </div>
      </section>
    );
  }

  const first = points[0].month;
  const last = points[points.length - 1].month;
  const lastPoint = points[points.length - 1];
  const fromIndex = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return indexAtFraction((e.clientX - r.left) / r.width, m.slots, points.length);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") return setHover(null);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const cur = hover ?? points.length - 1;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? points.length - 1 : cur + (e.key === "ArrowRight" ? 1 : -1);
    setHover(Math.min(Math.max(next, 0), points.length - 1));
  };

  const h = hover === null ? null : points[hover];
  const hx = hover === null ? 0 : m.x(hover);
  const tipLeftSide = hx > W * 0.62;
  const ddRightSide = m.dd !== null && m.dd.x > W * 0.72;
  const holdoutAtEdge = m.holdoutX !== null && m.holdoutX > W * 0.85;
  const summary =
    `The Crew ${formatPct(lastPoint.fund - 1)} against the S&P 500 ` +
    `${lastPoint.spx === null ? "unavailable" : formatPct(lastPoint.spx - 1)}, ${formatMonth(first)} to ${formatMonth(last)}.`;

  return (
    <section aria-label="Performance" className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className={KICKER}>
          FUND VS S&amp;P 500 · {first.slice(0, 4)} → {formatMonth(last).toUpperCase()}
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] leading-none text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 bg-fund" />
            THE CREW
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-spx" />
            S&amp;P 500
          </span>
          <ScaleToggle log={log} onChange={setLog} />
        </div>
      </div>
      <div className="flex flex-1 flex-col border border-line bg-panel px-3 pt-4 pb-[30px] sm:px-4">
        <div
          tabIndex={0}
          role="img"
          aria-label={`Fund equity curve versus the S&P 500. ${summary} Arrow keys inspect months.`}
          onPointerMove={(e) => setHover(fromIndex(e))}
          onPointerDown={(e) => setHover(fromIndex(e))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKey}
          className="relative min-h-[220px] flex-1 cursor-crosshair touch-pan-y outline-none select-none focus-visible:outline-1 focus-visible:outline-offset-[6px] focus-visible:outline-ink sm:min-h-[280px]"
        >
          {m.yTicks.map((t) => (
            <div key={t.value} aria-hidden>
              <div className="absolute inset-x-0 border-t border-line-soft" style={{ top: pctY(t.y) }} />
              <div
                className="absolute left-0 -translate-y-[130%] font-mono text-[10px] leading-none text-faint"
                style={{ top: pctY(t.y) }}
              >
                {t.label}
              </div>
            </div>
          ))}

          {m.holdoutX !== null && (
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 border-l border-dashed border-line-strong"
              style={{
                left: pctX(m.holdoutX),
                background:
                  "repeating-linear-gradient(135deg, color-mix(in oklch, var(--ink) 4%, transparent) 0 1px, transparent 1px 7px)",
              }}
            >
              <div
                className={`absolute top-1 font-mono text-[10px] leading-none font-medium tracking-[0.1em] whitespace-nowrap text-dim ${holdoutAtEdge ? "right-1.5" : "left-1.5"}`}
              >
                HOLDOUT →
              </div>
            </div>
          )}

          <svg
            aria-hidden
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            // Drawn in once on mount; toggling the scale swaps the paths without replaying it.
            className="crew-draw absolute inset-0 size-full overflow-visible"
          >
            <path
              d={m.spxPath}
              fill="none"
              stroke="var(--spx)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
            {lines.map((l) => (
              <path
                key={l.id}
                d={contributionPath(m, l.values)}
                fill="none"
                stroke={agentColorVar(l.color)}
                strokeWidth={1.25}
                strokeOpacity={0.85}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={m.fundPath} fill="none" stroke="var(--fund)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>

          {m.dd && (
            // The drawdown callout waits for the line to reach it.
            <div aria-hidden className="crew-rise" style={{ animationDelay: `${DRAW_MS}ms` }}>
              <div
                className="absolute -mt-1 -ml-1 size-2 rounded-full border-[1.5px] border-fund bg-bg"
                style={{ left: pctX(m.dd.x), top: pctY(m.dd.y) }}
              />
              <div
                className="absolute font-mono text-[10px] leading-[1.3] font-medium whitespace-nowrap text-soft"
                style={{
                  left: pctX(m.dd.x),
                  top: pctY(m.dd.y),
                  transform: ddRightSide ? "translate(calc(-100% - 10px), 6px)" : "translate(10px, 6px)",
                }}
              >
                MAX DD {formatPct(vault.kpis.max_drawdown)}
                <br />
                {formatMonth(points[m.dd.index].month).toUpperCase()}
              </div>
            </div>
          )}

          {m.years.map((y, i) => (
            <div
              key={y.label}
              aria-hidden
              // On a phone every other year keeps the labels from colliding.
              className={`absolute -bottom-[22px] -translate-x-1/2 font-mono text-[10px] leading-none text-faint ${i % 2 ? "max-sm:hidden" : ""}`}
              style={{ left: pctX(y.x) }}
            >
              {y.label}
            </div>
          ))}

          {h && hover !== null && (
            <div aria-hidden className="pointer-events-none">
              <div className="absolute inset-y-0 border-l border-faint" style={{ left: pctX(hx) }} />
              <div
                className="absolute -mt-[4.5px] -ml-[4.5px] size-[9px] rounded-full bg-fund"
                style={{ left: pctX(hx), top: pctY(m.y(h.fund)) }}
              />
              {h.spx !== null && (
                <div
                  className="absolute -mt-[4.5px] -ml-[4.5px] size-[9px] rounded-full border-2 border-spx bg-bg"
                  style={{ left: pctX(hx), top: pctY(m.y(h.spx)) }}
                />
              )}
              <div
                className="absolute top-2 flex min-w-[170px] flex-col gap-[7px] border border-line-strong bg-hover px-3 py-2.5 font-mono text-xs leading-none text-ink"
                style={{
                  left: pctX(hx),
                  transform: tipLeftSide ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
                }}
              >
                <div className="text-[11px] tracking-[0.08em] text-muted">{formatMonth(h.month).toUpperCase()}</div>
                <div className="flex justify-between gap-3.5">
                  <span>THE CREW</span>
                  <span>{formatPct(h.fund - 1)}</span>
                </div>
                <div className="flex justify-between gap-3.5 text-muted">
                  <span>S&amp;P 500</span>
                  <span>{h.spx === null ? "—" : formatPct(h.spx - 1)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <p aria-live="polite" className="sr-only">
          {h
            ? `${formatMonth(h.month)}: The Crew ${formatPct(h.fund - 1)}, S&P 500 ${h.spx === null ? "unavailable" : formatPct(h.spx - 1)}.`
            : ""}
        </p>
      </div>
    </section>
  );
}
