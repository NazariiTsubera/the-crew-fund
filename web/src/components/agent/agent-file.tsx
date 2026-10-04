"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ChatColumn } from "@/components/agent/chat-column";
import { PerformanceColumn } from "@/components/agent/performance-column";
import { refreshVault } from "@/components/use-vault";
import { ApiError, api, type Agent } from "@/lib/api";

type State =
  | { status: "loading" }
  | { status: "ready"; agent: Agent }
  | { status: "missing" }
  | { status: "offline"; message: string };

type Tab = "chat" | "perf";

function Notice({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 px-6 py-7 wide:px-8">
      <div className="font-mono text-[10px] leading-none font-medium tracking-[0.16em] text-faint">{kicker}</div>
      <h1 className="m-0 text-2xl leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {children && <div className="m-0 max-w-[60ch] text-sm leading-relaxed text-muted">{children}</div>}
    </section>
  );
}

/** /agents/[id]: chat on the left, performance on the right; tabs when there is no room for both. */
export function AgentFile({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api.agent(id, controller.signal).then(
      (agent) => setState({ status: "ready", agent }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) setState({ status: "missing" });
        else setState({ status: "offline", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [id]);

  if (state.status === "loading") {
    return (
      <Notice kicker="AGENT FILE" title="Opening the file…">
        Reading the agent&apos;s recipe, backtest and Red Team verdict.
      </Notice>
    );
  }
  if (state.status === "missing") {
    return (
      <Notice kicker="AGENT FILE" title="No such agent">
        Nobody on the crew goes by <span className="font-mono text-ink">{id}</span>.{" "}
        <Link href="/" className="text-soft underline underline-offset-[3px]">
          Back to the War Room
        </Link>
        .
      </Notice>
    );
  }
  if (state.status === "offline") {
    return (
      <Notice kicker="AGENT FILE" title="API offline">
        Could not reach the fund&apos;s API: <span className="font-mono">{state.message}</span>
      </Notice>
    );
  }

  return <AgentScreen agent={state.agent} />;
}

function AgentScreen({ agent: initial }: { agent: Agent }) {
  // A recompile replaces the agent; reload it so the chart, numbers and recipe follow.
  const [agent, setAgent] = useState(initial);
  const [version, setVersion] = useState(0);

  async function reload() {
    try {
      setAgent(await api.agent(agent.id));
      setVersion((v) => v + 1);
      refreshVault();
    } catch {
      // the recompile itself succeeded; a failed reload leaves the old numbers until refresh
    }
  }

  return (
    <FileLayout
      chat={(className) => (
        <ChatColumn agent={agent} version={version} className={className} onRecompiled={() => void reload()} />
      )}
      perf={(className) => <PerformanceColumn agent={agent} version={version} className={className} />}
    />
  );
}

/**
 * Chat on the left, performance on the right; tabs when there is no room for both. Shared by
 * the agent file and the recruit screen, which fills the same two columns before the agent exists.
 */
export function FileLayout({
  chat,
  perf,
  label = "Agent file",
  focusChat = 0,
}: {
  chat: (className: string) => ReactNode;
  perf: (className: string) => ReactNode;
  label?: string;
  /** Each new value shows the chat tab (only matters when the columns are tabs). */
  focusChat?: number;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [seenFocus, setSeenFocus] = useState(focusChat);
  if (focusChat !== seenFocus) {
    setSeenFocus(focusChat);
    setTab("chat");
  }
  const tabs: [Tab, string][] = [
    ["chat", "CHAT"],
    ["perf", "PERFORMANCE"],
  ];

  return (
    <div className="flex min-w-0 flex-col min-[1100px]:h-screen">
      <div role="tablist" aria-label={label} className="flex border-b border-line min-[1100px]:hidden">
        {tabs.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-[42px] flex-1 cursor-pointer border-0 bg-transparent font-mono text-xs leading-none font-medium tracking-[0.1em] ${tab === key ? "text-ink shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted"}`}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(340px,4fr)_minmax(0,6fr)]">
        {chat(
          `${tab === "chat" ? "flex" : "hidden"} h-[calc(100dvh-140px)] wide:h-[calc(100dvh-43px)] min-[1100px]:flex min-[1100px]:h-full min-[1100px]:border-r min-[1100px]:border-line`,
        )}
        {perf(`${tab === "perf" ? "flex" : "hidden"} min-[1100px]:flex min-[1100px]:h-full min-[1100px]:overflow-y-auto`)}
      </div>
    </div>
  );
}
