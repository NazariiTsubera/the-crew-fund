import { PagePlaceholder } from "@/components/page-placeholder";

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  const { id } = await params;
  return (
    <PagePlaceholder kicker="AGENT FILE" title={id}>
      Chat and performance for this agent.
    </PagePlaceholder>
  );
}
