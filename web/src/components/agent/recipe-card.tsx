"use client";

import type { RecipeOut } from "@/lib/api";
import { formatNum } from "@/lib/format";
import {
  addable,
  addFeature,
  canAdd,
  canRemove,
  flipDirection,
  isEdited,
  normalized,
  removeFeature,
  setLookback,
  setSitOut,
  setTopN,
  setWeight,
} from "@/lib/whatif";

const INPUT = "h-7 rounded-[2px] border border-line-strong bg-bg px-2 text-ink disabled:opacity-40";
const SMALL_BTN =
  "h-7 cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-2 font-mono text-[10.5px] font-semibold text-soft hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-40";

type Props = {
  /** The compiled, live recipe. */
  recipe: RecipeOut;
  /** The recipe as edited here or proposed in the chat; recompiling makes it live. */
  draft: RecipeOut;
  onDraft: (r: RecipeOut) => void;
  onRecompile: () => void;
  open: boolean;
  onOpen: (open: boolean) => void;
  busy: boolean;
  tone: string;
};

/**
 * The agent's compiled recipe, editable in place. Changing it here (or asking the agent to in the
 * chat) makes a draft; RECOMPILE puts the draft through the whole pipeline again.
 */
export function RecipeCard({ recipe, draft, onDraft, onRecompile, open, onOpen, busy, tone }: Props) {
  const edited = isEdited(recipe, draft);
  const weights = normalized(draft).features;
  const floor = draft.sit_out_if_trailing_sharpe_below;
  const options = addable(draft);

  return (
    <div className="flex-none border-b border-line-soft bg-side">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-5 py-[11px] font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-soft hover:text-ink focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-ink"
      >
        <span>
          COMPILED RECIPE
          {edited && <span className="ml-2 text-accent">· EDITED, NOT COMPILED</span>}
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex max-h-[46vh] flex-col gap-3 overflow-y-auto px-5 pt-0.5 pb-4 font-mono text-xs leading-snug">
          <div className="flex flex-col gap-1.5">
            {draft.features.map((f, i) => (
              <div key={f.name} className="grid grid-cols-[minmax(0,1fr)_minmax(70px,1fr)_36px_58px_26px] items-center gap-2">
                <span className="truncate text-ink" title={f.name}>
                  {f.name}
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.round(weights[i].weight * 100)}
                  aria-label={`${f.name} weight`}
                  disabled={busy}
                  onChange={(e) => onDraft(setWeight(normalized(draft), f.name, Number(e.target.value) / 100))}
                  className="w-full"
                  style={{ accentColor: tone }}
                />
                <span className="text-right tabular-nums text-soft">{Math.round(weights[i].weight * 100)}%</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDraft(flipDirection(draft, f.name))}
                  aria-label={`${f.name} direction ${f.direction}; flip`}
                  className={SMALL_BTN}
                >
                  {f.direction === "high" ? "▲ HIGH" : "▼ LOW"}
                </button>
                <button
                  type="button"
                  disabled={busy || !canRemove(draft)}
                  onClick={() => onDraft(removeFeature(draft, f.name))}
                  aria-label={`Drop ${f.name}`}
                  className={SMALL_BTN}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {canAdd(draft) && (
            <select
              aria-label="Add a signal"
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && onDraft(addFeature(draft, e.target.value))}
              className="h-8 rounded-[2px] border border-line-strong bg-bg px-2 font-mono text-xs text-soft"
            >
              <option value="">+ ADD A SIGNAL…</option>
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name} · {o.meaning}
                  {o.marketWide ? " (market-wide: cannot rank stocks)" : ""}
                </option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-soft">
            <label className="flex items-center gap-2">
              TOP
              <input
                type="number"
                min={1}
                max={50}
                value={draft.top_n}
                disabled={busy}
                onChange={(e) => onDraft(setTopN(draft, Number(e.target.value)))}
                className={`${INPUT} w-14`}
              />
            </label>
            <label className="flex items-center gap-2">
              LOOKBACK
              <input
                type="number"
                min={1}
                max={60}
                value={draft.lookback_months}
                disabled={busy}
                onChange={(e) => onDraft(setLookback(draft, Number(e.target.value)))}
                className={`${INPUT} w-14`}
              />
              M
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={floor !== null}
                disabled={busy}
                onChange={(e) => onDraft(setSitOut(draft, e.target.checked ? 0 : null))}
                style={{ accentColor: tone }}
              />
              SIT OUT &lt;
              <input
                type="number"
                step={0.1}
                min={-3}
                max={3}
                disabled={busy || floor === null}
                value={floor ?? ""}
                onChange={(e) => onDraft(setSitOut(draft, Number(e.target.value)))}
                className={`${INPUT} w-16`}
              />
            </label>
          </div>
          <div className="text-faint">
            filters {draft.filters.length ? draft.filters.join(" · ") : "none"} · rebalance {draft.rebalance}
            {floor !== null && ` · sits out below a trailing Sharpe of ${formatNum(floor)}`}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRecompile}
              disabled={busy || !edited}
              className="h-8 cursor-pointer rounded-[2px] border-0 bg-accent px-4 font-mono text-[11px] leading-none font-semibold tracking-[0.08em] text-on-accent disabled:cursor-default disabled:opacity-40"
            >
              {busy ? "WORKING…" : "RECOMPILE"}
            </button>
            <button type="button" onClick={() => onDraft(recipe)} disabled={busy || !edited} className={`${SMALL_BTN} h-8 px-3`}>
              RESET
            </button>
            <span className="text-faint">
              {edited ? "Backtest, Red Team and capital are redone on recompile." : "Edit here, or ask the agent to."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
