"use client";

import Link from "next/link";

import { Clock } from "@/components/clock";
import { isCurrent, StatusDot, type ShellModel } from "@/components/shell-parts";
import { ThemeToggle } from "@/components/theme-toggle";

/** Below 900px the sidebar folds into this bar: wordmark, status and one row of tabs. */
export function TopBar({ model }: { model: ShellModel }) {
  const { pathname, nav, crew, fund, status } = model;
  const tabs = [
    ...nav.map((n) => ({ href: n.href, label: n.label, on: isCurrent(pathname, n.href) })),
    ...(crew ?? []).map((a) => {
      const href = `/agents/${encodeURIComponent(a.id)}`;
      return { href, label: a.name, on: pathname === href };
    }),
    { href: "/agents/new", label: "+ New agent", on: pathname === "/agents/new" },
  ];

  return (
    <div className="sticky top-0 z-[5] flex flex-col gap-2.5 border-b border-line bg-side px-3.5 py-3 wide:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="font-mono text-sm leading-none font-semibold tracking-[0.22em] text-ink no-underline">
          THE CREW
        </Link>
        <div className="flex items-center gap-3">
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
      <nav aria-label="Sections" className="flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={`flex h-8 flex-none items-center rounded-[2px] border border-line-strong px-3 text-xs leading-none font-medium whitespace-nowrap no-underline ${t.on ? "bg-ink text-bg" : "bg-transparent text-soft"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
