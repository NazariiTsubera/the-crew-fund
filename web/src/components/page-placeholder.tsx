import type { ReactNode } from "react";

/** A section's heading until its ticket fills in the body. */
export function PagePlaceholder({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 px-6 py-7 wide:px-8">
      <div className="font-mono text-[10px] leading-none font-medium tracking-[0.16em] text-faint">{kicker}</div>
      <h1 className="m-0 text-2xl leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {children && <p className="m-0 max-w-[60ch] text-sm leading-relaxed text-muted">{children}</p>}
    </section>
  );
}
