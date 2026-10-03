import type { Metadata } from "next";

import { AgentFile } from "@/components/agent/agent-file";

export const metadata: Metadata = { title: "Agent file" };

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  const { id } = await params;
  // Keyed so moving between agents starts each file fresh (chat, tab, selected month).
  return <AgentFile key={id} id={id} />;
}
