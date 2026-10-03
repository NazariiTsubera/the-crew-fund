import { Tag } from "@/components/agent/tags";
import { agentColorVar, Glyph } from "@/components/glyph";
import { logTag } from "@/lib/agent-log";
import type { AgentSummary, LogEntry } from "@/lib/api";
import type { TapeWho } from "@/lib/floor-tape";

type Props = {
  entry: LogEntry;
  who: TapeWho;
  agent: AgentSummary | undefined;
  /** The row just revealed: tinted, then fades back as the next one arrives. */
  fresh: boolean;
};

// The design's mmGlyph: fund-wide entries (Mastermind, Red Team) wear the accent square.
function HouseGlyph() {
  return <span aria-hidden className="inline-block size-[11px] flex-none rounded-[2px] bg-accent" />;
}

/** One replayed log entry: its real timestamp, who wrote it, the design's tag and the text. */
export function TapeRow({ entry, who, agent, fresh }: Props) {
  const tone = agent ? agentColorVar(agent.color) : "var(--accent)";
  return (
    <div
      className="grid grid-cols-[14px_minmax(0,1fr)_46px] items-center gap-x-2.5 gap-y-1.5 border-t border-line-soft px-3.5 py-2.5 transition-[background] duration-[1200ms] ease-out first:border-t-0 motion-reduce:transition-none @2xl:grid-cols-[118px_14px_128px_46px_minmax(0,1fr)]"
      style={{ background: fresh ? `color-mix(in oklch, ${tone} 16%, transparent)` : "transparent" }}
    >
      <span className="col-span-3 font-mono text-[11px] leading-none whitespace-nowrap text-dim tabular-nums @2xl:col-span-1">
        {entry.ts}
      </span>
      <span className="grid place-items-center">
        {who.kind === "agent" && agent ? (
          <Glyph shape={agent.shape} color={agent.color} size={11} dim={agent.status === "killed"} />
        ) : (
          <HouseGlyph />
        )}
      </span>
      <span className="truncate text-xs leading-tight font-medium text-ink">{who.name}</span>
      <Tag kind={logTag(entry)} />
      <span className="col-span-3 font-mono text-xs leading-snug break-words text-soft @2xl:col-span-1">
        {entry.text}
      </span>
    </div>
  );
}
