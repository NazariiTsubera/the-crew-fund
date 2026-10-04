"use client";

import { useState, type FormEvent } from "react";

import { api, type Agent, type RecipeOut, type WhatIf } from "@/lib/api";
import { MARKET_WIDE } from "@/lib/features";
import { formatNum, formatPct } from "@/lib/format";
import {
  addable,
  addFeature,
  canAdd,
  canRemove,
  flipDirection,
  isEdited,
  MAX_FEATURES,
  normalized,
  removeFeature,
  setLookback,
  setSitOut,
  setTopN,
  setWeight,
} from "@/lib/whatif";

const LABEL = "font-mono text-[11px] leading-none font-medium tracking-[0.12em] text-dim";
const BTN =
  "h-8 cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-3 font-mono text-[11px] leading-none font-semibold tracking-[0.08em] text-soft hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-40";

export type Variant = { recipe: RecipeOut; result: WhatIf };

type Props = {
  agent: Agent;
  variant: Variant | null;
  onVariant: (v: Variant | null) => void;
  /** Asks the agent, in the chat column, why the variant beat or trailed it. */
  onAskWhy?: () => void;
};

const INPUT = "h-7 rounded-[2px] border border-line-strong bg-bg px-2 text-ink disabled:opacity-40";

function Delta({ label, live, test, pct = true }: { label: string; live: number; test: number; pct?: boolean }) {
  const fmt = (x: number) => (pct ? formatPct(x) : formatNum(x));
  const better = test > live + 1e-9;
  const worse = test < live - 1e-9;
  return (
    <div className="flex flex-col gap-1 border border-line-soft px-3 py-2.5">
      <span className="font-mono text-[10px] leading-none tracking-[0.1em] text-dim">{label}</span>
      <span className="font-mono text-sm leading-none text-ink">{fmt(test)}</span>
      <span className="font-mono text-[10.5px] leading-none text-muted">
        live {fmt(live)}{" "}
        <span style={{ color: better ? "var(--up)" : worse ? "var(--down)" : "var(--muted)" }}>
          {better ? "▲" : worse ? "▼" : "="}
        </span>
      </span>
    </div>
  );
}

/**
 * Tune the agent's recipe and see how the variant would have done: the same backtest and red
 * team every agent gets, run on the server and never stored. The chart and the chat pick the
 * variant up, so a judge can ask the agent why it did better or worse.
 */
export function WhatIfPanel({ agent, variant, onVariant, onAskWhy }: Props) {
  // Open by default: the panel is the page's main interaction and a collapsed header got missed.
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<RecipeOut>(variant?.recipe ?? agent.recipe);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [aiReply, setAiReply] = useState<{ text: string; changed: boolean } | null>(null);
  const edited = isEdited(agent.recipe, draft);
  const weights = normalized(draft).features;
  const busy = running || compiling;
  const options = addable(draft);
  const wideInDraft = draft.features.filter((f) => MARKET_WIDE.includes(f.name)).map((f) => f.name);

  // The AI only rewrites the draft; the judge still presses RUN, so nothing is backtested unseen.
  async function recompile(e: FormEvent) {
    e.preventDefault();
    const message = instruction.trim();
    if (!message || busy) return;
    setCompiling(true);
    setError(null);
    try {
      const out = await api.whatifCompile(agent.id, message, draft);
      if (out.changed) setDraft(out.recipe);
      setAiReply({ text: out.reply, changed: out.changed });
      setInstruction("");
    } catch (err) {
      setError(`RECOMPILE FAILED · ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCompiling(false);
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const result = await api.whatif(agent.id, draft);
      onVariant({ recipe: draft, result });
    } catch (e) {
      setError(`WHAT-IF FAILED · ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setDraft(agent.recipe);
    setError(null);
    setAiReply(null);
    onVariant(null);
  }

  const floor = draft.sit_out_if_trailing_sharpe_below;
  const result = variant?.result;
  const passed = result ? result.redteam.tests.filter((t) => t.passed).length : 0;

  return (
    <section aria-label="What if" className="flex flex-col gap-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-baseline justify-between gap-2 border-0 bg-transparent p-0 text-left"
      >
        <span className={LABEL}>WHAT IF · TUNE THE RECIPE YOURSELF</span>
        <span className="font-mono text-[11px] text-soft">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3.5 border border-line bg-panel p-4">
          <p className="m-0 text-xs leading-snug text-muted">
            Add or drop signals, change the weights, directions or rules, by hand or by telling the AI, then run
            the variant through the same backtest and Red Team. Nothing is saved; ask {agent.name} about it in the
            chat.
          </p>

          <form onSubmit={(e) => void recompile(e)} className="flex flex-col gap-2">
            <label htmlFor="whatif-ai" className={LABEL}>
              RECOMPILE WITH AI
            </label>
            <div className="flex items-stretch gap-2">
              <textarea
                id="whatif-ai"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={busy}
                rows={2}
                maxLength={2000}
                placeholder='e.g. "lean harder into valuation, drop the volatility signal"'
                className="min-h-12 min-w-0 flex-1 resize-none rounded-[2px] border border-line-strong bg-bg px-3 py-2 text-[13px] leading-snug text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
              />
              <button type="submit" disabled={busy || !instruction.trim()} className={`${BTN} h-auto min-h-12`}>
                {compiling ? "RECOMPILING…" : "RECOMPILE WITH AI"}
              </button>
            </div>
            {aiReply && (
              <div className="flex flex-col gap-1.5 border-l-2 border-accent py-0.5 pl-3">
                <span className="font-mono text-[10px] leading-none tracking-[0.1em] text-dim">
                  AI ·{" "}
                  {aiReply.changed ? "DRAFT UPDATED · PRESS RUN WHAT-IF TO BACKTEST IT" : "DRAFT UNCHANGED"}
                </span>
                <p className="m-0 text-xs leading-snug whitespace-pre-wrap text-soft">{aiReply.text}</p>
              </div>
            )}
          </form>

          <div className="flex flex-col gap-2">
            {draft.features.map((f, i) => (
              <div
                key={f.name}
                className="grid grid-cols-[minmax(0,1fr)_minmax(90px,1.2fr)_44px_56px_28px] items-center gap-2.5 font-mono text-xs"
              >
                <span className="truncate text-soft" title={f.name}>
                  {f.name}
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.round(f.weight * 100)}
                  aria-label={`${f.name} weight`}
                  onChange={(e) => setDraft(setWeight(draft, f.name, Number(e.target.value) / 100))}
                  className="w-full accent-[var(--accent)]"
                />
                <span className="text-right tabular-nums text-ink">{Math.round(weights[i].weight * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setDraft(flipDirection(draft, f.name))}
                  aria-label={`${f.name} direction ${f.direction}; flip`}
                  className="h-7 cursor-pointer rounded-[2px] border border-line-strong bg-transparent font-mono text-[10.5px] font-semibold text-soft hover:border-ink hover:text-ink"
                >
                  {f.direction === "high" ? "HIGH ▲" : "LOW ▼"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(removeFeature(draft, f.name))}
                  disabled={!canRemove(draft)}
                  aria-label={`Drop ${f.name}`}
                  title={canRemove(draft) ? `Drop ${f.name}` : "A recipe needs at least one signal"}
                  className="h-7 cursor-pointer rounded-[2px] border border-line-strong bg-transparent font-mono text-xs text-soft hover:border-down hover:text-down disabled:cursor-default disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <select
              aria-label="Add a signal"
              value=""
              disabled={!canAdd(draft) || busy}
              onChange={(e) => e.target.value && setDraft(addFeature(draft, e.target.value))}
              className={`${INPUT} h-8 w-full min-w-0 font-mono text-xs`}
            >
              <option value="">
                {canAdd(draft) ? "+ ADD A SIGNAL…" : `${MAX_FEATURES} SIGNALS IS THE MOST A RECIPE TAKES`}
              </option>
              <optgroup label="Ranks stocks">
                {options
                  .filter((o) => !o.marketWide)
                  .map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name} · {o.meaning}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Market-wide · cannot rank stocks">
                {options
                  .filter((o) => o.marketWide)
                  .map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name} · {o.meaning}
                    </option>
                  ))}
              </optgroup>
            </select>
            {wideInDraft.length > 0 && (
              <p role="note" className="m-0 font-mono text-[11px] leading-snug text-accent">
                {wideInDraft.join(", ")} {wideInDraft.length > 1 ? "are" : "is"} market-wide: one value per date for
                every stock, so {wideInDraft.length > 1 ? "they" : "it"} cannot rank stocks. Only the other signals
                pick the names.
              </p>
            )}
          </div>

          {draft.filters.length > 0 && (
            <div className="font-mono text-[11px] leading-snug text-muted">
              <span className="text-dim">FILTERS · </span>
              {draft.filters.join(" · ")}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 font-mono text-xs text-soft">
            <label className="flex items-center gap-2">
              TOP
              <input
                type="number"
                min={1}
                max={50}
                value={draft.top_n}
                onChange={(e) => setDraft(setTopN(draft, Number(e.target.value)))}
                className={`${INPUT} w-14`}
              />
              NAMES
            </label>
            <label className="flex items-center gap-2">
              LOOKBACK
              <input
                type="number"
                min={1}
                max={60}
                value={draft.lookback_months}
                onChange={(e) => setDraft(setLookback(draft, Number(e.target.value)))}
                className={`${INPUT} w-14`}
              />
              MONTHS
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={floor !== null}
                onChange={(e) => setDraft(setSitOut(draft, e.target.checked ? 0 : null))}
                className="accent-[var(--accent)]"
              />
              SIT OUT BELOW SHARPE
              <input
                type="number"
                step={0.1}
                min={-3}
                max={3}
                disabled={floor === null}
                value={floor ?? ""}
                onChange={(e) => setDraft(setSitOut(draft, Number(e.target.value)))}
                className={`${INPUT} w-16`}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || !edited}
              className="h-8 cursor-pointer rounded-[2px] border-0 bg-accent px-4 font-mono text-[11px] leading-none font-semibold tracking-[0.08em] text-on-accent disabled:cursor-default disabled:opacity-40"
            >
              {running ? "BACKTESTING…" : "RUN WHAT-IF"}
            </button>
            <button type="button" onClick={reset} disabled={busy || (!edited && !variant)} className={BTN}>
              RESET
            </button>
            {!edited && !variant && <span className="font-mono text-[11px] text-faint">Change something to run it.</span>}
          </div>

          {error && <div className="font-mono text-xs leading-snug text-down">{error}</div>}

          {result && (
            <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={LABEL}>WHAT-IF RESULT · DASHED LINE ON THE CHART</span>
                <span
                  className="font-mono text-[11px] font-semibold tracking-[0.08em]"
                  style={{
                    color:
                      result.redteam.verdict === "pass"
                        ? "var(--up)"
                        : result.redteam.verdict === "killed"
                          ? "var(--down)"
                          : "var(--accent)",
                  }}
                >
                  RED TEAM {result.redteam.verdict.toUpperCase()} · {passed} OF {result.redteam.tests.length} PASSED
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
                <Delta label="TOTAL RETURN" live={agent.kpis.total_return} test={result.kpis.total_return} />
                <Delta label="SHARPE" live={agent.kpis.sharpe} test={result.kpis.sharpe} pct={false} />
                <Delta label="MAX DRAWDOWN" live={agent.kpis.max_drawdown} test={result.kpis.max_drawdown} />
                <Delta label="ANN. RETURN" live={agent.kpis.ann_return} test={result.kpis.ann_return} />
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[11px] leading-snug text-muted">
                {result.redteam.tests.map((t) => (
                  <li key={t.name}>
                    <span style={{ color: t.passed ? "var(--up)" : "var(--down)" }}>{t.passed ? "PASS" : "FAIL"}</span>{" "}
                    {t.name} · {t.detail}
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[11.5px] leading-snug text-faint">
                A curve tuned by hand until it looks good is the overfitting the Red Team exists to catch; trust a
                variant only if it passes.
              </p>
              {onAskWhy && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={onAskWhy} className={BTN}>
                    ASK WHY
                  </button>
                  <span className="text-[11.5px] leading-snug text-muted">
                    {agent.name} explains, in the chat, why this variant beat or trailed it.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
