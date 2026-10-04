"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { FundFigure, ShellModel, Status } from "@/components/shell-parts";
import { Sidebar } from "@/components/sidebar";
import { ThemeRestorer } from "@/components/theme-toggle";
import { TopBar } from "@/components/top-bar";
import { useVault, type VaultState } from "@/components/use-vault";
import { API_MOCK } from "@/lib/api";
import { lastMonthReturn } from "@/lib/curve";
import { formatMonth, formatPct } from "@/lib/format";

function toneOf(x: number): string {
  return x > 0.00005 ? "var(--up)" : x < -0.00005 ? "var(--down)" : "var(--muted)";
}

function statusOf(state: VaultState): Status {
  if (state.status === "loading") return { label: "CONNECTING", tone: "var(--faint)", pulse: true };
  // An unseeded fund is a 404 from a healthy API, not an outage.
  if (state.status === "error" && state.error.kind === "unseeded")
    return { label: "API ONLINE · NOT SEEDED", tone: "var(--muted)", pulse: false };
  if (state.status === "error") return { label: "API OFFLINE", tone: "var(--down)", pulse: false };
  if (API_MOCK) return { label: "MOCK DATA", tone: "var(--accent)", pulse: false };
  return { label: "API ONLINE", tone: "var(--up)", pulse: true };
}

// The store holds month-end books, not intraday P&L, so the footer shows the fund's latest
// monthly return and names the month rather than inventing a "today" figure.
function fundFigure(state: VaultState): FundFigure | null {
  if (state.status !== "ready") return null;
  const last = lastMonthReturn(state.vault.curve);
  if (!last) return null;
  return {
    label: `FUND · ${formatMonth(last.month).toUpperCase()}`,
    value: formatPct(last.value, 2),
    tone: toneOf(last.value),
  };
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const state = useVault();
  const model: ShellModel = {
    pathname,
    nav: [
      { href: "/", label: "War Room" },
      { href: "/floor", label: "Live floor" },
      {
        href: "/holdings",
        label: "Holdings",
        meta: state.status === "ready" ? String(state.vault.holdings.length) : undefined,
      },
    ],
    crew: state.status === "ready" ? state.vault.agents : null,
    crewError: state.status === "error" ? state.message : null,
    fund: fundFigure(state),
    status: statusOf(state),
  };

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <ThemeRestorer />
      <Sidebar model={model} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar model={model} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
