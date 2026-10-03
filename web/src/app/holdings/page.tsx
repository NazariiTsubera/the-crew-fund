import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return (
    <PagePlaceholder kicker="03 // HOLDINGS" title="Holdings">
      The fund&apos;s latest book, each position with the agent that holds it and why.
    </PagePlaceholder>
  );
}
