"use client";

import { useState } from "react";

import { Glyph } from "@/components/glyph";
import { refreshVault } from "@/components/use-vault";
import { api, type AgentSummary } from "@/lib/api";

/**
 * The judge is the Mastermind: a slider per agent sets its weight, shown as its share of the
 * fund. SAVE re-splits the fund on the server (a share of 0 fires the agent; DELETE removes it).
 */
export function SplitEditor({ agents, onSaved }: { agents: AgentSummary[]; onSaved: () => void }) {
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, Math.round(a.capital_share * 100)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(weights).reduce((t, w) => t + w, 0);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.setCapital(weights);
      refreshVault();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
      {agents.map((a) => (
        <label key={a.id} className="grid grid-cols-[14px_minmax(0,1fr)_minmax(80px,1.2fr)_44px] items-center gap-2.5">
          <Glyph shape={a.shape} color={a.color} size={11} />
          <span className="truncate text-[13px] leading-[1.2] font-medium">{a.name}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={weights[a.id] ?? 0}
            aria-label={`${a.name} share of the fund`}
            onChange={(e) => setWeights({ ...weights, [a.id]: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="text-right font-mono text-[12px] tabular-nums">
            {total ? Math.round(((weights[a.id] ?? 0) / total) * 100) : 0}%
          </span>
        </label>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || total === 0}
          className="h-8 cursor-pointer rounded-[2px] border-0 bg-accent px-4 font-mono text-[11px] leading-none font-semibold tracking-[0.08em] text-on-accent disabled:cursor-default disabled:opacity-40"
        >
          {saving ? "RE-SPLITTING…" : "SAVE SPLIT"}
        </button>
        <span className="font-mono text-[10.5px] text-faint">
          {total === 0 ? "Give at least one agent a share." : "A share of 0 fires an agent. The fund backtests your split."}
        </span>
      </div>
      {error && <div className="font-mono text-xs text-down">SPLIT NOT SAVED · {error}</div>}
    </div>
  );
}
