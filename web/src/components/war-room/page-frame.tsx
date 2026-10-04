import type { ReactNode } from "react";

import type { LoadError } from "@/lib/load-error";

export const KICKER = "font-mono text-[11px] leading-none font-medium tracking-[0.14em] text-dim";

/** The design's page header: file kicker and title on the left, an optional note on the right. */
export function PageHeader({ kicker, title, aside }: { kicker: string; title: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line-soft px-4 pt-[22px] pb-[18px] sm:px-7">
      <div className="flex flex-col gap-2">
        <div className={KICKER}>{kicker}</div>
        <h1 className="m-0 text-2xl leading-[1.1] font-medium text-ink">{title}</h1>
      </div>
      {aside && (
        <div className="font-mono text-[11px] leading-[1.6] tracking-[0.06em] text-muted sm:text-right">{aside}</div>
      )}
    </header>
  );
}

/** The padded column every section of a page sits in. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-7 px-4 pt-6 pb-12 sm:px-7">{children}</div>
  );
}

export function LoadingState() {
  return (
    <div
      role="status"
      className="grid min-h-[40vh] place-items-center font-mono text-xs font-medium tracking-[0.14em] text-dim"
    >
      OPENING THE VAULT…
    </div>
  );
}

/** A failed load, said plainly: an unseeded fund and an unreachable API read differently. */
export function ErrorState({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const tone = error.kind === "unseeded" ? "var(--accent)" : "var(--down)";
  return (
    <div role="alert" className="flex max-w-[60ch] flex-col gap-3 border border-line bg-panel p-5" style={{ boxShadow: `inset 2px 0 0 ${tone}` }}>
      <div className="font-mono text-[10px] leading-none font-medium tracking-[0.14em]" style={{ color: tone }}>
        {error.kind === "unseeded" ? "NO FUND YET" : error.kind === "offline" ? "NO CONNECTION" : "LOAD FAILED"}
      </div>
      <h2 className="m-0 text-lg leading-tight font-medium text-ink">{error.title}</h2>
      <p className="m-0 font-mono text-xs leading-relaxed break-words text-muted">{error.detail}</p>
      <div>
        <button
          type="button"
          onClick={onRetry}
          className="h-[30px] cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-3 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-soft hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-accent"
        >
          ↻ TRY AGAIN
        </button>
      </div>
    </div>
  );
}
