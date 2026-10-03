"use client";

import { agentColorVar, Glyph } from "@/components/glyph";
import { ErrorState, LoadingState, PageBody, PageHeader } from "@/components/war-room/page-frame";
import { useFundData } from "@/components/war-room/use-fund-data";
import type { AgentSummary, Holding } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { bookSummary, sortHoldings } from "@/lib/holdings";

const KICKER = "FILE 03 // THE GOODS";
const HEAD = "font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim";

function WeightBar({ weight, max, tone }: { weight: number; max: number; tone: string }) {
  return (
    <span aria-hidden className="relative h-1 flex-1 bg-flash">
      <span className="absolute inset-y-0 left-0" style={{ width: `${max > 0 ? (weight / max) * 100 : 0}%`, background: tone }} />
    </span>
  );
}

function HeldBy({ agent, id }: { agent: AgentSummary | undefined; id: string | null }) {
  if (!agent) return <span className="text-[13px] text-muted">{id ?? "—"}</span>;
  return (
    <span className="flex items-center gap-2 text-[13px] leading-none text-soft">
      <Glyph shape={agent.shape} color={agent.color} size={10} dim={agent.status === "killed"} />
      {agent.name}
    </span>
  );
}

function Book({ holdings, agents }: { holdings: Holding[]; agents: AgentSummary[] }) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rows = sortHoldings(holdings);
  const { count, total, maxWeight } = bookSummary(rows);
  const toneOf = (h: Holding) => {
    const a = h.agent_id ? byId.get(h.agent_id) : undefined;
    return a ? agentColorVar(a.color) : "var(--faint)";
  };

  if (count === 0) {
    return <div className="border border-line bg-panel p-6 font-mono text-xs text-muted">The book is empty: the fund holds no positions.</div>;
  }

  return (
    <div className="@container border border-line">
      {/* Wide: the design's four-column table. */}
      <table className="hidden w-full border-collapse @2xl:table">
        <thead>
          <tr className={`bg-panel text-left ${HEAD}`}>
            <th scope="col" className="w-[90px] px-4 py-2.5 font-medium">TICKER</th>
            <th scope="col" className="w-[200px] px-4 py-2.5 font-medium">WEIGHT</th>
            <th scope="col" className="w-[190px] px-4 py-2.5 font-medium">HELD BY</th>
            <th scope="col" className="px-4 py-2.5 font-medium">REASON</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={`${h.ticker}-${h.agent_id}`} className="border-t border-line-soft hover:bg-hover">
              <td className="px-4 py-[11px] font-mono text-[13px] leading-none font-semibold">{h.ticker}</td>
              <td className="px-4 py-[11px]">
                <span className="flex items-center gap-2.5">
                  <span className="w-11 font-mono text-[13px] leading-none font-medium">{h.weight.toFixed(3)}</span>
                  <WeightBar weight={h.weight} max={maxWeight} tone={toneOf(h)} />
                </span>
              </td>
              <td className="px-4 py-[11px]">
                <HeldBy agent={h.agent_id ? byId.get(h.agent_id) : undefined} id={h.agent_id} />
              </td>
              <td className="px-4 py-[11px] font-mono text-xs leading-[1.4] break-words text-muted">{h.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Narrow: one card per position so a phone never scrolls sideways. */}
      <ul className="m-0 list-none p-0 @2xl:hidden" aria-label="Positions">
        {rows.map((h) => (
          <li key={`${h.ticker}-${h.agent_id}`} className="flex flex-col gap-2 border-t border-line-soft px-3.5 py-3 first:border-t-0">
            <span className="flex items-center gap-3">
              <span className="w-14 font-mono text-[13px] leading-none font-semibold">{h.ticker}</span>
              <span className="w-11 font-mono text-[13px] leading-none font-medium">{h.weight.toFixed(3)}</span>
              <WeightBar weight={h.weight} max={maxWeight} tone={toneOf(h)} />
            </span>
            <HeldBy agent={h.agent_id ? byId.get(h.agent_id) : undefined} id={h.agent_id} />
            {h.reason && <span className="font-mono text-xs leading-[1.4] break-words text-muted">{h.reason}</span>}
          </li>
        ))}
      </ul>

      <div className="border-t border-line bg-panel px-4 py-3 font-mono text-[11px] leading-snug tracking-[0.06em] text-muted">
        {count} {count === 1 ? "position" : "positions"} · weights sum to {total.toFixed(2)} · long-only
      </div>
    </div>
  );
}

/** Holdings (FILE 03): the fund's latest book, each position with the agent holding it and why. */
export function HoldingsView() {
  const { vault, retry } = useFundData({ withCapital: false });
  const month = vault.status === "ready" ? ` · ${formatMonth(vault.data.as_of).toUpperCase()}` : "";
  return (
    <>
      <PageHeader kicker={`${KICKER}${month}`} title="Holdings" />
      <PageBody>
        {vault.status === "loading" && <LoadingState />}
        {vault.status === "error" && <ErrorState error={vault.error} onRetry={retry} />}
        {vault.status === "ready" && <Book holdings={vault.data.holdings} agents={vault.data.agents} />}
      </PageBody>
    </>
  );
}
