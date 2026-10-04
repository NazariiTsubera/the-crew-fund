"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { TapeRow } from "@/components/floor/tape-row";
import { useFloorData } from "@/components/floor/use-floor-data";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { ErrorState, KICKER, LoadingState, PageBody, PageHeader } from "@/components/war-room/page-frame";
import type { AgentSummary, LogEntry, LogType } from "@/lib/api";
import {
  EMPTY_LOG,
  endOfTape,
  nextCursor,
  replayOrder,
  stepMs,
  TAPE_SPEEDS,
  tapeCount,
  tapePeriod,
  tapeWho,
  visibleRows,
  type TapeSpeed,
} from "@/lib/floor-tape";

const FILE = "FILE 02 // THE FLOOR";
const TITLE = "Live floor";

const TYPES: [LogType, string][] = [
  ["trade", "TRADES"],
  ["risk", "RISK"],
  ["mastermind", "MASTERMIND"],
  ["redteam", "RED TEAM"],
];

const ALL_ON: Record<LogType, boolean> = { trade: true, risk: true, mastermind: true, redteam: true };

const BUTTON =
  "h-7 flex-none cursor-pointer rounded-[2px] border px-2.5 font-mono text-[11px] leading-none font-medium tracking-[0.08em] whitespace-nowrap focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";
const PLAIN = `${BUTTON} border-line-strong bg-transparent text-soft hover:border-ink hover:text-ink`;
const chip = (on: boolean) =>
  `${BUTTON} ${on ? "border-ink bg-ink text-bg" : "border-line-strong bg-transparent text-muted hover:text-ink"}`;

/** FILE 02: the fund's stored log replayed as a tape. Nothing here is live or invented. */
export function LiveFloor() {
  const { data, retry } = useFloorData();

  if (data.status === "ready" && data.log.length > 0) return <Tape log={data.log} crew={data.crew} />;

  return (
    <>
      <PageHeader kicker={FILE} title={TITLE} />
      <PageBody>
        {data.status === "loading" ? (
          <LoadingState />
        ) : (
          <ErrorState error={data.status === "error" ? data.error : EMPTY_LOG} onRetry={retry} />
        )}
      </PageBody>
    </>
  );
}

function Tape({ log, crew }: { log: LogEntry[]; crew: AgentSummary[] }) {
  const ordered = useMemo(() => replayOrder(log), [log]);
  const byId = useMemo(() => new Map(crew.map((a) => [a.id, a])), [crew]);
  const keys = useMemo(() => new Map(ordered.map((e, i) => [e, i])), [ordered]);
  const reduced = useReducedMotion();

  const [types, setTypes] = useState(ALL_ON);
  const show = useMemo(() => (e: LogEntry) => types[e.type], [types]);
  const [cursor, setCursor] = useState(() => nextCursor(ordered, 0, show));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<TapeSpeed>(1);

  // With reduced motion the whole window is shown at once instead of ticking in.
  const at = reduced ? ordered.length : cursor;
  const ended = at >= ordered.length;
  const running = playing && !ended;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setCursor((c) => nextCursor(ordered, c, show)), stepMs(speed));
    return () => clearInterval(timer);
  }, [running, ordered, show, speed]);

  const rows = visibleRows(ordered, at, show);
  const tapeAt = at > 0 ? ordered[at - 1].ts : null;
  const restart = () => {
    setCursor(nextCursor(ordered, 0, show));
    setPlaying(true);
  };

  const state = ended ? "END OF TAPE" : running ? "REPLAY" : "PAUSED";

  return (
    <>
      <PageHeader
        kicker={FILE}
        title={TITLE}
        aside={
          <>
            REPLAY · {tapePeriod(ordered)}
            <br />
            {tapeCount(at, ordered.length).toUpperCase()} ENTRIES REPLAYED
          </>
        }
      />
      <PageBody>
        <section aria-label="Replay tape" className="@container flex max-w-[1100px] min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <div className={`${KICKER} flex items-center gap-2`}>
              <span
                aria-hidden
                className="inline-block size-[7px] flex-none rounded-full"
                style={{
                  background: running ? "var(--up)" : "var(--faint)",
                  animation: running && !reduced ? "crew-blink 1.4s steps(2) infinite" : "none",
                }}
              />
              <span role="status">{state}</span>
              {tapeAt && <span className="text-faint tabular-nums">· TAPE AT {tapeAt}</span>}
            </div>
            {!reduced && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  disabled={ended}
                  className={PLAIN}
                >
                  {running ? "❚❚ PAUSE" : "▶ PLAY"}
                </button>
                <span role="group" aria-label="Replay speed" className="flex rounded-[2px] border border-line-strong">
                  {TAPE_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={speed === s}
                      onClick={() => setSpeed(s)}
                      className={`h-[26px] cursor-pointer px-2.5 font-mono text-[11px] leading-none font-medium tracking-[0.06em] focus-visible:outline focus-visible:outline-ink ${speed === s ? "bg-ink text-bg" : "bg-transparent text-muted hover:text-ink"}`}
                    >
                      {s}×
                    </button>
                  ))}
                </span>
                <button type="button" onClick={restart} className={PLAIN}>
                  ↺ RESTART
                </button>
              </div>
            )}
          </div>

          <div role="group" aria-label="Filter the tape" className="flex flex-wrap gap-1.5">
            {TYPES.map(([type, label]) => (
              <button
                key={type}
                type="button"
                aria-pressed={types[type]}
                onClick={() => setTypes((t) => ({ ...t, [type]: !t[type] }))}
                className={chip(types[type])}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="m-0 max-w-[72ch] text-xs leading-relaxed text-muted">
            The fund&apos;s stored log, replayed oldest first at a steady pace. Every row is a real entry with its
            real timestamp; the data ends at the holdout cutoff, so nothing here is live.
            {reduced && " Reduced motion is on, so the whole window is shown at once."}
          </p>

          {ended && !reduced && (
            <Note>
              {endOfTape(ordered)}. <span className="text-muted">Restart to play it again.</span>
            </Note>
          )}

          <div role="log" aria-live="off" className="border border-line bg-panel">
            {rows.length === 0 ? (
              <div className="px-3.5 py-3.5 font-mono text-xs text-dim">No entries of the selected types in this window.</div>
            ) : (
              rows.map((e, i) => {
                const who = tapeWho(e, byId);
                return (
                  <TapeRow
                    key={keys.get(e)}
                    entry={e}
                    who={who}
                    agent={who.kind === "agent" ? byId.get(who.id) : undefined}
                    fresh={i === 0 && running}
                  />
                );
              })
            )}
          </div>
        </section>
      </PageBody>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="border border-line bg-panel px-3.5 py-2.5 font-mono text-xs leading-snug text-ink shadow-[inset_2px_0_0_var(--accent)]">
      {children}
    </div>
  );
}
