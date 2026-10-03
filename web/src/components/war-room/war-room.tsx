"use client";

import { AgentsTable } from "@/components/war-room/agents-table";
import { CapitalPanel } from "@/components/war-room/capital-panel";
import { FundChart } from "@/components/war-room/fund-chart";
import { KpiTiles } from "@/components/war-room/kpi-tiles";
import { ErrorState, LoadingState, PageBody, PageHeader } from "@/components/war-room/page-frame";
import { useFundData } from "@/components/war-room/use-fund-data";
import { formatDay } from "@/lib/format";

const KICKER = "FILE 01 // THE VAULT";

/** The War Room (FILE 01): headline figures, the fund against the S&P, the capital split and the crew. */
export function WarRoom() {
  const { vault, capital, retry } = useFundData({ withCapital: true });

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
          <div className="grid grid-cols-1 items-start gap-7 @4xl:grid-cols-3">
            <div className="min-w-0 @4xl:col-span-2">
              <FundChart vault={fund} />
            </div>
            <CapitalPanel agents={fund.agents} capital={capital} latestMemo={fund.latest_memo} />
          </div>
        </div>
        <AgentsTable agents={fund.agents} slots={slots} />
      </PageBody>
    </>
  );
}
