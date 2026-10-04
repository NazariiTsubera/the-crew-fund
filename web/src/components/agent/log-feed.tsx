import { Tag } from "@/components/agent/tags";
import { logTag } from "@/lib/agent-log";
import type { LogEntry } from "@/lib/api";

type Props = {
  scope: string;
  state: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; entries: LogEntry[] };
  onClear?: () => void;
};

export function LogFeed({ scope, state, onClear }: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-dim">
        <span>LOG · {scope}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-[0.12em] text-soft underline underline-offset-[3px] hover:text-ink"
          >
            LAST 12M
          </button>
        )}
      </div>
      {/* A zero basis: beside the book the log takes the book's height and scrolls,
          rather than setting the row's height itself; alone on a phone it keeps a minimum. */}
      <div role="log" className="min-h-[260px] grow basis-0 overflow-y-auto border border-line">
        {state.status === "loading" && <div className="px-3 py-3.5 font-mono text-xs text-dim">Loading the log…</div>}
        {state.status === "error" && (
          <div className="px-3 py-3.5 font-mono text-xs leading-snug text-down">API offline · {state.message}</div>
        )}
        {state.status === "ready" && state.entries.length === 0 && (
          <div className="px-3 py-3.5 font-mono text-xs leading-snug text-dim">No log entries in this window.</div>
        )}
        {state.status === "ready" &&
          state.entries.map((e, i) => (
            <div
              key={`${e.ts}-${i}`}
              className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-2.5 border-t border-line-soft px-3 py-2 font-mono text-xs leading-snug first:border-t-0"
            >
              <Tag kind={logTag(e)} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] leading-none text-faint">{e.ts}</span>
                <span className="break-words text-soft">{e.text}</span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
