"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Clock } from "@/components/clock";
import { CrewMark } from "@/components/crew-mark";
import { Glyph } from "@/components/glyph";
import { isCurrent, StatusDot, type ShellModel } from "@/components/shell-parts";
import { ThemeToggle } from "@/components/theme-toggle";
import { statusLabel } from "@/lib/agent-status";
import { formatShare } from "@/lib/format";

const ITEM =
  "flex h-11 items-center gap-2.5 rounded-[2px] px-3 text-sm leading-none font-medium no-underline";

/** Below 900px the sidebar folds into this bar: wordmark, status and a burger menu. */
export function TopBar({ model }: { model: ShellModel }) {
  const { pathname, nav, crew, crewError, fund, status } = model;
  // The menu remembers the page it was opened on, so navigating away closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const here =
    nav.find((n) => isCurrent(pathname, n.href))?.label ??
    crew?.find((a) => pathname === `/agents/${encodeURIComponent(a.id)}`)?.name ??
    (pathname === "/agents/new" ? "New agent" : null);

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-side wide:hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
            className="grid size-9 flex-none cursor-pointer place-items-center rounded-[2px] border border-line-strong bg-transparent text-ink"
          >
            <span aria-hidden className="font-mono text-base leading-none">
              {open ? "✕" : "☰"}
            </span>
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm leading-none font-semibold tracking-[0.22em] whitespace-nowrap text-ink no-underline"
          >
            <CrewMark size={22} />
            THE CREW
          </Link>
          {here && <span className="hidden truncate text-xs leading-none text-muted min-[440px]:inline">/ {here}</span>}
        </div>
        <div className="flex flex-none items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-[11px] leading-none font-medium text-muted">
            <StatusDot status={status} />
            <Clock />
            {fund && (
              <>
                {" · "}
                <span style={{ color: fund.tone }}>{fund.value}</span>
              </>
            )}
          </span>
          <ThemeToggle compact />
        </div>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Sections"
          className="flex max-h-[calc(100dvh-62px)] flex-col gap-1 overflow-y-auto border-t border-line px-3.5 pt-2 pb-4"
        >
          {nav.map((n) => {
            const on = isCurrent(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`${ITEM} justify-between ${on ? "bg-ink text-bg" : "text-soft"}`}
              >
                {n.label}
                {n.meta && <span className="font-mono text-[11px] text-muted">{n.meta}</span>}
              </Link>
            );
          })}

          <div className="mt-2 px-3 pb-1 font-mono text-[10px] leading-none font-medium tracking-[0.14em] text-dim">
            CREW{crew ? ` · ${crew.length}` : ""}
          </div>
          {crew === null && (
            <div className="px-3 py-2 font-mono text-[11px] text-faint">{crewError ?? "OPENING THE VAULT…"}</div>
          )}
          {crew?.map((a) => {
            const href = `/agents/${encodeURIComponent(a.id)}`;
            const on = pathname === href;
            const out = a.status === "killed";
            return (
              <Link
                key={a.id}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`${ITEM} ${on ? "bg-ink text-bg" : "text-soft"}`}
                style={{ opacity: out && !on ? 0.55 : 1 }}
              >
                <Glyph shape={a.shape} color={a.color} size={11} dim={out} />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="font-mono text-[11px] text-muted">
                  {out ? statusLabel(a).toUpperCase() : formatShare(a.capital_share)}
                </span>
              </Link>
            );
          })}

          <Link
            href="/agents/new"
            aria-current={pathname === "/agents/new" ? "page" : undefined}
            className="mt-2 flex h-11 items-center justify-center rounded-[2px] bg-accent font-mono text-xs leading-none font-semibold tracking-[0.08em] text-on-accent no-underline"
          >
            + NEW AGENT
          </Link>
        </nav>
      )}
    </div>
  );
}
