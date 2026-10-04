// Dev-only stand-in for the API (NEXT_PUBLIC_API_MOCK=1). It serves the JSON fixtures next to
// this file through the same Transport as real HTTP, so every response still goes through the
// Zod schemas in api.ts. Numbers here are placeholders; never import this outside mock mode.

import { ApiError, type Agent, type LogEntry, type Transport } from "@/lib/api";
import type { SseEvent } from "@/lib/sse";

import accountant from "./agents/accountant.json";
import fence from "./agents/fence.json";
import insideman from "./agents/insideman.json";
import lookout from "./agents/lookout.json";
import wheelman from "./agents/wheelman.json";
import capital from "./capital.json";
import logJson from "./log.json";
import vault from "./vault.json";

type Json = Record<string, unknown>;
type ChatRow = { ts: string; role: "user" | "agent"; text: string; evidence?: string[]; source?: "fallback" };

// JSON imports type literals loosely (shape: string); the fixtures are checked against the
// API's models and the Zod schemas, so they can be typed as the contract.
const SEEDS = [accountant, fence, insideman, lookout, wheelman] as unknown as Agent[];
const TEMPLATE = fence as unknown as Agent;
const LOG = logJson as unknown as LogEntry[];
const SEED_IDS = new Set(SEEDS.map((a) => a.id));

// The API's agents beyond the five seeds take these looks in turn (api/app/services/agents.py).
const NEW_LOOKS: [Agent["shape"], Agent["color"]][] = [
  ["box", "sky"],
  ["half", "orange"],
  ["plus", "lime"],
];

const SUMMARY_KEYS = [
  "id", "name", "persona", "strategy_line", "pitch", "shape", "color", "status", "verdict",
  "capital_share", "capital_trend", "stop_month", "kpis", "spark",
] as const;

// What GET /agents/{id} joins in and the stored document (the `done` event's payload) lacks.
const JOINED = new Set(["spark", "curve", "benchmark", "holdings_month", "holdings"]);

function summary(agent: Agent): Json {
  return Object.fromEntries(SUMMARY_KEYS.map((k) => [k, agent[k]]));
}

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function pct(x: number): string {
  return `${x < 0 ? "−" : "+"}${Math.abs(x * 100).toFixed(1)}%`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export type MockOptions = {
  /** Milliseconds to wait before each creation stage; the design paces them 1–2 s apart. */
  stageDelay?: () => number;
};

export function mockTransport({ stageDelay = () => 1000 + Math.random() * 1000 }: MockOptions = {}): Transport {
  const agents = new Map<string, Agent>(SEEDS.map((a) => [a.id, structuredClone(a)]));
  const chats = new Map<string, ChatRow[]>();

  function findAgent(id: string): Agent {
    const agent = agents.get(id);
    if (!agent) throw new ApiError(404, `404 no agent ${id}`);
    return agent;
  }

  function reply(agent: Agent, message: string | undefined): ChatRow {
    const k = agent.kpis;
    const evidence = [
      `Sharpe ${k.sharpe.toFixed(2)} since ${agent.curve[0]?.date.slice(0, 7)}`,
      `Max drawdown ${pct(k.max_drawdown)} in ${k.max_drawdown_month}`,
      `Red Team verdict ${agent.redteam.verdict.toUpperCase()}`,
    ];
    const text = message
      ? `Mock mode: I can only quote my file. Total return ${pct(k.total_return)}, Sharpe ${k.sharpe.toFixed(2)}.`
      : `${agent.name}. ${agent.pitch}.`;
    return { ts: stamp(), role: "agent", text, evidence, source: "fallback" };
  }

  function recruit(prompt: string): Agent {
    const fresh = [...agents.keys()].filter((id) => !SEED_IDS.has(id)).length;
    const [shape, color] = NEW_LOOKS[fresh % NEW_LOOKS.length];
    return {
      ...structuredClone(TEMPLATE),
      id: `recruit-${fresh + 1}`,
      name: fresh ? `The Recruit ${fresh + 1}` : "The Recruit",
      persona: "Eager, untested, keen to prove the backtest was no fluke.",
      strategy_line: prompt.length > 80 ? `${prompt.slice(0, 79)}…` : prompt,
      pitch: prompt,
      shape,
      color,
      status: "trading",
      verdict: "probation",
      capital_share: 0,
      capital_trend: "flat",
      redteam: { ...structuredClone(TEMPLATE.redteam), verdict: "probation" },
      prompt,
      created_at: stamp(),
    };
  }

  // The recruiter chat cannot interpret words without Gemini; it keeps the strategy it was
  // sent and marks it ready, so the creation flow can still be walked through.
  function strategyChat(body: Json): Json {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const line = message.length > 80 ? `${message.slice(0, 79)}…` : message;
    return {
      reply: "Mock mode: I can't read strategies without Gemini, so I kept the current recipe. Ready when you are.",
      ready: true,
      compile: false,
      changed: false,
      strategy: body.strategy ?? TEMPLATE.recipe,
      name: "The Recruit",
      persona: "Eager, untested, keen to prove the backtest was no fluke.",
      strategy_line: line || "User-defined investment strategy",
      pitch: message || "I trade the recipe you gave me.",
    };
  }

  async function* create(body: Json, signal?: AbortSignal): AsyncGenerator<SseEvent> {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    await sleep(stageDelay(), signal);
    yield { event: "compiling", data: {} };
    if (!prompt) {
      yield { event: "error", data: { message: "describe a strategy first" } };
      return;
    }
    const agent = recruit(prompt);
    await sleep(stageDelay(), signal);
    yield { event: "backtesting", data: { name: agent.name, recipe: agent.recipe } };
    await sleep(stageDelay(), signal);
    yield { event: "redteam", data: { kpis: agent.kpis } };
    await sleep(stageDelay(), signal);
    agents.set(agent.id, agent);
    const stored = Object.fromEntries(Object.entries(agent).filter(([k]) => !JOINED.has(k)));
    yield { event: "done", data: { agent: structuredClone(stored) } };
  }

  // Mock mode cannot backtest: a recompile keeps the agent's numbers and stores the new recipe,
  // so the flow (stages, reload, the card showing the new recipe) can still be walked through.
  async function* recompile(id: string, body: Json, signal?: AbortSignal): AsyncGenerator<SseEvent> {
    const agent = findAgent(id);
    const recipe = body.recipe as Agent["recipe"];
    await sleep(stageDelay(), signal);
    yield { event: "backtesting", data: { name: agent.name, recipe } };
    await sleep(stageDelay(), signal);
    yield { event: "redteam", data: { kpis: agent.kpis } };
    const next = { ...agent, recipe };
    agents.set(id, next);
    const stored = Object.fromEntries(Object.entries(next).filter(([k]) => !JOINED.has(k)));
    yield { event: "done", data: { agent: structuredClone(stored) } };
  }

  function route(method: "GET" | "POST", path: string, body: Json = {}): unknown {
    const url = new URL(path, "http://mock");
    const q = url.searchParams;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (method === "GET" && url.pathname === "/vault") {
      return { ...vault, agents: [...agents.values()].map(summary) };
    }
    if (method === "GET" && url.pathname === "/agents") return [...agents.values()].map(summary);
    if (method === "GET" && url.pathname === "/log") {
      const type = q.get("type");
      const limit = Number(q.get("limit") ?? 100);
      const since = q.get("since");
      if (since) {
        const rows = LOG.filter((e) => (!type || e.type === type) && e.ts >= since);
        return [...rows].sort((a, b) => a.ts.localeCompare(b.ts)).slice(0, limit).reverse();
      }
      return LOG.filter((e) => !type || e.type === type).slice(0, limit);
    }
    if (method === "GET" && url.pathname === "/capital") {
      const from = q.get("from");
      return { months: capital.months.filter((m) => !from || m.month >= from) };
    }
    if (method === "POST" && url.pathname === "/agents/strategy-chat") return strategyChat(body);
    const fireHire = url.pathname.match(/^\/agents\/([^/]+)\/(fire|hire)$/);
    if (method === "POST" && fireHire) {
      const agent = findAgent(decodeURIComponent(fireHire[1]));
      const fired = fireHire[2] === "fire";
      agents.set(agent.id, { ...agent, status: fired ? "fired" : "trading", capital_share: fired ? 0 : agent.capital_share });
      return { id: agent.id, allocation: fired ? 0 : 1 };
    }
    if (method === "POST" && url.pathname === "/capital") {
      // Mock mode keeps the fixture history; the judge's split shows as the latest month.
      const allocations = (body.allocations ?? {}) as Record<string, number>;
      const total = Object.values(allocations).reduce((t, w) => t + w, 0) || 1;
      for (const [id, w] of Object.entries(allocations)) {
        const agent = agents.get(id);
        if (agent) agents.set(id, { ...agent, capital_share: w / total });
      }
      return capital;
    }
    if (parts[0] === "agents" && parts.length >= 2) {
      const agent = findAgent(parts[1]);
      if (method === "GET" && parts.length === 2) return agent;
      if (method === "GET" && parts[2] === "log") {
        const month = q.get("month");
        const type = q.get("type");
        return LOG.filter(
          (e) => e.agent_id === agent.id && (!month || e.ts.startsWith(month)) && (!type || e.type === type),
        );
      }
      if (method === "POST" && parts[2] === "whatif" && parts[3] === "compile") {
        // No AI in mock mode: the draft comes back as sent, like a research question would.
        return {
          reply: "Mock mode: I can't read instructions without the AI, so I kept your draft as it was.",
          recipe: body.recipe,
          changed: false,
        };
      }
      if (method === "POST" && parts[2] === "whatif") {
        // Mock mode cannot backtest; it echoes the agent's own record for the edited recipe.
        return { recipe: body.recipe, kpis: agent.kpis, curve: agent.curve, yearly_returns: {}, redteam: agent.redteam };
      }
      if (parts[2] === "chat") {
        const history = chats.get(agent.id) ?? [];
        if (method === "GET") return history;
        const message = typeof body.message === "string" ? body.message : undefined;
        const answer = reply(agent, message);
        if (message) history.push({ ts: answer.ts, role: "user", text: message });
        history.push(answer);
        chats.set(agent.id, history);
        return answer;
      }
    }
    throw new ApiError(404, `404 Not Found: ${method} ${url.pathname}`);
  }

  return {
    async get(path) {
      return structuredClone(route("GET", path));
    },
    async post(path, body) {
      return structuredClone(route("POST", path, (body ?? {}) as Json));
    },
    async delete(path) {
      const id = decodeURIComponent(path.split("/").pop() ?? "");
      findAgent(id);
      agents.delete(id);
      return { fired: id };
    },
    async postAudio() {
      throw new ApiError(503, "speech playback is unavailable in mock mode");
    },
    stream(path, body, signal) {
      const re = path.match(/^\/agents\/([^/]+)\/recompile$/);
      if (re) return recompile(decodeURIComponent(re[1]), (body ?? {}) as Json, signal);
      if (path !== "/agents" && path !== "/agents/from-strategy") throw new ApiError(404, `404 Not Found: POST ${path}`);
      return create((body ?? {}) as Json, signal);
    },
  };
}
