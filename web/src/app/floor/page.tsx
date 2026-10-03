import type { Metadata } from "next";

import { LiveFloor } from "@/components/floor/live-floor";

export const metadata: Metadata = { title: "Live floor" };

export default function FloorPage() {
  return <LiveFloor />;
}
