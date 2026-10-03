import type { Holding } from "@/lib/api";
import { formatMonth, formatShare } from "@/lib/format";

type Props = {
  holdings: Holding[];
  holdingsMonth: string | null;
  /** A past month picked on the chart; the API serves only the latest book. */
  selected: string | null;
  tone: string;
  stopMonth: string | null;
};

export function BookTable({ holdings, holdingsMonth, selected, tone, stopMonth }: Props) {
  const rows = [...holdings].sort((a, b) => b.weight - a.weight);
  const max = rows[0]?.weight || 1;
  const label = holdingsMonth ? formatMonth(holdingsMonth).toUpperCase() : "—";
  const stale = selected !== null && selected !== holdingsMonth;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-dim">BOOK · {label}</div>
      {stale && (
        <div className="font-mono text-[10.5px] leading-snug text-muted">
          Only the latest book is stored; showing {label}, not {formatMonth(selected).toUpperCase()}.
        </div>
      )}
      <div className="border border-line">
        {rows.map((h) => (
          <div
            key={h.ticker}
            className="grid grid-cols-[56px_50px_minmax(0,1fr)] items-center gap-2.5 border-t border-line-soft px-3 py-2 font-mono text-xs leading-snug first:border-t-0"
          >
            <span className="font-semibold">{h.ticker}</span>
            <span className="flex flex-col gap-1">
              <span>{formatShare(h.weight, 1)}</span>
              <span className="relative h-[3px] bg-flash">
                <span className="absolute inset-y-0 left-0" style={{ width: `${(h.weight / max) * 100}%`, background: tone }} />
              </span>
            </span>
            <span className="truncate text-muted" title={h.reason ?? undefined}>
              {h.reason ?? "—"}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-3.5 font-mono text-xs leading-snug text-dim">
            {stopMonth ? `No positions. Stopped ${formatMonth(stopMonth)}.` : "No positions this month."}
          </div>
        )}
      </div>
    </div>
  );
}
