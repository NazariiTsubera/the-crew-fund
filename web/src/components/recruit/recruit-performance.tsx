import type { RecruitState } from "@/lib/recruit";

function placeholder(state: RecruitState): { kicker: string; text: string } {
  if (state.stored) return { kicker: "OPENING THE FILE…", text: `Reading ${state.stored.name}'s backtest, book and Red Team verdict.` };
  switch (state.stage) {
    case "compiling":
      return { kicker: "COMPILING RECIPE…", text: "Turning your words into features, weights and filters." };
    case "backtesting":
      return { kicker: "BACKTESTING 2017–2026…", text: `Running ${state.name ?? "the recipe"} month by month, point in time.` };
    case "redteam":
      return { kicker: "RED TEAM ATTACKING…", text: "The Red Team is trying to break the backtest before it trades." };
    default:
      return { kicker: "NO AGENT YET", text: "No agent yet. Its nine-year backtest and Red Team verdict will appear here." };
  }
}

/** The Performance column until GET /agents/{id} lands: what the stream is doing right now. */
export function RecruitPerformance({ state, className = "" }: { state: RecruitState; className?: string }) {
  const { kicker, text } = placeholder(state);
  return (
    <section aria-label="Performance" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className="m-4 flex min-h-[420px] flex-1 flex-col items-center justify-center gap-3 border border-dashed border-line-strong p-10 text-center sm:m-7">
        <div className="font-mono text-[10px] leading-none font-medium tracking-[0.14em] text-dim">{kicker}</div>
        <div className="max-w-[360px] text-sm leading-normal text-pretty text-muted">{text}</div>
      </div>
    </section>
  );
}
