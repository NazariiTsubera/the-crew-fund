"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { RecipeCard } from "@/components/agent/recipe-card";
import { Glyph, agentColorVar } from "@/components/glyph";
import { api, type Agent, type ChatMessage, type RecipeOut } from "@/lib/api";

export type ChatLine = ChatMessage | { role: "system"; ts: string; text: string };

/** Lets the page put a question to the agent from outside the chat (the What-if panel's ASK WHY). */
export type ChatHandle = { ask: (text: string) => void };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The API stamps chat rows in UTC; the user's own lines must match or they read hours apart.
export function localStamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

const WHATIF_QUESTIONS = [
  "Is my what-if better than you?",
  "What changed for the what-if in 2022?",
  "Should I trust the what-if?",
];

function suggestionsFor(agent: Agent, lines: ChatLine[]): string[] {
  // The agent's latest answer suggests what to ask next; before that, a standard set.
  const last = [...lines].reverse().find((l) => l.role === "agent");
  if (last && "follow_ups" in last && last.follow_ups?.length) return last.follow_ups;
  const top = [...agent.holdings].sort((a, b) => b.weight - a.weight)[0];
  return [
    "How are you doing?",
    "What happened in 2022?",
    top ? `Why do you hold ${top.ticker}?` : "What do you hold?",
    "What did the Red Team find?",
    "Why did the Mastermind cut you?",
  ];
}

export function SystemLine({ text }: { text: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 font-mono text-[10px] leading-snug font-medium tracking-[0.08em] text-dim">
      <span className="flex-1 border-t border-line" />
      <span className="max-w-[80%] text-center">{text}</span>
      <span className="flex-1 border-t border-line" />
    </div>
  );
}

export function AgentLine({
  agent,
  message,
  dim,
}: {
  agent: Pick<Agent, "name" | "shape" | "color">;
  message: ChatMessage;
  dim: boolean;
}) {
  const evidence = message.evidence ?? [];
  return (
    <div className="flex max-w-[94%] gap-3">
      <div className="grid size-[30px] flex-none place-items-center border border-line-strong">
        <Glyph shape={agent.shape} color={agent.color} dim={dim} size={12} />
      </div>
      <div className="flex min-w-0 flex-col gap-[7px]">
        <span className="font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-muted">
          {agent.name.toUpperCase()} · {message.ts}
          {message.source === "fallback" && (
            <span className="text-faint" title={message.fallback_reason}>
              {" "}
              · FROM ITS FILE{message.fallback_reason && ` · AI ${message.fallback_reason.toUpperCase()}`}
            </span>
          )}
        </span>
        <div className="text-sm leading-normal text-pretty whitespace-pre-wrap text-ink">{message.text}</div>
        {evidence.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-dashed border-line-strong pt-[7px]">
            <span className="font-mono text-[9.5px] leading-none font-medium tracking-[0.14em] text-faint">EVIDENCE</span>
            {evidence.map((e, i) => (
              <span key={i} className="font-mono text-[11px] leading-snug break-words text-muted">
                ▸ {e}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function UserLine({ message }: { message: ChatMessage }) {
  return (
    <div className="flex max-w-[86%] flex-col items-end gap-[5px] self-end">
      <span className="font-mono text-[10px] leading-none text-faint">YOU · {message.ts}</span>
      <div className="rounded-[2px] border border-bubble-line bg-bubble px-3 py-2.5 text-sm leading-snug break-words whitespace-pre-wrap text-ink">
        {message.text}
      </div>
    </div>
  );
}

/** The agent answers from its own file; every reply lists the stored facts it cited. */
export function ChatColumn({
  agent,
  className = "",
  initialLines,
  whatif,
  ref,
}: {
  agent: Agent;
  className?: string;
  /** A transcript the caller already holds (the recruit flow's); skips reading the history. */
  initialLines?: ChatLine[];
  /** A what-if recipe the judge ran; questions go with it so the agent can compare. */
  whatif?: RecipeOut;
  ref?: Ref<ChatHandle>;
}) {
  const [lines, setLines] = useState<ChatLine[]>(initialLines ?? []);
  const [loading, setLoading] = useState(!initialLines);
  const preloaded = initialLines !== undefined;
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const dim = agent.status === "killed";

  useEffect(() => {
    if (preloaded) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const history = await api.chatHistory(agent.id, signal);
        if (history.length) {
          setLines(history);
          return;
        }
        // A fresh file: the agent introduces itself, as it does when it is created.
        const intro = await api.chat(agent.id, undefined, signal);
        setLines([intro]);
      } catch (error) {
        if (signal.aborted) return;
        setLines([{ role: "system", ts: localStamp(), text: `CHAT UNAVAILABLE · ${errorText(error)}` }]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [agent.id, preloaded]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setLines((ls) => [...ls, { role: "user", ts: localStamp(), text: message }]);
    try {
      const reply = await api.chat(agent.id, message, undefined, whatif);
      setLines((ls) => [...ls, reply]);
    } catch (error) {
      setLines((ls) => [
        ...ls,
        { role: "system", ts: localStamp(), text: `NO ANSWER · ${errorText(error)}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  useImperativeHandle(ref, () => ({ ask: (text) => void send(text) }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const tone = dim ? "var(--faint)" : agentColorVar(agent.color);

  return (
    <section aria-label="Chat" className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-line-soft px-5 py-4">
        <div className="min-w-0 truncate text-[15px] leading-none font-medium">{agent.name}</div>
        <span className="flex-none text-right font-mono text-[10px] leading-tight text-faint">AI · cites its log</span>
      </div>

      <RecipeCard recipe={agent.recipe} tone={tone} />

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-busy={loading || busy}
        className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-5"
      >
        {loading && <SystemLine text="OPENING THE FILE…" />}
        {lines.map((line, i) =>
          line.role === "system" ? (
            <SystemLine key={i} text={line.text} />
          ) : line.role === "user" ? (
            <UserLine key={i} message={line} />
          ) : (
            <AgentLine key={i} agent={agent} message={line} dim={dim} />
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2.5 font-mono text-xs leading-none text-muted">
            <span aria-hidden style={{ animation: "crew-blink 1s steps(2) infinite" }}>
              ▍
            </span>
            {agent.name} is checking its log…
          </div>
        )}
      </div>

      {whatif && (
        <div className="mx-5 mb-2 border border-dashed border-accent px-3 py-2 font-mono text-[10.5px] leading-snug text-soft">
          WHAT-IF ACTIVE · {agent.name} will compare it with its live recipe.
        </div>
      )}
      {!loading && !busy && (
        <div className="flex flex-none gap-1.5 overflow-x-auto px-5 pb-2.5">
          {(whatif ? WHATIF_QUESTIONS : suggestionsFor(agent, lines)).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => void send(label)}
              className="h-[30px] flex-none cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-2.5 text-xs leading-none whitespace-nowrap text-soft hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-none items-stretch gap-2 border-t border-line-soft px-5 pt-3 pb-[18px]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          rows={2}
          maxLength={1000}
          aria-label={`Ask ${agent.name} anything`}
          placeholder={`Ask ${agent.name} anything. "How are you doing?"`}
          className="max-h-[140px] min-h-12 min-w-0 flex-1 resize-none rounded-[2px] border border-line-strong bg-panel px-3 py-[11px] text-sm leading-snug text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="min-h-12 flex-none cursor-pointer rounded-[2px] border-0 px-4 font-mono text-xs leading-none font-semibold tracking-[0.08em] text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default"
          style={{ background: busy || !input.trim() ? "var(--line-strong)" : "var(--accent)" }}
        >
          SEND
        </button>
      </form>
    </section>
  );
}
