"use client";

import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  AgentLine,
  SystemLine,
  UserLine,
} from "@/components/agent/chat-column";
import { MicButton } from "@/components/mic-button";

import {
  isRecruiting,
  type RecruitState,
} from "@/lib/recruit";

export const EXAMPLES = [
  "Which signals here capture cheap companies with improving earnings?",
  "I want momentum, but liquidity should matter more than anything else.",
  "How does the Red Team decide whether a strategy survives?",
];

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 font-mono text-xs leading-none text-muted">
    <span
    aria-hidden
    className="inline-block h-3.5 w-2 bg-accent"
    style={{
      animation:
      "crew-blink 0.9s steps(2) infinite",
    }}
    />
    {text}
    </div>
  );
}

function StrategySummary({
  state,
}: {
  state: RecruitState;
}) {
  const total = state.recipe.features.reduce(
    (sum, feature) => sum + feature.weight,
                                             0,
  );

  return (
    <div className="border-b border-line-soft bg-side px-5 py-4">
    <div className="mb-3 font-mono text-[10px] font-medium tracking-[0.14em] text-dim">
    STRATEGY PARAMETERS
    </div>

    <div className="mb-3 text-xs text-muted">
    Signal weights control stock selection. The selected
    stocks are then equally weighted.
    </div>

    <div className="flex flex-col gap-2">
    {state.recipe.features.map((feature) => (
      <div
      key={feature.name}
      className="grid grid-cols-[minmax(0,1fr)_52px_42px] gap-2 font-mono text-xs"
      >
      <span className="truncate text-soft">
      {feature.name}
      </span>

      <span className="text-right text-ink">
      {(feature.weight * 100).toFixed(1)}%
      </span>

      <span className="text-right text-muted">
      {feature.direction === "high"
        ? "HIGH"
        : "LOW"}
        </span>
        </div>
    ))}
    </div>

    <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-y-1 font-mono text-xs">
    <span className="text-faint">
    weight total
    </span>
    <span className="text-soft">
    {(total * 100).toFixed(1)}%
    </span>

    <span className="text-faint">
    filters
    </span>
    <span className="text-soft">
    {state.recipe.filters.length
      ? state.recipe.filters.join(" · ")
      : "none"}
      </span>

      <span className="text-faint">
      lookback
      </span>
      <span className="text-soft">
      {state.recipe.lookback_months} months
      </span>

      <span className="text-faint">
      top N
      </span>
      <span className="text-soft">
      {state.recipe.top_n}
      </span>

      <span className="text-faint">
      rebalance
      </span>
      <span className="text-soft">
      {state.recipe.rebalance}
      </span>

      <span className="text-faint">
      sit out
      </span>
      <span className="text-soft">
      {state.recipe.sit_out_if_trailing_sharpe_below ===
        null
        ? "disabled"
        : `Sharpe < ${state.recipe.sit_out_if_trailing_sharpe_below}`}
        </span>
        </div>
        </div>
  );
}

export function RecruitChat({
  state,
  input,
  onInput,
  onSend,
  onRecruit,
  className = "",
}: {
  state: RecruitState;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  onRecruit: () => void;
  className?: string;
}) {
  const scroller =
  useRef<HTMLDivElement>(null);

  const field =
  useRef<HTMLTextAreaElement>(null);

  const busy = isRecruiting(state) || state.thinking;

  const showBrief =
  state.phase === "idle" &&
  state.lines.length === 0;

  useEffect(() => {
    const el = scroller.current;

    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [
    state.lines,
    state.phase,
    state.recipe,
  ]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSend();
  }

  function onKeyDown(
    e: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();
      onSend();
    }
  }

  function pick(example: string) {
    onInput(example);
    field.current?.focus();
  }

  return (
    <section
    aria-label="Agent strategy chat"
    className={`flex min-h-0 min-w-0 flex-col ${className}`}
    >
    <div className="flex flex-none items-center justify-between gap-2.5 border-b border-line-soft px-5 py-4">
    <div className="min-w-0 truncate text-[15px] font-medium">
    New agent
    </div>

    <span className="flex-none text-right font-mono text-[10px] text-faint">
    AI · strategy recruiter
    </span>
    </div>

    {!showBrief && (
      <StrategySummary state={state} />
    )}

    <div
    ref={scroller}
    role="log"
    aria-live="polite"
    aria-busy={busy}
    className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-5"
    >
    {showBrief && (
      <div className="flex flex-col gap-4 py-2">
      <div className="font-mono text-[10px] font-medium tracking-[0.14em] text-dim">
      FILE 00 // NEW AGENT
      </div>

      <h1 className="m-0 text-base font-normal leading-normal text-pretty text-ink">
      Tell the recruiter how you want this agent to
      invest. It will ask questions and build
      the strategy with you.
      </h1>

      <p className="m-0 text-xs leading-normal text-muted">
      Research first: ask what a signal means or which
      ones suit your idea, and nothing changes until you
      ask for it. The recruiter asks before it compiles.
      </p>

      <div className="flex flex-col gap-1.5">
      {EXAMPLES.map((example) => (
        <button
        key={example}
        type="button"
        onClick={() => pick(example)}
        className="cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-3 py-2.5 text-left text-[13px] leading-snug text-soft hover:border-ink hover:text-ink"
        >
        {example}
        </button>
      ))}
      </div>
      </div>
    )}

    {state.lines.map((line, i) =>
      line.role === "system" ? (
        <SystemLine
        key={i}
        text={line.text}
        />
      ) : line.role === "user" ? (
        <UserLine
        key={i}
        message={line}
        />
      ) : (
        <AgentLine
        key={i}
        agent={
          state.stored ?? {
            name:
            state.name ??
            "The Recruiter",
            persona:
            state.persona ??
            "Investment strategy recruiter.",
            shape: "box",
            color: "sky",
            id: "recruiter",
          } as never
        }
        message={line}
        dim={false}
        />
      ),
    )}

    {state.thinking && <Waiting text="The recruiter is thinking…" />}

    {state.phase === "creating" &&
      state.stage === null && (
        <Waiting text="Sending the confirmed strategy to the backtester…" />
      )}

      {state.phase === "creating" &&
        state.stage === "compiling" && (
          <Waiting text="Locking the validated recipe…" />
        )}

        {state.ready &&
          !busy &&
          state.phase !== "ready" && (
            <div className="border border-accent/40 bg-side p-3 font-mono text-xs text-soft">
            Ready to compile. Say &ldquo;compile it&rdquo; or press
            RECRUIT AGENT, or keep exploring.
            </div>
          )}

          {state.phase === "introducing" &&
            state.stored && (
              <Waiting
              text={`${state.stored.name} is introducing itself…`}
              />
            )}
            </div>

            <form
            onSubmit={onSubmit}
            className="flex flex-none flex-col gap-2 border-t border-line-soft px-5 pt-3 pb-[18px]"
            >
            <textarea
            ref={field}
            value={input}
            onChange={(e) =>
              onInput(e.target.value)
            }
            onKeyDown={onKeyDown}
            disabled={busy}
            rows={2}
            maxLength={2000}
            aria-label="Tell the recruiter about your investment strategy"
            placeholder="Tell the recruiter what you want this agent to invest in…"
            className="max-h-[140px] min-h-12 min-w-0 resize-none rounded-[2px] border border-line-strong bg-panel px-3 py-[11px] text-sm leading-snug text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
            />

            <div className="flex justify-end gap-2">
            <MicButton
            value={input}
            onChange={onInput}
            disabled={busy}
            className="h-10"
            />

            <button
            type="submit"
            disabled={
              busy ||
              !input.trim()
            }
            className="h-10 rounded-[2px] border border-line-strong bg-transparent px-4 font-mono text-xs font-semibold tracking-[0.08em] text-soft hover:text-ink disabled:cursor-default disabled:opacity-40"
            >
            SEND
            </button>

            <button
            type="button"
            onClick={onRecruit}
            disabled={
              busy ||
              !state.ready
            }
            className="h-10 rounded-[2px] border-0 px-4 font-mono text-xs font-semibold tracking-[0.08em] text-bg disabled:cursor-default disabled:opacity-40"
            style={{
              background: state.ready
              ? "var(--accent)"
              : "var(--line-strong)",
            }}
            >
            RECRUIT AGENT
            </button>
            </div>
            </form>
            </section>
  );
}
