import type { Metadata } from "next";

import { RecruitScreen } from "@/components/recruit/recruit-screen";

export const metadata: Metadata = { title: "New agent" };

export default function NewAgentPage() {
  return <RecruitScreen />;
}
