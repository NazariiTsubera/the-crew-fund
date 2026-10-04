// Motion only ever moves a real number toward itself; nothing here makes a value up.

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** How long a KPI takes to count up to its value. */
export const COUNT_UP_MS = 800;

/** How long a chart takes to draw in; staggered reveals start after it. Matches `crew-draw` in globals.css. */
export const DRAW_MS = 900;

/** Fast start, gentle landing, so the figure is readable before the animation ends. */
export function easeOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - (1 - x) ** 3;
}

/**
 * The value shown `elapsedMs` into a count from `from` to `to`. Returns `to` itself, not an
 * interpolated float, once time is up, so the formatted figure ends on the stored one exactly.
 */
export function countUp(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(to) || !Number.isFinite(from) || elapsedMs >= durationMs) return to;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}

/** The delay of the `index`-th item in a sequence that starts at `startMs`. */
export function staggerMs(index: number, startMs: number, stepMs: number): number {
  return startMs + index * stepMs;
}

type MediaHost = { matchMedia?: (query: string) => { matches: boolean } };

/** Whether the viewer asked the OS for less motion; false where there is no matchMedia (the server). */
export function prefersReducedMotion(host: MediaHost | undefined): boolean {
  return host?.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}
