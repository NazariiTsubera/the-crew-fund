import { sparkPath } from "@/lib/chart";

/** An agent's month-end equity, log scale, on the fund's time axis. */
export function Sparkline({
  values,
  slots,
  tone,
  width = 120,
  height = 34,
}: {
  values: number[];
  slots: number;
  tone: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block overflow-visible"
      style={{ width, height }}
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
