import type { Agent } from "@/lib/api";
import { benchmarkReturnAt } from "@/lib/equity-chart";
import { formatMonth, formatNum, formatPct, formatShare } from "@/lib/format";

const DASH = "—";

const TREND = { up: "▲ rising", down: "▼ falling", flat: "— flat" } as const;

function lastDate(agent: Agent): string | null {
  let last: string | null = null;
  for (const p of agent.curve) if (!last || p.date > last) last = p.date;
  return last;
}

export function KpiTiles({ agent }: { agent: Agent }) {
  const k = agent.kpis;
  const end = lastDate(agent);
  const spx = end ? benchmarkReturnAt(agent.benchmark, end) : null;
  const tiles: [string, string, string][] = [
    ["TOTAL RETURN", formatPct(k.total_return), spx === null ? "" : `S&P ${formatPct(spx)}`],
    ["ANN. RETURN", formatPct(k.ann_return), ""],
    ["ANN. VOL", formatShare(k.ann_vol, 1), ""],
    ["SHARPE", formatNum(k.sharpe), `12M ${k.trailing_12m_sharpe === null ? DASH : formatNum(k.trailing_12m_sharpe)}`],
    ["MAX DRAWDOWN", formatPct(k.max_drawdown), k.max_drawdown_month ? formatMonth(k.max_drawdown_month).toUpperCase() : ""],
    ["CAPITAL SHARE", formatShare(agent.capital_share, 1), TREND[agent.capital_trend]],
    ["TURNOVER", k.turnover === null ? DASH : `${formatShare(k.turnover)}/mo`, ""],
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,128px),1fr))] gap-2">
      {tiles.map(([label, value, sub]) => (
        <div key={label} className="flex flex-col gap-2 rounded-[2px] border border-line bg-panel px-3.5 py-3">
          <span className="font-mono text-[9.5px] leading-none font-medium tracking-[0.12em] text-dim">{label}</span>
          <span className="font-mono text-[19px] leading-none font-medium">{value}</span>
          <span className="min-h-2.5 font-mono text-[10px] leading-none text-dim">{sub}</span>
        </div>
      ))}
    </div>
  );
}
