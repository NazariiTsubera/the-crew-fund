"use client";

import { useState } from "react";

import { formatNum } from "@/lib/format";
import type { RecipeOut } from "@/lib/api";

/** What Gemini compiled the agent's words into: features and weights, filters, the sit-out rule. */
export function RecipeCard({ recipe, tone }: { recipe: RecipeOut; tone: string }) {
  const [open, setOpen] = useState(false);
  const maxWeight = Math.max(...recipe.features.map((f) => f.weight), 1e-9);
  const sitOut = recipe.sit_out_if_trailing_sharpe_below;

  return (
    <div className="flex-none border-b border-line-soft bg-side">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-5 py-[11px] font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-soft hover:text-ink focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-ink"
      >
        <span>COMPILED RECIPE</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex max-h-[34vh] flex-col gap-3 overflow-y-auto px-5 pt-0.5 pb-4 font-mono text-xs leading-snug">
          <div className="flex flex-col gap-1.5">
            {recipe.features.map((f) => (
              <div key={f.name} className="grid grid-cols-[minmax(0,1fr)_60px_38px_54px] items-center gap-2.5">
                <span className="truncate text-ink">{f.name}</span>
                <span className="relative h-1 bg-line">
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(f.weight / maxWeight) * 100}%`, background: tone }}
                  />
                </span>
                <span className="text-right text-soft">{f.weight.toFixed(2)}</span>
                <span className="text-muted">{f.direction === "high" ? "▲ high" : "▼ low"}</span>
              </div>
            ))}
          </div>
          <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-2.5 gap-y-1">
            <dt className="text-faint">filters</dt>
            <dd className="m-0 text-soft">{recipe.filters.length ? recipe.filters.join(" · ") : "none"}</dd>
            <dt className="text-faint">lookback</dt>
            <dd className="m-0 text-soft">
              {recipe.lookback_months} {recipe.lookback_months === 1 ? "month" : "months"}
            </dd>
            <dt className="text-faint">top_n</dt>
            <dd className="m-0 text-soft">{recipe.top_n}</dd>
            <dt className="text-faint">rebalance</dt>
            <dd className="m-0 text-soft">{recipe.rebalance}</dd>
            <dt className="text-faint">sit out if</dt>
            <dd className="m-0 text-soft">{sitOut === null ? "never" : `trailing Sharpe < ${formatNum(sitOut)}`}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
