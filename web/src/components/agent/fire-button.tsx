"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { refreshVault } from "@/components/use-vault";
import { api } from "@/lib/api";

/** The judge fires an agent: deleted with its record and chat, and the fund re-splits. */
export function FireButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [firing, setFiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fire() {
    if (!window.confirm(`Fire ${name}? It is deleted with its record and chat, and the fund re-splits.`)) return;
    setFiring(true);
    setError(null);
    try {
      await api.fireAgent(id);
      refreshVault();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFiring(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void fire()}
        disabled={firing}
        className="h-[26px] cursor-pointer rounded-[2px] border border-down/60 bg-transparent px-2.5 font-mono text-[10.5px] leading-none font-semibold tracking-[0.08em] text-down hover:bg-down hover:text-bg disabled:cursor-default disabled:opacity-40"
      >
        {firing ? "FIRING…" : "FIRE"}
      </button>
      {error && <span className="text-down">{error}</span>}
    </span>
  );
}
