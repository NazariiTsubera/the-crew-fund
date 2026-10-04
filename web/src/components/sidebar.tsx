"use client";

import Link from "next/link";

import { Clock } from "@/components/clock";
import { CrewMark } from "@/components/crew-mark";
import { Glyph } from "@/components/glyph";
import { isCurrent, StatusDot, type ShellModel } from "@/components/shell-parts";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatShare } from "@/lib/format";

const ROW =
  "flex w-full items-center rounded-[2px] text-left hover:bg-line-soft hover:text-ink focus-visible:outline focus-visible:outline-ink focus-visible:-outline-offset-1";

function rowState(on: boolean) {
  return on ? "bg-line-soft text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-muted";
}

export function Sidebar({ model }: { model: ShellModel }) {
  const { pathname, nav, crew, crewError, fund, status } = model;
  return (
    <aside
      aria-label="Navigation"
      className="sticky top-0 hidden h-screen w-[236px] flex-none flex-col overflow-y-auto border-r border-line bg-side wide:flex"
    >
      <Link href="/" className="flex items-center gap-3 border-b border-line px-[18px] py-5 text-ink no-underline">
        <CrewMark size={34} className="flex-none" />
        <span className="flex flex-col gap-[5px]">
          <span className="font-mono text-[15px] leading-none font-semibold tracking-[0.22em]">THE CREW</span>
          <span className="text-[11px] leading-none text-muted">AI hedge fund · War Room</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-2.5 pt-3.5 pb-1.5">
        {nav.map((n) => {
          const on = isCurrent(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`${ROW} ${rowState(on)} gap-2.5 px-2.5 py-[9px] text-[13px] leading-none font-medium`}
            >
              <span className="flex-1">{n.label}</span>
              {n.meta && <span className="font-mono text-[10px] leading-none font-medium text-muted">{n.meta}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-0.5 px-2.5 pt-3.5 pb-1.5">
        <div className="px-2.5 pb-2 font-mono text-[10px] leading-none font-medium tracking-[0.16em] text-faint">
          CREW{crew ? ` · ${crew.length}` : ""}
        </div>
        {crew === null && (
          <div className="px-2.5 py-2 font-mono text-[11px] leading-snug text-faint">
            {crewError ?? "OPENING THE VAULT…"}
          </div>
        )}
        {crew?.map((a) => {
          const href = `/agents/${encodeURIComponent(a.id)}`;
          const on = pathname === href;
          const killed = a.status === "killed";
          return (
            <Link
              key={a.id}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`${ROW} ${on ? rowState(true) : "text-soft"} grid grid-cols-[14px_minmax(0,1fr)_auto] gap-2.5 px-2.5 py-2`}
              style={{ opacity: killed ? 0.5 : 1 }}
            >
              <Glyph shape={a.shape} color={a.color} size={11} dim={killed} />
              <span className="truncate text-[13px] leading-[1.1] font-medium">{a.name}</span>
              <span className="font-mono text-[11px] leading-none font-medium text-muted">
                {killed ? "OUT" : formatShare(a.capital_share)}
              </span>
            </Link>
          );
        })}
        <Link
          href="/agents/new"
          aria-current={pathname === "/agents/new" ? "page" : undefined}
          className="mt-2 flex h-[38px] items-center justify-center gap-2 rounded-[2px] bg-accent font-mono text-xs leading-none font-semibold tracking-[0.08em] text-on-accent no-underline hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          + NEW AGENT
        </Link>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 border-t border-line px-[18px] pt-3.5 pb-4">
        <div className="flex items-center justify-between font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-muted">
          <span className="flex items-center gap-[7px]">
            <StatusDot status={status} />
            {status.label}
          </span>
          <span className="text-ink">
            <Clock />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim">
            {fund?.label ?? "FUND"}
          </span>
          <span className="font-mono text-[15px] leading-none font-medium" style={{ color: fund?.tone ?? "var(--faint)" }}>
            {fund?.value ?? "—"}
          </span>
        </div>
        <div className="flex gap-1.5">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
