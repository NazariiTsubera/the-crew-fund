import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Live floor" };

export default function FloorPage() {
  return (
    <PagePlaceholder kicker="02 // LIVE FLOOR" title="Live floor">
      Every trade, risk call, Mastermind memo and Red Team verdict, newest first.
    </PagePlaceholder>
  );
}
