"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

import { AgentLine, SystemLine, UserLine } from "@/components/agent/chat-column";
import { RecipeCard } from "@/components/agent/recipe-card";
import { isRecruiting, type RecruitState } from "@/lib/recruit";

// The design's three example strategies ("FILE 00 // UNNAMED RECRUIT").
export const EXAMPLES = [
  "Buy companies whose earnings beat what the market had priced in, and hold while the surprise decays.",
  "Buy cheap quality megacaps when their fair-value gap starts closing fast. Skip anything illiquid.",
  "Go to cash when funding stress spikes; otherwise hold long-duration large caps.",
];

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 font-mono text-xs leading-none text-muted">
      <span aria-hidden className="inline-block h-3.5 w-2 bg-accent" style={{ animation: "crew-blink 0.9s steps(2) infinite" }} />
      {text}
    </div>
  );
}

/** The chat column before the agent exists: the brief, examples, the stream's stages, the first message. */
export function RecruitChat({
  state,
  input,
  onInput,
  onRecruit,
  className = "",
}: {
  state: RecruitState;
  input: string;
  onInput: (value: string) => void;
  onRecruit: () => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const busy = isRecruiting(state);
  const filed = state.stored;
  const showBrief = state.phase === "idle" || state.phase === "failed";

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.lines, state.phase]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onRecruit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onRecruit();
    }
  }

  function pick(example: string) {
    onInput(example);
    field.current?.focus();
  }

  return (
    <section aria-label="Chat" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-line-soft px-5 py-4">
        <div className="min-w-0 truncate text-[15px] leading-none font-medium">{state.name ?? "New agent"}</div>
        <span className="flex-none text-right font-mono text-[10px] leading-tight text-faint">Gemini · compiles your words</span>
      </div>

      {state.recipe && <RecipeCard recipe={state.recipe} tone="var(--accent)" />}

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-5"
      >
        {showBrief && (
          <div className="flex flex-col gap-4 py-2">
            <div className="font-mono text-[10px] leading-none font-medium tracking-[0.14em] text-dim">
              FILE 00 // UNNAMED RECRUIT
            </div>
            <h1 className="m-0 text-base leading-normal font-normal text-pretty text-ink">
              Describe a strategy. Example: Buy stocks where options skew is rising and informed flow is building, but
              skip anything illiquid.
            </h1>
            <p className="m-0 text-xs leading-normal text-muted">
              Takes about 15 seconds: compile the recipe, backtest 2017–2026, survive the Red Team.
            </p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => pick(example)}
                  className="cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-3 py-2.5 text-left text-[13px] leading-snug text-soft hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.lines.map((line, i) =>
          line.role === "system" ? (
            <SystemLine key={i} text={line.text} />
          ) : line.role === "user" ? (
            <UserLine key={i} message={line} />
          ) : filed ? (
            <AgentLine key={i} agent={filed} message={line} dim={filed.status === "killed"} />
          ) : null,
        )}

        {state.phase === "creating" && state.stage === null && <Waiting text="Sending your strategy to the compiler…" />}
        {state.phase === "introducing" && filed && <Waiting text={`${filed.name} is introducing itself…`} />}
      </div>

      <form onSubmit={onSubmit} className="flex flex-none items-end gap-2 border-t border-line-soft px-5 pt-3 pb-[18px]">
        <textarea
          ref={field}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy || state.phase === "ready"}
          rows={2}
          maxLength={2000}
          aria-label="Describe a strategy in plain English"
          placeholder="Describe a strategy in plain English…"
          className="max-h-[140px] min-h-12 min-w-0 flex-1 resize-none rounded-[2px] border border-line-strong bg-panel px-3 py-[11px] text-sm leading-snug text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || state.phase === "ready"}
          className="h-12 flex-none cursor-pointer rounded-[2px] border-0 px-4 font-mono text-xs leading-none font-semibold tracking-[0.08em] text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default"
          style={{ background: busy ? "var(--line-strong)" : "var(--accent)" }}
        >
          RECRUIT
        </button>
      </form>
    </section>
  );
}
