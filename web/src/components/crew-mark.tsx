// THE CREW's mark: three candles stepping up to a gold one. Drawn inline (not the brand SVG
// files in public/brand) so the candles follow the theme's ink and accent in light and dark.
export function CrewMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // [wick x, wick y, wick height, body y, body height, colour]; bodies sit 6 left of the wick.
  const candles: [number, number, number, number, number, string][] = [
    [15, 44, 40, 52, 24, "var(--ink)"],
    [38, 30, 44, 40, 22, "var(--ink)"],
    [61, 22, 40, 30, 22, "var(--ink)"],
    [84, 4, 40, 10, 26, "var(--accent)"],
  ];
  return (
    <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className={className}>
      {candles.map(([x, y, h, by, bh, fill]) => (
        <g key={x} fill={fill}>
          <rect x={x} y={y} width="4" height={h} />
          <rect x={x - 6} y={by} width="16" height={bh} />
        </g>
      ))}
    </svg>
  );
}
