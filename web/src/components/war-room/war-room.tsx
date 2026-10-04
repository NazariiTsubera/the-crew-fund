"use client";

import { useState } from "react";

import { AgentsTable } from "@/components/war-room/agents-table";
import { CapitalPanel } from "@/components/war-room/capital-panel";
import { FundChart } from "@/components/war-room/fund-chart";
import { KpiTiles } from "@/components/war-room/kpi-tiles";
import { ErrorState, LoadingState, PageBody, PageHeader } from "@/components/war-room/page-frame";
import { useFundData } from "@/components/war-room/use-fund-data";
import { contributionValues } from "@/lib/chart";
import { formatDay } from "@/lib/format";

const KICKER = "FILE 01 // THE VAULT";

/** The War Room (FILE 01): headline figures, the fund against the S&P, the capital split and the crew. */
export function WarRoom() {
  const { vault, capital, retry } = useFundData({ withCapital: true });
  // Agents drawn on the fund chart, toggled from the crew table; null until the crew loads (all).
  const [picked, setShown] = useState<Set<string> | null>(null);
  // The month the capital scrubber or replay is on; the fund chart is cut there and grows.
  const [endMonth, setEndMonth] = useState<string | null>(null);
  const shown = picked ?? new Set(vault.status === "ready" ? vault.data.agents.map((a) => a.id) : []);

  if (vault.status !== "ready") {
    return (
      <>
        <PageHeader kicker={KICKER} title="War Room" />
        <PageBody>
          {vault.status === "loading" ? <LoadingState /> : <ErrorState error={vault.error} onRetry={retry} />}
        </PageBody>
      </>
    );
  }

  const fund = vault.data;
  const slots = Math.max(1, ...fund.agents.map((a) => a.spark.length));
  return (
    <>
      <PageHeader
        kicker={KICKER}
        title="War Room"
        aside={
          <>
            AS OF {formatDay(fund.as_of)}
            <br />
            HOLDOUT FROM {formatDay(fund.holdout_cutoff)}
          </>
        }
      />
      <PageBody>
        <KpiTiles vault={fund} />
        <div className="@container">
          {/* Stretched rows: the chart and the capital panel end on the same line. */}
          <div className="grid grid-cols-1 items-stretch gap-7 @4xl:grid-cols-3">
            <div className="flex min-w-0 flex-col @4xl:col-span-2">
              <FundChart
                vault={fund}
                endMonth={endMonth}
                lines={fund.agents
                  .filter((a) => shown.has(a.id))
                  .map((a) => ({ id: a.id, color: a.color, values: contributionValues(a.spark, a.capital_share) }))}
              />
            </div>
            <CapitalPanel agents={fund.agents} capital={capital} latestMemo={fund.latest_memo} onSplitSaved={retry} onMonth={setEndMonth} />
          </div>
        </div>
        <AgentsTable agents={fund.agents} slots={slots} shown={shown} onShow={setShown} />
      </PageBody>
    </>
  );
}
