"use client";

import { useEffect, useId, useRef, useState } from "react";

import { RedTeamTestRow } from "@/components/agent/red-team-card";
import { badgeStyle } from "@/components/agent/tags";
import type { RedTeam } from "@/lib/api";

/** The Red Team verdict; clicking it opens the four tests with what each one found. */
export function VerdictBadge({ redteam }: { redteam: RedTeam }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const failed = redteam.tests.filter((t) => !t.passed).length;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Red Team verdict ${redteam.verdict}, show the tests`}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-offset-[3px] focus-visible:outline-ink"
      >
        <span style={badgeStyle(redteam.verdict)}>{redteam.verdict.toUpperCase()}</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Red Team tests"
          className="absolute top-[calc(100%+8px)] left-0 z-20 flex w-[min(360px,calc(100vw-48px))] flex-col gap-3 rounded-[2px] border border-line-strong bg-panel p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] leading-none font-medium tracking-[0.14em] text-dim">
            <span>RED TEAM</span>
            <span>
              {redteam.tests.length - failed} OF {redteam.tests.length} PASSED
            </span>
          </div>
          {redteam.tests.length === 0 && (
            <div className="font-mono text-xs text-dim">No tests recorded.</div>
          )}
          {redteam.tests.map((t) => (
            <RedTeamTestRow key={t.name} test={t} />
          ))}
        </div>
      )}
    </div>
  );
}
