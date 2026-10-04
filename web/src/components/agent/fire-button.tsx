"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { refreshVault } from "@/components/use-vault";
import { api, type Agent } from "@/lib/api";

const BTN =
  "h-[26px] cursor-pointer rounded-[2px] border bg-transparent px-2.5 font-mono text-[10.5px] leading-none font-semibold tracking-[0.08em] disabled:cursor-default disabled:opacity-40";

/**
 * The judge's controls: FIRE takes the agent off the fund (share 0, it can be hired back), HIRE brings it
 * back at an equal weight, DELETE removes it for good. `onChanged` reloads the agent file.
 */
export function AgentActions({ agent, onChanged }: { agent: Agent; onChanged: () => void }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = agent.status === "fired";

  async function run(action: () => Promise<void>, after: () => void) {
    setWorking(true);
    setError(null);
    try {
      await action();
      refreshVault();
      after();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={working}
        onClick={() => void run(() => (fired ? api.hire(agent.id) : api.fire(agent.id)), onChanged)}
        className={`${BTN} ${fired ? "border-up text-up hover:bg-up hover:text-bg" : "border-down text-down hover:bg-down hover:text-bg"}`}
      >
        {fired ? "HIRE" : "FIRE"}
      </button>
      <button
        type="button"
        disabled={working}
        onClick={() => {
          if (!window.confirm(`Delete ${agent.name} for good? Its record and chat are removed; this cannot be undone.`)) return;
          void run(() => api.deleteAgent(agent.id), () => router.push("/"));
        }}
        className={`${BTN} border-line-strong text-muted hover:border-down hover:text-down`}
      >
        DELETE
      </button>
      {error && <span className="text-down">{error}</span>}
    </span>
  );
}
