import type { Metadata } from "next";

import { HoldingsView } from "@/components/war-room/holdings-view";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return <HoldingsView />;
}
