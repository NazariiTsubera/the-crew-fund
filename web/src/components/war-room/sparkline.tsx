import { sparkPath } from "@/lib/chart";

/** An agent's month-end equity, log scale, on the fund's time axis. */
export function Sparkline({
  values,
  slots,
  tone,
  width = 120,
  height = 34,
  delayMs = 0,
}: {
  values: number[];
  slots: number;
  tone: string;
  width?: number;
  height?: number;
  /** Lets a table draw its rows in one after another. */
  delayMs?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="crew-draw block overflow-visible"
      style={{ width, height, animationDelay: `${delayMs}ms` }}
    >
      <path
        d={sparkPath(values, { width, height, slots })}
        fill="none"
        stroke={tone}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
