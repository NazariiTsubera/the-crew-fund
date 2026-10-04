"use client";

import { useEffect, useRef, useState } from "react";

import type { AddableFeature } from "@/lib/whatif";

/** "+ ADD A SIGNAL": a themed list of every signal not in the recipe, with what each measures. */
export function SignalPicker({
  options,
  onPick,
  disabled = false,
}: {
  options: AddableFeature[];
  onPick: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const stockLevel = options.filter((o) => !o.marketWide);
  const marketWide = options.filter((o) => o.marketWide);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-full cursor-pointer items-center justify-between rounded-[2px] border border-dashed border-line-strong bg-transparent px-3 font-mono text-[11px] font-semibold tracking-[0.08em] text-soft hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-40"
      >
        + ADD A SIGNAL
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Add a signal"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-20 m-0 max-h-[280px] list-none overflow-y-auto border border-line-strong bg-panel p-1 shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
        >
          {[...stockLevel, ...marketWide].map((o, i) => (
            <li key={o.name} role="presentation">
              {i === stockLevel.length && marketWide.length > 0 && (
                <div className="mt-1 border-t border-line-soft px-2.5 pt-2 pb-1 font-mono text-[9.5px] tracking-[0.12em] text-faint">
                  MARKET-WIDE · ONE VALUE PER DATE, CANNOT RANK STOCKS
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(o.name);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[2px] border-0 bg-transparent px-2.5 py-1.5 text-left hover:bg-line-soft focus-visible:bg-line-soft focus-visible:outline-none"
              >
                <span className={`font-mono text-xs ${o.marketWide ? "text-muted" : "text-ink"}`}>{o.name}</span>
                <span className="text-[11.5px] leading-snug text-muted">{o.meaning}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
