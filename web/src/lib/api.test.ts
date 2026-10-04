import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AgentReplySchema,
  AgentSchema,
  ApiError,
  CapitalSchema,
  createClient,
  FundSchema,
  httpTransport,
  KpisSchema,
  LogEntrySchema,
  type CreateEvent,
} from "@/lib/api";
import { mockTransport } from "@/lib/mock/mock-transport";

const MOCK_DIR = fileURLToPath(new URL("./mock", import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(MOCK_DIR, name), "utf8"));
const agentFiles = readdirSync(join(MOCK_DIR, "agents")).filter((f) => f.endsWith(".json"));

describe("the mock fixtures", () => {
  // Zod drops unknown keys, so a round trip that changes nothing also proves no extra fields.
  it("vault.json is a Fund, field for field", () => {
    const raw = fixture("vault.json");
    expect(FundSchema.parse(raw)).toEqual(raw);
  });

  it("log.json is a list of LogEntry", () => {
    const raw = fixture("log.json") as unknown[];
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.map((e) => LogEntrySchema.parse(e))).toEqual(raw);
  });

  it("capital.json is a Capital", () => {
    const raw = fixture("capital.json");
    expect(CapitalSchema.parse(raw)).toEqual(raw);
  });

  it.each(agentFiles)("agents/%s is an Agent named after its file", (file) => {
    const raw = fixture(join("agents", file));
    const agent = AgentSchema.parse(raw);
    expect(agent).toEqual(raw);
    expect(`${agent.id}.json`).toBe(file);
  });

  it("covers the five seed agents, the same ones the vault lists", () => {
    const vault = FundSchema.parse(fixture("vault.json"));
    expect(agentFiles.map((f) => f.replace(".json", "")).sort()).toEqual(
      ["accountant", "fence", "insideman", "lookout", "wheelman"],
    );
    expect(vault.agents.map((a) => a.id).sort()).toEqual(agentFiles.map((f) => f.replace(".json", "")).sort());
  });
});

describe("the schemas", () => {
  it("fill in the defaults Pydantic would have serialized", () => {
    const k = KpisSchema.parse({
      total_return: 0.1,
      ann_return: 0.02,
      ann_vol: 0.1,
      sharpe: 0.2,
      max_drawdown: -0.1,
      max_drawdown_month: null,
    });
    expect(k.turnover).toBeNull();
    expect(k.trailing_12m_sharpe).toBeNull();
  });

  it("keep why a chat answer fell back", () => {
    const reply = AgentReplySchema.parse({
      ts: "2026-10-04 10:00",
      role: "agent",
      text: "From my file.",
      evidence: [],
      source: "fallback",
      fallback_reason: "rate limited (429)",
    });
    expect(reply.fallback_reason).toBe("rate limited (429)");
  });

  it("reject a status outside the contract", () => {
    const raw = fixture("agents/fence.json") as Record<string, unknown>;
    expect(() => AgentSchema.parse({ ...raw, status: "asleep" })).toThrow();
  });
});

describe("the client over the mock transport", () => {
  const api = createClient(mockTransport({ stageDelay: () => 0 }));

  it("recompiles an agent and keeps the new recipe", async () => {
    const agent = await api.agent("fence");
    const recipe = { ...agent.recipe, top_n: 9 };
    const events: string[] = [];
    for await (const e of api.recompile("fence", recipe)) events.push(e.event);
    expect(events).toEqual(["backtesting", "redteam", "done"]);
    expect((await api.agent("fence")).recipe.top_n).toBe(9);
  });

  it("reads the vault and the crew", async () => {
    const vault = await api.vault();
    expect(vault.agents).toHaveLength(5);
    expect((await api.agents()).map((a) => a.id)).toEqual(vault.agents.map((a) => a.id));
  });

  it("reads one agent and 404s an unknown one", async () => {
    expect((await api.agent("wheelman")).status).toBe("killed");
    await expect(api.agent("nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("filters the log the way the API does", async () => {
    const trades = await api.log({ type: "trade", limit: 5 });
    expect(trades).toHaveLength(5);
    expect(trades.every((e) => e.type === "trade")).toBe(true);
    const month = await api.agentLog("accountant", { month: "2026-08" });
    expect(month.length).toBeGreaterThan(0);
    expect(month.every((e) => e.agent_id === "accountant" && e.ts.startsWith("2026-08"))).toBe(true);
  });

  it("filters capital from a month", async () => {
    const { months } = await api.capital({ from: "2026-01" });
    expect(months.length).toBeGreaterThan(0);
    expect(months.every((m) => m.month >= "2026-01")).toBe(true);
  });

  it("chats: an introduction, then answers kept in the history", async () => {
    const intro = await api.chat("fence");
    expect(intro.role).toBe("agent");
    expect(intro.evidence.length).toBeGreaterThan(0);
    await api.chat("fence", "Why JPM?");
    expect((await api.chatHistory("fence")).map((m) => m.role)).toEqual(["agent", "user", "agent"]);
  });

  it("creates an agent in the API's stage order and then serves it", async () => {
    const events: CreateEvent[] = [];
    for await (const e of api.createAgent("Buy what the insiders buy")) events.push(e);
    expect(events.map((e) => e.event)).toEqual(["compiling", "backtesting", "redteam", "done"]);
    const done = events[3];
    if (done.event !== "done") throw new Error("unreachable");
    expect(done.data.agent.prompt).toBe("Buy what the insiders buy");
    expect(["box", "half", "plus"]).toContain(done.data.agent.shape);
    expect((await api.agent(done.data.agent.id)).name).toBe(done.data.agent.name);
  });

  it("ends with an error event for an empty prompt", async () => {
    const events: CreateEvent[] = [];
    for await (const e of api.createAgent("   ")) events.push(e);
    expect(events.map((e) => e.event)).toEqual(["compiling", "error"]);
  });

  it("recompiles a what-if draft by keeping it, since mock mode has no AI", async () => {
    const recipe = (await api.agent("fence")).recipe;
    const out = await api.whatifCompile("fence", "drop the volatility signal", recipe);
    expect(out.changed).toBe(false);
    expect(out.recipe).toEqual(recipe);
    expect(out.reply).toMatch(/mock/i);
    await expect(api.whatifCompile("nobody", "x", recipe)).rejects.toMatchObject({ status: 404 });
  });
});

describe("httpTransport", () => {
  function fakeFetch(respond: (url: string, init?: RequestInit) => Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    }) as typeof fetch;
    return { impl, calls };
  }

  it("builds URLs from the base and drops empty query values", async () => {
    const { impl, calls } = fakeFetch(() => Response.json([]));
    const api = createClient(httpTransport("http://api.test/", impl));
    await api.agentLog("the fence", { month: "2026-08", type: undefined });
    await api.log({ limit: 20 });
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/agents/the%20fence/log?month=2026-08",
      "http://api.test/log?limit=20",
    ]);
  });

  it("surfaces FastAPI's detail as an ApiError", async () => {
    const { impl } = fakeFetch(() => Response.json({ detail: "no agent x" }, { status: 404 }));
    const err = await createClient(httpTransport("http://api.test", impl)).agent("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: "404 no agent x" });
  });

  it("posts a chat without a message to make the agent introduce itself", async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json({ ts: "2026-10-03 12:00", role: "agent", text: "hi", evidence: [], source: "gemini" }),
    );
    await createClient(httpTransport("http://api.test", impl)).chat("fence");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe("{}");
  });

  it("sends a what-if recipe with a chat question, and posts a what-if run", async () => {
    const recipe = {
      features: [{ name: "kyle_lambda", weight: 1, direction: "low" as const }],
      filters: [],
      lookback_months: 12,
      top_n: 10,
      rebalance: "monthly" as const,
      sit_out_if_trailing_sharpe_below: null,
    };
    const kpis = { total_return: 0.1, ann_return: 0.01, ann_vol: 0.1, sharpe: 0.1, max_drawdown: -0.1, max_drawdown_month: "2020-03" };
    const { impl, calls } = fakeFetch((url) =>
      url.endsWith("/whatif")
        ? Response.json({ recipe, kpis, curve: [], yearly_returns: { "2020": 0.1 }, redteam: { verdict: "pass", tests: [] } })
        : Response.json({ ts: "t", role: "agent", text: "x", evidence: [], source: "gemini" }),
    );
    const client = createClient(httpTransport("http://api.test", impl));

    await client.chat("fence", "Better?", undefined, recipe);
    const run = await client.whatif("fence", recipe);

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ message: "Better?", whatif: recipe });
    expect(calls[1].url).toBe("http://api.test/agents/fence/whatif");
    expect(run.redteam.verdict).toBe("pass");

    const reply = { reply: "Leaned in.", recipe, changed: true };
    const compile = fakeFetch(() => Response.json(reply));
    const out = await createClient(httpTransport("http://api.test", compile.impl)).whatifCompile(
      "fence",
      "lean into value",
      recipe,
    );
    expect(compile.calls[0].url).toBe("http://api.test/agents/fence/whatif/compile");
    expect(JSON.parse(String(compile.calls[0].init?.body))).toEqual({ message: "lean into value", recipe });
    expect(out).toEqual(reply);
  });

  it("sends the draft with a chat question and reads a proposal back", async () => {
    const draft = {
      features: [{ name: "kyle_lambda", weight: 1, direction: "low" as const }],
      filters: [],
      lookback_months: 12,
      top_n: 20,
      rebalance: "monthly" as const,
      sit_out_if_trailing_sharpe_below: null,
    };
    const { impl, calls } = fakeFetch(() =>
      Response.json({ ts: "t", role: "agent", text: "x", evidence: [], source: "gemini", proposal: draft, recompile: true }),
    );

    const reply = await createClient(httpTransport("http://api.test", impl)).chat("fence", "Hold 20", undefined, undefined, draft);

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ message: "Hold 20", draft });
    expect(reply.proposal?.top_n).toBe(20);
    expect(reply.recompile).toBe(true);
  });

  it("streams a recompile as creation events", async () => {
    const body = 'event: backtesting\ndata: {"name": "The Fence", "recipe": null}\n\nevent: error\ndata: {"message": "x"}\n\n';
    const { impl, calls } = fakeFetch(() => new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    const recipe = {
      features: [{ name: "kyle_lambda", weight: 1, direction: "low" as const }],
      filters: [],
      lookback_months: 12,
      top_n: 20,
      rebalance: "monthly" as const,
      sit_out_if_trailing_sharpe_below: null,
    };
    const events: CreateEvent[] = [];
    try {
      for await (const e of createClient(httpTransport("http://api.test", impl)).recompile("fence", recipe)) events.push(e);
    } catch {
      // a backtesting event without a recipe fails the schema; only the request shape matters here
    }
    expect(calls[0].url).toBe("http://api.test/agents/fence/recompile");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ recipe });
  });

  it("sets the split, deletes, fires and rehires agents", async () => {
    const { impl, calls } = fakeFetch((url, init) =>
      init?.method === "DELETE" ? Response.json({ fired: "fence" }) : Response.json({ months: [] }),
    );
    const client = createClient(httpTransport("http://api.test", impl));

    await client.setCapital({ fence: 2, lookout: 0 });
    await client.deleteAgent("fence");
    await client.fire("lookout");
    await client.hire("lookout");

    expect(calls[0].url).toBe("http://api.test/capital");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ allocations: { fence: 2, lookout: 0 } });
    expect(calls[1]).toMatchObject({ url: "http://api.test/agents/fence", init: { method: "DELETE" } });
    expect(calls[2]).toMatchObject({ url: "http://api.test/agents/lookout/fire", init: { method: "POST" } });
    expect(calls[3]).toMatchObject({ url: "http://api.test/agents/lookout/hire", init: { method: "POST" } });
  });

  it("streams POST /agents as parsed creation events", async () => {
    const body = 'event: compiling\ndata: {}\n\nevent: error\ndata: {"message": "no Gemini key"}\n\n';
    const { impl, calls } = fakeFetch(() => new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    const events: CreateEvent[] = [];
    for await (const e of createClient(httpTransport("http://api.test", impl)).createAgent("x")) events.push(e);
    expect(events).toEqual([
      { event: "compiling", data: {} },
      { event: "error", data: { message: "no Gemini key" } },
    ]);
    expect(calls[0].init?.body).toBe('{"prompt":"x"}');
  });
});
