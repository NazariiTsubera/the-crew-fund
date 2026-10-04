import { describe, expect, it } from "vitest";

import type { Agent, AgentReply, CreateEvent, Kpis, RecipeOut, StoredAgent } from "@/lib/api";
import {
  DEFAULT_RECIPE,
  initialRecruit,
  isRecruiting,
  recruitReducer,
  type RecruitAction,
  type RecruitState,
} from "@/lib/recruit";

const TS = "2026-10-03 12:00";

const recipe: RecipeOut = {
  features: [{ name: "options_skew_change", weight: 0.6, direction: "high" }],
  filters: ["liquid"],
  lookback_months: 12,
  top_n: 10,
  rebalance: "monthly",
  sit_out_if_trailing_sharpe_below: null,
};

const kpis: Kpis = {
  total_return: 0.62,
  ann_return: 0.0516,
  ann_vol: 0.0943,
  sharpe: 0.5477,
  max_drawdown: -0.1336,
  max_drawdown_month: "2020-10",
  turnover: 0.21,
  trailing_12m_sharpe: 0.7056,
};

const stored = {
  id: "skew-hunter-ab12cd",
  name: "The Skew Hunter",
  verdict: "probation",
  redteam: { verdict: "probation", tests: [] },
  recipe,
  kpis,
} as unknown as StoredAgent;

const reply: AgentReply = {
  ts: TS,
  role: "agent",
  text: "I buy rising skew.",
  evidence: ["Sharpe 0.55"],
  source: "gemini",
};

function run(actions: RecruitAction[], from: RecruitState = initialRecruit): RecruitState {
  return actions.reduce(recruitReducer, from);
}

const ev = (event: CreateEvent): RecruitAction => ({ type: "event", event, ts: TS });
const start: RecruitAction = { type: "start", prompt: "Buy rising skew", ts: TS };
const fullStream: RecruitAction[] = [
  start,
  ev({ event: "compiling", data: {} }),
  ev({ event: "backtesting", data: { name: "The Skew Hunter", recipe } }),
  ev({ event: "redteam", data: { kpis } }),
  ev({ event: "done", data: { agent: stored } }),
];

describe("the strategy chat", () => {
  const user: RecruitAction = { type: "user", text: "Cheap names with earnings surprises", ts: TS };
  const strategy: RecruitAction = {
    type: "strategy",
    recipe,
    name: "The Skew Hunter",
    persona: "Patient.",
    strategyLine: "Buys rising skew.",
    pitch: "I buy rising skew.",
    ready: true,
  };

  it("starts from the default recipe, not ready", () => {
    expect(initialRecruit.recipe).toEqual(DEFAULT_RECIPE);
    expect(initialRecruit.ready).toBe(false);
  });

  it("records the user's message and waits for Gemini", () => {
    const s = run([user]);
    expect(s.phase).toBe("chatting");
    expect(s.thinking).toBe(true);
    expect(s.history).toEqual([{ role: "user", text: user.type === "user" ? user.text : "" }]);
    expect(s.lines).toEqual([{ role: "user", ts: TS, text: "Cheap names with earnings surprises" }]);
  });

  it("ignores a second message while Gemini is answering", () => {
    const s = run([user]);
    expect(run([user], s)).toBe(s);
  });

  it("takes Gemini's reply and strategy, and is ready when Gemini says so", () => {
    const s = run([user, { type: "assistant", text: "Done.", ts: TS }, strategy]);
    expect(s.thinking).toBe(false);
    expect(s.history.at(-1)).toEqual({ role: "assistant", text: "Done." });
    expect(s).toMatchObject({ recipe, name: "The Skew Hunter", ready: true });
  });

  it("is no longer ready once the user changes the strategy again", () => {
    const s = run([user, { type: "assistant", text: "Done.", ts: TS }, strategy, user]);
    expect(s.ready).toBe(false);
  });
});

describe("recruitReducer", () => {
  it("starts idle with no lines", () => {
    expect(initialRecruit).toMatchObject({ phase: "idle", stage: null, lines: [] });
    expect(isRecruiting(initialRecruit)).toBe(false);
  });

  it("puts the user's strategy in the chat when a creation starts", () => {
    const s = run([start]);
    expect(s.phase).toBe("creating");
    expect(s.lines).toEqual([{ role: "user", ts: TS, text: "CREATE THIS AGENT" }]);
    expect(isRecruiting(s)).toBe(true);
  });

  it("turns each stream event into a stage and a system line", () => {
    const compiling = run(fullStream.slice(0, 2));
    expect(compiling.stage).toBe("compiling");
    expect(compiling.lines.at(-1)).toEqual({ role: "system", ts: TS, text: "RECRUITMENT CONFIRMED · COMPILING RECIPE…" });

    const backtesting = run(fullStream.slice(0, 3));
    expect(backtesting.stage).toBe("backtesting");
    expect(backtesting.name).toBe("The Skew Hunter");
    expect(backtesting.recipe).toEqual(recipe);
    expect(backtesting.lines.at(-1)?.text).toBe("RECIPE LOCKED: THE SKEW HUNTER · BACKTESTING 2017–2026…");

    const redteam = run(fullStream.slice(0, 4));
    expect(redteam.stage).toBe("redteam");
    expect(redteam.kpis).toEqual(kpis);
    expect(redteam.lines.at(-1)?.text).toBe("BACKTESTED · SHARPE 0.55 · TOTAL RETURN +62.0% · RED TEAM ATTACKING…");
  });

  it("files the agent on done and waits for its introduction", () => {
    const s = run(fullStream);
    expect(s.phase).toBe("introducing");
    expect(s.stage).toBeNull();
    expect(s.stored).toEqual(stored);
    expect(s.lines.at(-1)?.text).toBe("RED TEAM CAUTION · THE SKEW HUNTER JOINS THE CREW");
    expect(isRecruiting(s)).toBe(true);
  });

  it("lets an agent that failed the Red Team join anyway, warned", () => {
    const killed = { ...stored, verdict: "killed", redteam: { verdict: "killed", tests: [] } } as StoredAgent;
    const s = run([...fullStream.slice(0, 4), ev({ event: "done", data: { agent: killed } })]);
    expect(s.lines.at(-1)?.text).toBe("RED TEAM FAILED · THE SKEW HUNTER JOINS THE CREW");
  });

  it("ends ready once the agent introduces itself, evidence included", () => {
    const s = run([...fullStream, { type: "introduced", reply }]);
    expect(s.phase).toBe("ready");
    expect(s.lines.at(-1)).toEqual(reply);
    expect(isRecruiting(s)).toBe(false);
  });

  it("keeps the full agent once it is loaded", () => {
    const agent = { ...stored, curve: [], holdings: [] } as unknown as Agent;
    expect(run([...fullStream, { type: "loaded", agent }]).agent).toBe(agent);
  });

  it("shows a stream error as a system line and allows a retry", () => {
    const s = run([start, ev({ event: "compiling", data: {} }), ev({ event: "error", data: { message: "bad recipe" } })]);
    expect(s.phase).toBe("failed");
    expect(s.stage).toBeNull();
    expect(s.lines.at(-1)?.text).toBe("NOT RECRUITED · bad recipe");
    expect(isRecruiting(s)).toBe(false);

    const retry = run([start], s);
    expect(retry.phase).toBe("creating");
    expect(retry.lines).toHaveLength(s.lines.length + 1);
  });

  it("shows a thrown failure the same way", () => {
    const s = run([start, { type: "failed", message: "Failed to fetch", ts: TS }]);
    expect(s.phase).toBe("failed");
    expect(s.lines.at(-1)?.text).toBe("NOT RECRUITED · Failed to fetch");
  });

  it("keeps the chat's recipe on a retry", () => {
    const failed = run([...fullStream.slice(0, 3), ev({ event: "error", data: { message: "x" } })]);
    const retry = run([start], failed);
    expect(retry.phase).toBe("creating");
    expect(retry.recipe).toEqual(recipe);
  });

  it("keeps the agent when only its introduction fails", () => {
    const s = run([...fullStream, { type: "introFailed", message: "Gemini down", ts: TS }]);
    expect(s.phase).toBe("ready");
    expect(s.stored).toEqual(stored);
    expect(s.lines.at(-1)?.text).toBe("NO INTRODUCTION · Gemini down");
  });

  it("notes a failed load of the full agent without undoing the creation", () => {
    const s = run([...fullStream, { type: "loadFailed", message: "502", ts: TS }]);
    expect(s.phase).toBe("introducing");
    expect(s.lines.at(-1)?.text).toBe("PERFORMANCE UNAVAILABLE · 502");
  });

  it("ignores a second start while a creation runs", () => {
    const s = run(fullStream.slice(0, 2));
    expect(run([start], s)).toBe(s);
  });

  it("ignores stream events when no creation runs", () => {
    expect(run([ev({ event: "compiling", data: {} })])).toBe(initialRecruit);
  });
});
