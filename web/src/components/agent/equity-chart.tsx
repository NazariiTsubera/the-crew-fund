"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { CurvePoint } from "@/lib/api";
import { equityChart, nearestMonth, type ChartMonth } from "@/lib/equity-chart";
import { formatMonth, formatPct } from "@/lib/format";

const W = 1000;
const H = 300;

type Props = {
  curve: CurvePoint[];
  benchmark: CurvePoint[];
  tone: string;
  holdoutCutoff: string | null;
  selected: string | null;
  onSelect: (month: string | null) => void;
  /** A what-if run of an edited recipe, drawn dashed on the same axes. */
  variant?: CurvePoint[] | null;
};

const pctOf = (v: number, of: number) => `${(v / of) * 100}%`;

/** Equity vs the S&P 500 on a log axis; clicking a month filters the book and log below. */
export function EquityChart({ curve, benchmark, tone, holdoutCutoff, selected, onSelect, variant = null }: Props) {
  const chart = useMemo(
    () => equityChart(curve, benchmark, { width: W, height: H, holdoutCutoff, holdoutDays: 30, variant }),
    [curve, benchmark, holdoutCutoff, variant],
  );
  const [hover, setHover] = useState<ChartMonth | null>(null);
  const sel = selected ? (chart.months.find((m) => m.month === selected) ?? null) : null;

  function monthAt(e: MouseEvent<HTMLDivElement>): ChartMonth | null {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return null;
    return nearestMonth(chart.months, ((e.clientX - rect.left) / rect.width) * W);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const months = chart.months;
    if (!months.length) return;
    const i = sel ? months.indexOf(sel) : months.length - 1;
    if (e.key === "ArrowLeft") onSelect(months[Math.max(0, i - (sel ? 1 : 0))].month);
    else if (e.key === "ArrowRight") onSelect(months[Math.min(months.length - 1, i + 1)].month);
    else if (e.key === "Escape") onSelect(null);
    else return;
    e.preventDefault();
  }

  const tipLeftSide = hover ? hover.x > W * 0.6 : false;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-dim">
          EQUITY VS S&amp;P 500 · CLICK A MONTH
        </div>
        <div className="flex items-center gap-3.5 font-mono text-[11px] leading-none text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: tone }} />
            AGENT
          </span>
          {variant && (
            <span className="flex items-center gap-1.5 text-ink">
              <span className="w-4 border-t-2 border-dashed border-accent" />
              WHAT-IF
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-spx" />
            S&amp;P 500
          </span>
        </div>
      </div>
      <div className="border border-line bg-panel px-4 pt-6 pb-[30px]">
        <div
          tabIndex={0}
          role="img"
          aria-label="Agent equity curve against the S&P 500. Click or use the arrow keys to select a month."
          onMouseMove={(e) => setHover(monthAt(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const m = monthAt(e);
            if (m) onSelect(m.month === selected ? null : m.month);
          }}
          onKeyDown={onKeyDown}
          className="relative h-[220px] cursor-pointer outline-none focus-visible:outline focus-visible:outline-offset-[6px] focus-visible:outline-ink wide:h-[240px]"
        >
          {chart.yTicks.map((t) => (
            <div key={t.value}>
              <div className="absolute inset-x-0 border-t border-line-soft" style={{ top: pctOf(t.y, H) }} />
              <div
                className="absolute left-0 -translate-y-[130%] font-mono text-[10px] leading-none text-faint"
                style={{ top: pctOf(t.y, H) }}
              >
                {t.value === 1 ? "0%" : formatPct(t.value - 1, 0)}
              </div>
            </div>
          ))}
          {chart.holdout && (
            <div
              className="absolute inset-y-0 right-0 border-l border-dashed border-line-strong"
              style={{
                left: pctOf(chart.holdout.x, W),
                background:
                  "repeating-linear-gradient(135deg, color-mix(in oklch, var(--ink) 6%, transparent) 0 1px, transparent 1px 7px)",
              }}
              title={`Holdout: sealed from ${chart.holdout.date}`}
            >
              <span className="absolute -top-4 right-0 font-mono text-[9px] leading-none tracking-[0.1em] whitespace-nowrap text-faint">
                HOLDOUT
              </span>
            </div>
          )}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="crew-draw absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            <path
              d={chart.benchPath}
              fill="none"
              stroke="var(--spx)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
            <path d={chart.mainPath} fill="none" stroke={tone} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {chart.variantPath && (
              <path
                d={chart.variantPath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="6 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {sel && (
            <>
              <div className="absolute inset-y-0 border-l" style={{ left: pctOf(sel.x, W), borderColor: tone }} />
              <div
                className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full"
                style={{ left: pctOf(sel.x, W), top: pctOf(sel.y, H), background: tone }}
              />
              <div
                className="absolute -top-[18px] -translate-x-1/2 bg-accent px-[5px] py-[3px] font-mono text-[10px] leading-none font-semibold whitespace-nowrap text-on-accent"
                style={{ left: `clamp(32px, ${pctOf(sel.x, W)}, calc(100% - 32px))` }}
              >
                {formatMonth(sel.month).toUpperCase()}
              </div>
            </>
          )}
          {chart.years.map((y) => (
            <div
              key={y.label}
              className="absolute -bottom-[22px] -translate-x-1/2 font-mono text-[10px] leading-none text-faint"
              style={{ left: pctOf(y.x, W) }}
            >
              {/* Every other year on a phone, so the labels never collide. */}
              <span className={Number(y.label) % 2 ? "hidden sm:inline" : ""}>{y.label}</span>
            </div>
          ))}
          {hover && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 border-l border-faint"
                style={{ left: pctOf(hover.x, W) }}
              />
              <div
                className="pointer-events-none absolute top-2 z-10 flex min-w-[160px] flex-col gap-1.5 border border-line-strong bg-hover px-[11px] py-[9px] font-mono text-xs leading-none"
                style={{
                  left: pctOf(hover.x, W),
                  transform: tipLeftSide ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
                }}
              >
                <div className="text-[11px] tracking-[0.08em] text-muted">
                  {formatMonth(hover.month).toUpperCase()} · CLICK TO SELECT
                </div>
                <div className="flex justify-between gap-3.5">
                  <span>AGENT</span>
                  <span>{formatPct(hover.value - 1)}</span>
                </div>
                {hover.bench !== null && (
                  <div className="flex justify-between gap-3.5 text-muted">
                    <span>S&amp;P 500</span>
                    <span>{formatPct(hover.bench - 1)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
