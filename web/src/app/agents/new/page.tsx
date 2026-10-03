import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "New agent" };

export default function NewAgentPage() {
  return (
    <PagePlaceholder kicker="FILE 00 // RECRUITMENT" title="New agent">
      Describe a strategy in plain words; it is compiled, backtested and red-teamed before it trades.
    </PagePlaceholder>
  );
}
