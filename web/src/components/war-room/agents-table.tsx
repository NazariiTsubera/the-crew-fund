import Link from "next/link";

import { agentColorVar, Glyph } from "@/components/glyph";
import { AgentStatus, VerdictBadge } from "@/components/war-room/badges";
import { statusLabel } from "@/lib/agent-status";
import { KICKER } from "@/components/war-room/page-frame";
import { Sparkline } from "@/components/war-room/sparkline";
import type { AgentSummary } from "@/lib/api";
import { sortCrew } from "@/lib/crew";
import { formatNum, formatShare } from "@/lib/format";

const COLS = "grid-cols-[24px_minmax(200px,1fr)_120px_70px_100px_110px]";
// Each row's sparkline starts a beat after the one above, so the crew reads in rank order.
const SPARK_STAGGER_MS = 70;
const HEAD ="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim";

const TREND = {
  up: { arrow: "▲", tone: "var(--up)", word: "rising" },
  down: { arrow: "▼", tone: "var(--down)", word: "falling" },
  flat: { arrow: "—", tone: "var(--dim)", word: "flat" },
} as const;

function sharpeOf(a: AgentSummary): string {
  const s = a.kpis.trailing_12m_sharpe;
  return (a.status === "killed" || a.status === "fired") || s === null ? "—" : formatNum(s);
}

function Capital({ a }: { a: AgentSummary }) {
  const t = TREND[a.capital_trend];
  const killed = (a.status === "killed" || a.status === "fired");
  return (
    <span className="flex items-center justify-end gap-1.5 font-mono text-sm leading-none font-medium">
      {formatShare(a.capital_share, 1)}
      <span aria-hidden className="w-2.5 text-[10px]" style={{ color: t.tone }}>
        {killed ? "" : t.arrow}
      </span>
      {!killed && <span className="sr-only">, {t.word}</span>}
    </span>
  );
}

/** Every agent: who it is, how it is doing over the last year, its capital and its Red Team verdict. */
export function AgentsTable({
  agents,
  slots,
  shown,
  onShow,
}: {
  agents: AgentSummary[];
  slots: number;
  /** Agents whose line is drawn on the fund chart; the checkboxes are its legend. */
  shown?: Set<string>;
  onShow?: (ids: Set<string>) => void;
}) {
  const crew = sortCrew(agents);
  const all = shown !== undefined && crew.every((a) => shown.has(a.id));
  const toggle = (id: string) => {
    if (!shown || !onShow) return;
    const next = new Set(shown);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onShow(next);
  };
  const Check = ({ a }: { a: AgentSummary }) =>
    shown && onShow ? (
      <label className="grid w-10 flex-none cursor-pointer place-items-center self-stretch" title="Show on the fund chart">
        <input
          type="checkbox"
          checked={shown.has(a.id)}
          onChange={() => toggle(a.id)}
          aria-label={`Show ${a.name} on the fund chart`}
          className="size-3.5 cursor-pointer"
          style={{ accentColor: agentColorVar(a.color) }}
        />
      </label>
    ) : null;
  return (
    <section aria-label="Agents" className="@container flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={KICKER}>
          THE CREW · {crew.length} {crew.length === 1 ? "AGENT" : "AGENTS"}
        </div>
        <div className="font-mono text-[11px] leading-none text-faint">SHARPE TRAILING 12M</div>
      </div>
      {crew.length === 0 ? (
        <div className="border border-line bg-panel p-6 font-mono text-xs text-muted">No agents yet.</div>
      ) : (
        <div className="border border-line">
          <div className="flex bg-panel">
          {shown && onShow && (
            <label className="hidden w-10 flex-none cursor-pointer place-items-center @2xl:grid" title="Show all on the fund chart">
              <input
                type="checkbox"
                checked={all}
                onChange={() => onShow(all ? new Set() : new Set(crew.map((a) => a.id)))}
                aria-label="Show every agent on the fund chart"
                className="size-3.5 cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
              />
            </label>
          )}
          <div className={`hidden flex-1 gap-4 py-2.5 pr-4 @2xl:grid ${shown && onShow ? "pl-0" : "pl-4"} ${COLS} ${HEAD}`}>
            <span />
            <span>AGENT</span>
            <span>CURVE</span>
            <span className="text-right">SHARPE</span>
            <span className="text-right">CAPITAL</span>
            <span>RED TEAM</span>
          </div>
          </div>
          <ul className="m-0 list-none p-0">
            {crew.map((a, i) => {
              const killed = (a.status === "killed" || a.status === "fired");
              const tone = killed ? "var(--faint)" : agentColorVar(a.color);
              return (
                <li key={a.id} className="flex border-t border-line-soft first:border-t-0 @2xl:first:border-t">
                  <Check a={a} />
                  <Link
                    href={`/agents/${encodeURIComponent(a.id)}`}
                    aria-label={`${a.name}, ${statusLabel(a)}, Red Team ${a.verdict}, capital ${formatShare(a.capital_share, 1)}`}
                    className="block min-w-0 flex-1 text-ink no-underline outline-none hover:bg-hover focus-visible:bg-hover focus-visible:shadow-[inset_2px_0_0_var(--accent)]"
                    style={{ opacity: killed ? 0.5 : 1 }}
                  >
                    {/* Wide: the design's six-column row. */}
                    <div className={`hidden items-center gap-4 py-[13px] pr-4 @2xl:grid ${shown && onShow ? "pl-0" : "pl-4"} ${COLS}`}>
                      <Glyph shape={a.shape} color={a.color} size={13} dim={killed} />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex items-center gap-2.5">
                          <span className="truncate text-sm leading-[1.2] font-semibold">{a.name}</span>
                          <AgentStatus agent={a} />
                        </span>
                        <span className="text-xs leading-[1.35] text-muted">{a.strategy_line}</span>
                      </span>
                      <Sparkline values={a.spark} slots={slots} tone={tone} delayMs={i * SPARK_STAGGER_MS} />
                      <span className="text-right font-mono text-sm leading-none font-medium">{sharpeOf(a)}</span>
                      <Capital a={a} />
                      <span>
                        <VerdictBadge verdict={a.verdict} />
                      </span>
                    </div>
                    {/* Narrow: the same facts stacked so nothing scrolls sideways on a phone. */}
                    <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-3.5 py-3 @2xl:hidden">
                      <span className="pt-[3px]">
                        <Glyph shape={a.shape} color={a.color} size={12} dim={killed} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-sm leading-[1.2] font-semibold">{a.name}</span>
                          <AgentStatus agent={a} />
                        </span>
                        <span className="text-xs leading-[1.35] text-muted">{a.strategy_line}</span>
                      </span>
                      <Capital a={a} />
                      <span />
                      <span className="flex min-w-0 items-center gap-3">
                        <Sparkline
                          values={a.spark}
                          slots={slots}
                          tone={tone}
                          width={96}
                          height={26}
                          delayMs={i * SPARK_STAGGER_MS}
                        />
                        <span className="font-mono text-[11px] leading-none whitespace-nowrap text-muted">
                          SR <span className="text-ink">{sharpeOf(a)}</span>
                        </span>
                      </span>
                      <span className="justify-self-end">
                        <VerdictBadge verdict={a.verdict} />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
