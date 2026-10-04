"use client";

import { useEffect, useState } from "react";

import { agentColorVar, Glyph } from "@/components/glyph";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { KICKER } from "@/components/war-room/page-frame";
import { SplitEditor } from "@/components/war-room/split-editor";
import type { Load } from "@/components/war-room/use-fund-data";
import type { AgentSummary, Capital } from "@/lib/api";
import { clampIndex, formatChange, replayStart, shareRows, type ShareRow } from "@/lib/capital";
import { formatMonth, formatShare } from "@/lib/format";

const REPLAY_MONTHS = 24;
const REPLAY_STEP_MS = 450;

function changeTone(row: ShareRow, fired: boolean): string {
  if (fired) return "var(--down)";
  if (row.change === null || Math.abs(row.change) < 0.05) return "var(--dim)";
  return row.change > 0 ? "var(--up)" : "var(--down)";
}

type Props = {
  agents: AgentSummary[];
  capital: Load<Capital>;
  latestMemo: string | null;
  /** Reloads the fund after the judge saves a new split. */
  onSplitSaved?: () => void;
};

/** "Who runs the money": each agent's slice of capital, month by month, from GET /capital. */
export function CapitalPanel({ agents, capital, latestMemo, onSplitSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const months = capital.status === "ready" ? capital.data.months : [];
  const count = months.length;
  // null follows the latest month, so a refetch that adds a month keeps the panel current.
  const [picked, setPicked] = useState<number | null>(null);
  const [replayRequested, setReplaying] = useState(false);
  const reduced = useReducedMotion();
  // The history arrives after the panel mounts; the first time it does, play the replay once so
  // the split is seen moving through real months. Set during render, React's pattern for state
  // that follows props, so the first painted frame is already the replay's start.
  const [autoplayed, setAutoplayed] = useState(false);
  if (!autoplayed && count > 1) {
    setAutoplayed(true);
    if (!reduced) {
      setPicked(replayStart(count, REPLAY_MONTHS));
      setReplaying(true);
    }
  }
  const index = picked === null ? count - 1 : clampIndex(picked, count);
  // A replay ends by itself on reaching the latest month.
  const replaying = replayRequested && index < count - 1;

  useEffect(() => {
    if (!replaying) return;
    const id = setInterval(() => setPicked((i) => (i ?? count - 1) + 1), REPLAY_STEP_MS);
    return () => clearInterval(id);
  }, [replaying, count]);

  const toggleReplay = () => {
    if (replaying) return setReplaying(false);
    setPicked(replayStart(count, REPLAY_MONTHS));
    setReplaying(true);
  };

  const byId = new Map(agents.map((a) => [a.id, a]));
  // Agents the history knows but the vault no longer lists still held capital back then.
  const ids = agents.map((a) => a.id);
  for (const m of months) for (const id of Object.keys(m.shares)) if (!byId.has(id) && !ids.includes(id)) ids.push(id);

  const history = count > 0;
  const month = history ? months[index] : null;
  const rows: ShareRow[] = history
    ? shareRows(months, index, ids)
    : agents.map((a) => ({ id: a.id, share: a.capital_share, change: null }));

  return (
    <section aria-label="Who runs the money" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className={KICKER}>WHO RUNS THE MONEY · YOU DO</div>
        <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          className="h-[26px] flex-none cursor-pointer rounded-[2px] border border-accent bg-transparent px-2.5 font-mono text-[10.5px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-accent hover:bg-accent hover:text-on-accent"
        >
          {editing ? "CLOSE" : "SET SPLIT"}
        </button>
        {history && count > 1 && (
          <button
            type="button"
            onClick={toggleReplay}
            aria-pressed={replaying}
            className="h-[26px] flex-none cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-2.5 font-mono text-[10.5px] leading-none font-medium tracking-[0.08em] whitespace-nowrap text-soft hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {replaying ? "■ STOP" : `▶ REPLAY ${Math.min(REPLAY_MONTHS, count)}M`}
          </button>
        )}
        </div>
      </div>
      <div className="flex flex-col gap-3.5 border border-line bg-panel p-4">
        {editing && (
          <SplitEditor
            agents={agents}
            onSaved={() => {
              setEditing(false);
              onSplitSaved?.();
            }}
          />
        )}
        <div className="flex items-baseline justify-between gap-3 font-mono text-xs leading-none font-medium tracking-[0.06em]">
          <span aria-live={replaying ? "off" : "polite"}>
            {month ? formatMonth(month.month).toUpperCase() : "LATEST"}
            {month && <span className="ml-2 text-[10px] text-dim">· {formatShare(month.invested)} INVESTED</span>}
          </span>
          <span className="text-[10px] text-dim">CAPITAL SHARE</span>
        </div>

        <div className="flex h-[30px] gap-0.5" role="img" aria-label="Capital share by agent">
          {rows
            .filter((r) => r.share > 0.001)
            .map((r) => {
              const a = byId.get(r.id);
              const killed = (a?.status === "killed" || a?.status === "fired");
              return (
                <div
                  key={r.id}
                  title={`${a?.name ?? r.id} ${(r.share * 100).toFixed(1)}%`}
                  className="flex items-center overflow-hidden pl-1 motion-safe:transition-[width] motion-safe:duration-500"
                  style={{
                    width: `${r.share * 100}%`,
                    background: killed || !a ? "var(--faint)" : agentColorVar(a.color),
                  }}
                >
                  {r.share > 0.07 && (
                    <span className="bg-bg px-1 py-[3px] font-mono text-[10px] leading-none font-semibold text-ink">
                      {Math.round(r.share * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => {
            const a = byId.get(r.id);
            // A 0 share is the judge benching the agent; nothing is fired automatically.
            const out = r.share < 0.001;
            return (
              <li
                key={r.id}
                className="grid grid-cols-[14px_minmax(0,1fr)_54px_78px] items-center gap-2.5 border-t border-line-soft py-2"
                style={{ opacity: r.share < 0.001 ? 0.45 : 1 }}
              >
                {a ? <Glyph shape={a.shape} color={a.color} size={11} dim={(a.status === "killed" || a.status === "fired")} /> : <span />}
                <span className="truncate text-[13px] leading-[1.2] font-medium">{a?.name ?? r.id}</span>
                <span className="text-right font-mono text-[13px] leading-none font-medium">
                  {(r.share * 100).toFixed(1)}%
                </span>
                <span
                  className="text-right font-mono text-[11px] leading-none font-medium whitespace-nowrap"
                  style={{ color: changeTone(r, out) }}
                >
                  {out ? "BENCHED" : formatChange(r.change)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          {history && count > 1 && (
            <>
              <input
                type="range"
                min={0}
                max={count - 1}
                value={index}
                onChange={(e) => {
                  setReplaying(false);
                  const i = Number(e.target.value);
                  setPicked(i === count - 1 ? null : i);
                }}
                aria-label="Allocation month"
                aria-valuetext={month ? formatMonth(month.month) : undefined}
                className="m-0 w-full accent-accent"
              />
              <div className="mb-1.5 flex justify-between font-mono text-[10px] leading-none text-faint">
                <span>{formatMonth(months[0].month).toUpperCase()}</span>
                <span>{formatMonth(months[count - 1].month).toUpperCase()}</span>
              </div>
            </>
          )}
          {capital.status === "error" && (
            <div className="mb-1.5 font-mono text-[11px] leading-snug text-muted">
              History unavailable ({capital.error.title}); showing today&apos;s split from the vault.
            </div>
          )}
          <div className="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim">MASTERMIND</div>
          <div className="font-mono text-xs leading-[1.45] text-soft">{latestMemo ?? "No capital moves yet."}</div>
        </div>
      </div>
    </section>
  );
}
