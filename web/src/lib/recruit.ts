import type {
  Agent,
  AgentReply,
  ChatMessage,
  CreateEvent,
  Kpis,
  RecipeOut,
  StoredAgent,
} from "@/lib/api";

import { formatNum, formatPct } from "@/lib/format";

export type RecruitLine =
| ChatMessage
| {
  role: "system";
  ts: string;
  text: string;
};

export type RecruitStage =
| "compiling"
| "backtesting"
| "redteam";

  export type RecruitPhase =
  | "idle"
  | "chatting"
  | "creating"
  | "introducing"
  | "ready"
  | "failed";

  export type StrategyTurn = {
    role: "user" | "assistant";
    text: string;
  };

  export type RecruitState = {
    phase: RecruitPhase;
    stage: RecruitStage | null;

    name: string | null;
    persona: string | null;
    strategyLine: string | null;
    pitch: string | null;

    recipe: RecipeOut;

    kpis: Kpis | null;
    stored: StoredAgent | null;
    agent: Agent | null;

    lines: RecruitLine[];
    history: StrategyTurn[];

    ready: boolean;
    /** A message is with Gemini; SEND waits for its answer. */
    thinking: boolean;
  };

  export const DEFAULT_RECIPE: RecipeOut = {
    features: [
      {
        name: "fundamental_surprise",
        weight: 0.4,
        direction: "high",
      },
      {
        name: "log_fv_gap",
        weight: 0.3,
        direction: "low",
      },
      {
        name: "measured_half_life",
        weight: 0.2,
        direction: "high",
      },
      {
        name: "growth_kalman_update",
        weight: 0.1,
        direction: "high",
      },
    ],
    filters: [],
    lookback_months: 12,
    top_n: 10,
    rebalance: "monthly",
    sit_out_if_trailing_sharpe_below: null,
  };

  export const initialRecruit: RecruitState = {
    phase: "idle",
    stage: null,

    name: null,
    persona: null,
    strategyLine: null,
    pitch: null,

    recipe: DEFAULT_RECIPE,

    kpis: null,
    stored: null,
    agent: null,

    lines: [],
    history: [],

    ready: false,
    thinking: false,
  };

  export function isRecruiting(state: RecruitState): boolean {
    return (
      state.phase === "creating" ||
      state.phase === "introducing"
    );
  }

  function system(
    state: RecruitState,
    ts: string,
    text: string,
  ): RecruitLine[] {
    return [
      ...state.lines,
      {
        role: "system",
        ts,
        text,
      },
    ];
  }

  function onEvent(
    state: RecruitState,
    event: CreateEvent,
    ts: string,
  ): RecruitState {
    switch (event.event) {
      case "compiling":
        return {
          ...state,
          phase: "creating",
          stage: "compiling",
          lines: system(
            state,
            ts,
            "RECRUITMENT CONFIRMED · COMPILING RECIPE…",
          ),
        };

      case "backtesting": {
        const { name, recipe } = event.data;

        return {
          ...state,
          stage: "backtesting",
          name,
          recipe,
          lines: system(
            state,
            ts,
            `RECIPE LOCKED: ${name.toUpperCase()} · BACKTESTING 2017–2026…`,
          ),
        };
      }

      case "redteam": {
        const { kpis } = event.data;

        return {
          ...state,
          stage: "redteam",
          kpis,
          lines: system(
            state,
            ts,
            `BACKTESTED · SHARPE ${formatNum(
              kpis.sharpe,
            )} · TOTAL RETURN ${formatPct(
              kpis.total_return,
            )} · RED TEAM ATTACKING…`,
          ),
        };
      }

      case "done": {
        const { agent } = event.data;
        const verdict = agent.redteam.verdict;

        const fate =
        verdict === "killed"
        ? "WILL NOT TRADE"
        : "JOINS THE CREW";

        return {
          ...state,
          phase: "introducing",
          stage: null,
          name: agent.name,
          recipe: agent.recipe,
          kpis: agent.kpis,
          stored: agent,
          lines: system(
            state,
            ts,
            `RED TEAM VERDICT: ${verdict.toUpperCase()} · ${agent.name.toUpperCase()} ${fate}`,
          ),
        };
      }

      case "error":
        return {
          ...state,
          phase: "failed",
          stage: null,
          lines: system(
            state,
            ts,
            `NOT RECRUITED · ${event.data.message}`,
          ),
        };
    }
  }

  export type RecruitAction =
  | {
    type: "user";
    text: string;
    ts: string;
  }
  | {
    type: "assistant";
    text: string;
    ts: string;
  }
  | {
    type: "strategy";
    recipe: RecipeOut;
    name: string;
    persona: string;
    strategyLine: string;
    pitch: string;
    ready: boolean;
  }
  | {
    type: "start";
    prompt: string;
    ts: string;
  }
  | {
    type: "event";
    event: CreateEvent;
    ts: string;
  }
  | {
    type: "failed";
    message: string;
    ts: string;
  }
  | {
    type: "loaded";
    agent: Agent;
  }
  | {
    type: "loadFailed";
    message: string;
    ts: string;
  }
  | {
    type: "introduced";
    reply: AgentReply
  }
  | {
    type: "introFailed";
    message: string;
    ts: string;
  };

  export function recruitReducer(
    state: RecruitState,
    action: RecruitAction,
  ): RecruitState {
    switch (action.type) {
      case "user":
        if (isRecruiting(state) || state.thinking) return state;

        return {
          ...state,
          phase: "chatting",
          ready: false,
          thinking: true,
          lines: [
            ...state.lines,
            {
              role: "user",
              ts: action.ts,
              text: action.text,
            },
          ],
          history: [
            ...state.history,
            {
              role: "user",
              text: action.text,
            },
          ],
        };

      case "assistant":
        return {
          ...state,
          thinking: false,
          lines: [
            ...state.lines,
            {
              role: "agent",
              ts: action.ts,
              text: action.text,
              source: "gemini",
              evidence: [],
            },
          ],
          history: [
            ...state.history,
            {
              role: "assistant",
              text: action.text,
            },
          ],
        };

      case "strategy":
        return {
          ...state,
          phase: "chatting",
          recipe: action.recipe,
          name: action.name,
          persona: action.persona,
          strategyLine: action.strategyLine,
          pitch: action.pitch,
          ready: action.ready,
        };

      case "start":
        if (
          isRecruiting(state) ||
          state.phase === "ready"
        ) {
          return state;
        }

        return {
          ...state,
          phase: "creating",
          ready: false,
          lines: [
            ...state.lines,
            {
              role: "user",
              ts: action.ts,
              text: "CREATE THIS AGENT",
            },
          ],
        };

      case "event":
        return state.phase === "creating"
        ? onEvent(state, action.event, action.ts)
        : state;

      case "failed":
        if (state.phase !== "creating") return state;

        return {
          ...state,
          phase: "failed",
          stage: null,
          lines: system(
            state,
            action.ts,
            `NOT RECRUITED · ${action.message}`,
          ),
        };

      case "loaded":
        return {
          ...state,
          agent: action.agent,
        };

      case "loadFailed":
        return {
          ...state,
          lines: system(
            state,
            action.ts,
            `PERFORMANCE UNAVAILABLE · ${action.message}`,
          ),
        };

      case "introduced":
        return state.phase === "introducing"
        ? {
          ...state,
          phase: "ready",
          lines: [
            ...state.lines,
            action.reply,
          ],
        }
        : state;

      case "introFailed":
        if (state.phase !== "introducing") return state;

        return {
          ...state,
          phase: "ready",
          lines: system(
            state,
            action.ts,
            `NO INTRODUCTION · ${action.message}`,
          ),
        };
    }
  }
