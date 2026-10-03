import type { Agent, AgentReply, ChatMessage, CreateEvent, Kpis, RecipeOut, StoredAgent } from "@/lib/api";
import { formatNum, formatPct } from "@/lib/format";

// The creation flow at /agents/new as a reducer: POST /agents' stream events, the full agent
// fetched after `done`, and the agent's first message, folded into chat lines and a stage.

export type RecruitLine = ChatMessage | { role: "system"; ts: string; text: string };

export type RecruitStage = "compiling" | "backtesting" | "redteam";

export type RecruitPhase = "idle" | "creating" | "introducing" | "ready" | "failed";

export type RecruitState = {
  phase: RecruitPhase;
  /** The stage the server is working on, as its last event announced. */
  stage: RecruitStage | null;
  name: string | null;
  recipe: RecipeOut | null;
  kpis: Kpis | null;
  /** The stored document from `done`: no curve or holdings yet. */
  stored: StoredAgent | null;
  /** GET /agents/{id}, which the Performance column draws. */
  agent: Agent | null;
  lines: RecruitLine[];
};

export type RecruitAction =
  | { type: "start"; prompt: string; ts: string }
  | { type: "refused"; message: string; ts: string }
  | { type: "event"; event: CreateEvent; ts: string }
  | { type: "failed"; message: string; ts: string }
  | { type: "loaded"; agent: Agent }
  | { type: "loadFailed"; message: string; ts: string }
  | { type: "introduced"; reply: AgentReply }
  | { type: "introFailed"; message: string; ts: string };

export const initialRecruit: RecruitState = {
  phase: "idle",
  stage: null,
  name: null,
  recipe: null,
  kpis: null,
  stored: null,
  agent: null,
  lines: [],
};

/** The strategy to send, or null when there is nothing to send (the API refuses it too). */
export function recruitPrompt(raw: string): string | null {
  const prompt = raw.trim();
  return prompt ? prompt : null;
}

/** True while a creation or the first message is in flight: RECRUIT stays disabled. */
export function isRecruiting(state: RecruitState): boolean {
  return state.phase === "creating" || state.phase === "introducing";
}

function system(state: RecruitState, ts: string, text: string): RecruitLine[] {
  return [...state.lines, { role: "system", ts, text }];
}

function onEvent(state: RecruitState, event: CreateEvent, ts: string): RecruitState {
  switch (event.event) {
    case "compiling":
      return { ...state, stage: "compiling", lines: system(state, ts, "COMPILING RECIPE…") };
    case "backtesting": {
      const { name, recipe } = event.data;
      const text = `RECIPE COMPILED: ${name.toUpperCase()} · BACKTESTING 2017–2026…`;
      return { ...state, stage: "backtesting", name, recipe, lines: system(state, ts, text) };
    }
    case "redteam": {
      const { kpis } = event.data;
      const text = `BACKTESTED · SHARPE ${formatNum(kpis.sharpe)} · TOTAL RETURN ${formatPct(kpis.total_return)} · RED TEAM ATTACKING…`;
      return { ...state, stage: "redteam", kpis, lines: system(state, ts, text) };
    }
    case "done": {
      const { agent } = event.data;
      const verdict = agent.redteam.verdict;
      const fate = verdict === "killed" ? "WILL NOT TRADE" : "JOINS THE CREW";
      const text = `RED TEAM VERDICT: ${verdict.toUpperCase()} · ${agent.name.toUpperCase()} ${fate}`;
      return {
        ...state,
        phase: "introducing",
        stage: null,
        name: agent.name,
        recipe: agent.recipe,
        kpis: agent.kpis,
        stored: agent,
        lines: system(state, ts, text),
      };
    }
    case "error":
      return { ...state, phase: "failed", stage: null, lines: system(state, ts, `NOT RECRUITED · ${event.data.message}`) };
  }
}

export function recruitReducer(state: RecruitState, action: RecruitAction): RecruitState {
  switch (action.type) {
    case "start":
      if (isRecruiting(state) || state.phase === "ready") return state;
      return {
        ...initialRecruit,
        phase: "creating",
        lines: [...state.lines, { role: "user", ts: action.ts, text: action.prompt }],
      };
    case "refused":
      if (isRecruiting(state) || state.phase === "ready") return state;
      return { ...state, lines: system(state, action.ts, `NOT RECRUITED · ${action.message}`) };
    case "event":
      return state.phase === "creating" ? onEvent(state, action.event, action.ts) : state;
    case "failed":
      if (state.phase !== "creating") return state;
      return { ...state, phase: "failed", stage: null, lines: system(state, action.ts, `NOT RECRUITED · ${action.message}`) };
    case "loaded":
      return { ...state, agent: action.agent };
    case "loadFailed":
      return { ...state, lines: system(state, action.ts, `PERFORMANCE UNAVAILABLE · ${action.message}`) };
    case "introduced":
      return state.phase === "introducing" ? { ...state, phase: "ready", lines: [...state.lines, action.reply] } : state;
    case "introFailed":
      if (state.phase !== "introducing") return state;
      return { ...state, phase: "ready", lines: system(state, action.ts, `NO INTRODUCTION · ${action.message}`) };
  }
}
