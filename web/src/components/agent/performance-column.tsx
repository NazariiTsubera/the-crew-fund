"use client";

import { useEffect, useMemo, useState } from "react";

import { BookTable } from "@/components/agent/book-table";
import { EquityChart } from "@/components/agent/equity-chart";
import { KpiTiles } from "@/components/agent/kpi-tiles";
import { LogFeed } from "@/components/agent/log-feed";
import { RedTeamCard } from "@/components/agent/red-team-card";
import { statusDotStyle } from "@/components/agent/tags";
import { isFired, statusLabel } from "@/lib/agent-status";
import { VerdictBadge } from "@/components/agent/verdict-badge";
import { Glyph, agentColorVar } from "@/components/glyph";
import { entriesInMonth, lastTwelveMonths } from "@/lib/agent-log";
import { api, type Agent, type LogEntry } from "@/lib/api";
import { lastMonthReturn, monthEnds } from "@/lib/curve";
import { formatMonth, formatPct } from "@/lib/format";

type LogState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; entries: LogEntry[] };

function toneOf(x: number): string {
  return x > 0.00005 ? "var(--up)" : x < -0.00005 ? "var(--down)" : "var(--muted)";
}

function useAgentLog(id: string): LogState {
  const [state, setState] = useState<LogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    api.agentLog(id, {}, controller.signal).then(
      (entries) => setState({ status: "ready", entries }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [id]);
  return state;
}

// The holdout cutoff lives on /vault; without it the chart simply has no marker.
function useHoldoutCutoff(): string | null {
  const [cutoff, setCutoff] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.vault(controller.signal).then(
      (v) => setCutoff(v.holdout_cutoff),
      () => {},
    );
    return () => controller.abort();
  }, []);
  return cutoff;
}

export function PerformanceColumn({ agent, className = "" }: { agent: Agent; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const log = useAgentLog(agent.id);
  const holdoutCutoff = useHoldoutCutoff();
  const killed = agent.status === "killed";
  const tone = killed ? "var(--faint)" : agentColorVar(agent.color);

  const latest = lastMonthReturn(agent.curve);
  const lastMonth = useMemo(() => monthEnds(agent.curve).at(-1)?.month ?? null, [agent.curve]);

  const logScope = selected
    ? formatMonth(selected).toUpperCase()
    : lastMonth
      ? `LAST 12 MONTHS TO ${formatMonth(lastMonth).toUpperCase()}`
      : "LAST 12 MONTHS";
  const logState: LogState =
    log.status !== "ready"
      ? log
      : {
          status: "ready",
          entries: selected
            ? entriesInMonth(log.entries, selected)
            : lastMonth
              ? lastTwelveMonths(log.entries, lastMonth)
              : [],
        };

  return (
    <section aria-label="Performance" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className={`flex flex-wrap items-start gap-4 px-4 pt-5 sm:px-7 ${killed ? "opacity-75" : ""}`}>
        <div className="grid size-[52px] flex-none place-items-center border border-line-strong">
          <Glyph shape={agent.shape} color={agent.color} dim={killed} size={22} />
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-[7px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={`m-0 text-2xl leading-tight font-medium ${killed ? "text-muted" : ""}`}>{agent.name}</h1>
            <VerdictBadge redteam={agent.redteam} />
          </div>
          <div className="text-[13px] leading-snug text-pretty text-muted">{agent.strategy_line}</div>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] leading-none text-muted sm:basis-auto sm:flex-col sm:items-end">
          <span className="flex items-center gap-[7px] text-ink">
            <span style={statusDotStyle(agent.status)} />
            {statusLabel(agent)}
          </span>
          {killed && agent.stop_month && (
            <span className="text-down">
              {isFired(agent) ? "FIRED BY THE MASTERMIND" : "STOPPED"} {formatMonth(agent.stop_month).toUpperCase()}
            </span>
          )}
          {latest && (
            <span title="The latest month's return from the stored curve; the store has no intraday P&L.">
              {formatMonth(latest.month).toUpperCase()}{" "}
              <span style={{ color: killed ? "var(--dim)" : toneOf(latest.value) }}>{formatPct(latest.value, 2)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4 pt-5 pb-9 sm:px-7">
        <KpiTiles agent={agent} />
        <EquityChart
          curve={agent.curve}
          benchmark={agent.benchmark}
          tone={tone}
          holdoutCutoff={holdoutCutoff}
          selected={selected}
          onSelect={setSelected}
        />
        <RedTeamCard redteam={agent.redteam} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
          <BookTable
            holdings={agent.holdings}
            holdingsMonth={agent.holdings_month}
            selected={selected}
            tone={tone}
            stopMonth={agent.stop_month}
          />
          <LogFeed scope={logScope} state={logState} onClear={selected ? () => setSelected(null) : undefined} />
        </div>
      </div>
    </section>
  );
}
