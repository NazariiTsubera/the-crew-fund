"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/use-reduced-motion";
import { COUNT_UP_MS, countUp } from "@/lib/motion";

/**
 * A stored figure counted up from 0 (or from what was last shown) to itself. It always ends on
 * `target` exactly, and with reduced motion it is `target` from the first frame.
 */
export function useCountUp(target: number, durationMs = COUNT_UP_MS): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  // Where the next count starts, so a refetch with a new value moves on from the old one.
  const from = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const origin = from.current;
    let start: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
      start ??= now;
      const elapsed = now - start;
      const value = countUp(origin, target, elapsed, durationMs);
      from.current = value;
      setShown(value);
      if (elapsed < durationMs) frame = requestAnimationFrame(tick);
    });
    // A hidden tab never runs animation frames; the timer still lands the figure on the real
    // value, so a tile can't sit on its starting 0 as if that were the number.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame);
      from.current = target;
      setShown(target);
    }, durationMs + 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, durationMs, reduced]);

  return reduced ? target : shown;
}

/** A tile figure that counts up: the moving text is hidden from screen readers, which get the final value. */
export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const shown = useCountUp(value);
  return (
    <>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
