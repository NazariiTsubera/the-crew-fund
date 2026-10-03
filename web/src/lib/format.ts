// The design uses a true minus sign (U+2212) so negative numbers line up in tabular columns.
const MINUS = "−";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Rounds first so a value that prints as zero never carries a minus ("−0.0%").
function signed(magnitude: string, negative: boolean, plus: boolean): string {
  if (/^0(\.0+)?$/.test(magnitude)) return `${plus ? "+" : ""}${magnitude}`;
  return `${negative ? MINUS : plus ? "+" : ""}${magnitude}`;
}

/** A fraction as a signed percentage: 0.7 → "+70.0%", -0.161 → "−16.1%". */
export function formatPct(value: number, decimals = 1): string {
  return `${signed(Math.abs(value * 100).toFixed(decimals), value < 0, true)}%`;
}

/** A fraction as an unsigned share of capital: 0.38 → "38%". */
export function formatShare(value: number, decimals = 0): string {
  return `${signed(Math.abs(value * 100).toFixed(decimals), value < 0, false)}%`;
}

/** A plain number, minus-signed but never plus-signed: 1.234 → "1.23", -0.4 → "−0.40". */
export function formatNum(value: number, decimals = 2): string {
  return signed(Math.abs(value).toFixed(decimals), value < 0, false);
}

/** "2026-08" or "2026-08-31" → "Aug 2026". */
export function formatMonth(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoMonth);
  const index = match ? Number(match[2]) - 1 : -1;
  if (!match || index < 0 || index > 11) throw new RangeError(`not a month: ${isoMonth}`);
  return `${MONTHS[index]} ${match[1]}`;
}

/** "2026-08-31" → "31 AUG 2026", as the War Room's header prints dates; "2025-01" → "JAN 2025". */
export function formatDay(isoDate: string): string {
  const month = formatMonth(isoDate).toUpperCase();
  const day = /^\d{4}-\d{2}-(\d{2})/.exec(isoDate);
  return day ? `${Number(day[1])} ${month}` : month;
}
