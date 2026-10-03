import type { ReactNode } from "react";

import type { Fund } from "@/lib/api";
import { formatMonth, formatNum, formatPct, formatShare } from "@/lib/format";

function Tile({ label, value, tone, children }: { label: string; value: string; tone?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 bg-panel px-[18px] py-4">
      <div className="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-muted">{label}</div>
      <div className="font-mono text-[26px] leading-none font-medium sm:text-[30px]" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="font-mono text-xs leading-none text-muted">{children}</div>
    </div>
  );
}

/** The four headline figures: return, Sharpe, worst drawdown and how much of the book is invested. */
export function KpiTiles({ vault }: { vault: Fund }) {
  const { kpis, spx_kpis: spx, invested_fraction: invested } = vault;
  const since = vault.curve[0]?.date.slice(0, 4);
  const pct = Math.min(Math.max(invested, 0), 1) * 100;
  return (
    // Two by two until the content area fits all four in a row, as the design's flex pairs do.
    <div className="@container">
      <div className="grid grid-cols-2 gap-px border border-line bg-line @3xl:grid-cols-4">
        <Tile label={since ? `TOTAL RETURN · SINCE ${since}` : "TOTAL RETURN"} value={formatPct(kpis.total_return)} tone="var(--fund)">
          S&amp;P 500 {formatPct(spx.total_return)}
        </Tile>
        <Tile label="SHARPE RATIO" value={formatNum(kpis.sharpe)}>
          S&amp;P 500 {formatNum(spx.sharpe)}
        </Tile>
        <Tile label="MAX DRAWDOWN" value={formatPct(kpis.max_drawdown)}>
          {kpis.max_drawdown_month ? formatMonth(kpis.max_drawdown_month).toUpperCase() : "—"}
        </Tile>
        <Tile label="INVESTED" value={formatShare(invested)}>
          <span className="flex items-center gap-2.5">
            <span
              role="img"
              aria-label={`${formatShare(invested)} invested, ${formatShare(1 - invested)} cash`}
              className="relative h-1 flex-1 bg-line"
            >
              <span className="absolute inset-y-0 left-0 bg-fund" style={{ width: `${pct}%` }} />
            </span>
            <span className="whitespace-nowrap">{formatShare(1 - invested)} cash</span>
          </span>
        </Tile>
      </div>
    </div>
  );
}
