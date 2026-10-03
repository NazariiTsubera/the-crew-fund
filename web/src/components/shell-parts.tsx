import type { AgentSummary } from "@/lib/api";

// What the sidebar and the narrow top bar both draw, computed once by the shell.

export type NavItem = { href: string; label: string; meta?: string };

export type FundFigure = { label: string; value: string; tone: string };

export type Status = { label: string; tone: string; pulse: boolean };

export type ShellModel = {
  pathname: string;
  nav: NavItem[];
  crew: AgentSummary[] | null;
  crewError: string | null;
  fund: FundFigure | null;
  status: Status;
};

export function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      aria-hidden
      className="inline-block size-[7px] flex-none rounded-full"
      style={{
        background: status.tone,
        animation: status.pulse ? "crew-blink 1.4s steps(2) infinite" : "none",
      }}
    />
  );
}
