// The design uses a true minus sign (U+2212) so negative numbers line up in tabular columns.
const MINUS = "−";

export function formatPct(value: number, decimals = 1): string {
  const sign = value >= 0 ? "+" : MINUS;
  return `${sign}${Math.abs(value * 100).toFixed(decimals)}%`;
}
