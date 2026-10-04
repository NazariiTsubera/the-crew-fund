import type { CSSProperties } from "react";

import { Tag } from "@/components/agent/tags";
import type { RedTeam, RedTeamTest } from "@/lib/api";
import { DRAW_MS, staggerMs } from "@/lib/motion";

// One test after another once the equity curve has drawn, like a verdict being read out.
const TEST_STEP_MS = 160;

/** One Red Team test and what it found; shared by the card and the verdict badge's popover. */
export function RedTeamTestRow({
  test,
  style,
  className = "",
}: {
  test: RedTeamTest;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 border-t border-line-soft pt-2.5 ${className}`} style={style}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] leading-none font-semibold text-ink">{test.name}</span>
        <Tag kind={test.passed ? "PASS" : "FAIL"} />
      </div>
      <span className="font-mono text-[11px] leading-snug text-muted">{test.detail}</span>
    </div>
  );
}

/** The Red Team's tests on the agent's page, revealed in order after the equity curve. */
export function RedTeamCard({ redteam }: { redteam: RedTeam }) {
  const passed = redteam.tests.filter((t) => t.passed).length;
  return (
    <section aria-label="Red Team" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-dim">
        <span>RED TEAM</span>
        <span>
          {passed} OF {redteam.tests.length} PASSED
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-5 gap-y-3 border border-line bg-panel px-4 pt-1.5 pb-3.5">
        {redteam.tests.length === 0 && <div className="pt-2.5 font-mono text-xs text-dim">No tests recorded.</div>}
        {redteam.tests.map((t, i) => (
          <RedTeamTestRow
            key={t.name}
            test={t}
            className="crew-rise"
            style={{ animationDelay: `${staggerMs(i, DRAW_MS, TEST_STEP_MS)}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
