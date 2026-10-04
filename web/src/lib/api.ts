import { z } from "zod";

import { readSse, type SseEvent } from "@/lib/sse";

// --- The data contract: mirrors api/app/models.py ("The War Room's data contract") ---
// Pydantic fields with a default become `.default(...)`, so a response that omits them still
// parses to the same shape the API would have serialized.

export const CurvePointSchema = z.object({ date: z.string(), value: z.number() });

export const KpisSchema = z.object({
  total_return: z.number(),
  ann_return: z.number(),
  ann_vol: z.number(),
  sharpe: z.number(),
  max_drawdown: z.number(),
  max_drawdown_month: z.string().nullable(),
  turnover: z.number().nullable().default(null),
  trailing_12m_sharpe: z.number().nullable().default(null),
});

export const VerdictSchema = z.enum(["pass", "probation", "killed"]);

export const RedTeamTestSchema = z.object({ name: z.string(), passed: z.boolean(), detail: z.string() });

export const RedTeamSchema = z.object({ verdict: VerdictSchema, tests: z.array(RedTeamTestSchema) });

export const RecipeFeatureSchema = z.object({
  name: z.string(),
  weight: z.number(),
  direction: z.enum(["high", "low"]),
});

export const RecipeOutSchema = z.object({
  features: z.array(RecipeFeatureSchema),
  filters: z.array(z.string()),
  lookback_months: z.number().int(),
  top_n: z.number().int(),
  rebalance: z.string(),
  sit_out_if_trailing_sharpe_below: z.number().nullable(),
});

export const StrategyChatResponseSchema = z.object({
  reply: z.string(),
                                                   strategy: RecipeOutSchema,
                                                   name: z.string(),
                                                   persona: z.string(),
                                                   strategy_line: z.string(),
                                                   pitch: z.string(),
                                                   ready: z.boolean(),
});
export type StrategyChatResponse = z.infer<typeof StrategyChatResponseSchema>;

export const HoldingSchema = z.object({
  ticker: z.string(),
  weight: z.number(),
  reason: z.string().nullable().default(null),
  agent_id: z.string().nullable().default(null),
});

// Token names, not CSS: the web maps each to the design's `--c-<name>` variable.
export const AgentColorSchema = z.enum(["amber", "violet", "teal", "rose", "green", "slate", "sky", "orange", "lime"]);
export const AgentShapeSchema = z.enum(["circle", "square", "diamond", "ring", "triangle", "box", "half", "plus"]);

export const AgentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  persona: z.string(),
  strategy_line: z.string(),
  pitch: z.string(),
  // The API types these as plain strings; an unknown value falls back to a neutral look
  // instead of failing the whole response.
  shape: AgentShapeSchema.catch("square"),
  color: AgentColorSchema.catch("slate"),
  status: z.enum(["trading", "sitting_out", "killed"]),
  verdict: VerdictSchema,
  capital_share: z.number(),
  capital_trend: z.enum(["up", "down", "flat"]),
  stop_month: z.string().nullable().default(null),
  kpis: KpisSchema,
  spark: z.array(z.number()),
});

export const AgentSchema = AgentSummarySchema.extend({
  recipe: RecipeOutSchema,
  redteam: RedTeamSchema,
  yearly_returns: z.record(z.string(), z.number()),
  curve: z.array(CurvePointSchema),
  benchmark: z.array(CurvePointSchema),
  holdings_month: z.string().nullable(),
  holdings: z.array(HoldingSchema),
  prompt: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
});

// The agent document as stored, which POST /agents returns in its `done` event: an Agent
// without the series the read endpoints join in (spark, curve, benchmark, holdings).
export const StoredAgentSchema = AgentSchema.omit({
  spark: true,
  curve: true,
  benchmark: true,
  holdings_month: true,
  holdings: true,
});

export const LogTypeSchema = z.enum(["trade", "risk", "mastermind", "redteam"]);

export const LogEntrySchema = z.object({
  ts: z.string(),
  type: LogTypeSchema,
  text: z.string(),
  agent_id: z.string().nullable().default(null),
});

export const FundSchema = z.object({
  as_of: z.string(),
  holdout_cutoff: z.string(),
  kpis: KpisSchema,
  spx_kpis: KpisSchema,
  invested_fraction: z.number(),
  curve: z.array(CurvePointSchema),
  benchmark: z.array(CurvePointSchema),
  agents: z.array(AgentSummarySchema),
  holdings: z.array(HoldingSchema),
  latest_memo: z.string().nullable(),
});

export const CapitalMonthSchema = z.object({
  month: z.string(),
  shares: z.record(z.string(), z.number()),
  invested: z.number(),
});

export const CapitalSchema = z.object({ months: z.array(CapitalMonthSchema) });

export const ChatMessageSchema = z.object({
  ts: z.string(),
  role: z.enum(["user", "agent"]),
  text: z.string(),
  // Only the agent's replies carry these.
  evidence: z.array(z.string()).optional(),
  source: z.enum(["gemini", "fallback"]).optional(),
});

export const AgentReplySchema = ChatMessageSchema.extend({
  role: z.literal("agent"),
  evidence: z.array(z.string()),
  source: z.enum(["gemini", "fallback"]),
});

export const CreateEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("compiling"), data: z.object({}) }),
  z.object({ event: z.literal("backtesting"), data: z.object({ name: z.string(), recipe: RecipeOutSchema }) }),
  z.object({ event: z.literal("redteam"), data: z.object({ kpis: KpisSchema }) }),
  z.object({ event: z.literal("done"), data: z.object({ agent: StoredAgentSchema }) }),
  z.object({ event: z.literal("error"), data: z.object({ message: z.string() }) }),
]);

export type CurvePoint = z.infer<typeof CurvePointSchema>;
export type Kpis = z.infer<typeof KpisSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type RedTeamTest = z.infer<typeof RedTeamTestSchema>;
export type RedTeam = z.infer<typeof RedTeamSchema>;
export type RecipeFeature = z.infer<typeof RecipeFeatureSchema>;
export type RecipeOut = z.infer<typeof RecipeOutSchema>;
export type Holding = z.infer<typeof HoldingSchema>;
export type AgentColor = z.infer<typeof AgentColorSchema>;
export type AgentShape = z.infer<typeof AgentShapeSchema>;
export type AgentSummary = z.infer<typeof AgentSummarySchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type StoredAgent = z.infer<typeof StoredAgentSchema>;
export type LogType = z.infer<typeof LogTypeSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type Fund = z.infer<typeof FundSchema>;
export type CapitalMonth = z.infer<typeof CapitalMonthSchema>;
export type Capital = z.infer<typeof CapitalSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type AgentReply = z.infer<typeof AgentReplySchema>;
export type CreateEvent = z.infer<typeof CreateEventSchema>;

// --- Transport: real HTTP, or the fixtures in src/lib/mock ---

export interface Transport {
  get(path: string, signal?: AbortSignal): Promise<unknown>;
  post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown>;
  postAudio(path: string, body: unknown, signal?: AbortSignal): Promise<Blob>;
  stream(path: string, body: unknown, signal?: AbortSignal): AsyncIterable<SseEvent>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function failure(res: Response): Promise<ApiError> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    // Not JSON (a proxy error page, say); the status text is all there is.
  }
  return new ApiError(res.status, `${res.status} ${detail}`.trim());
}

export function httpTransport(base: string, fetchImpl: typeof fetch = fetch): Transport {
  const url = (path: string) => `${base.replace(/\/+$/, "")}${path}`;
  const post = (path: string, body: unknown, signal?: AbortSignal) =>
    fetchImpl(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  return {
    async get(path, signal) {
      const res = await fetchImpl(url(path), { signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw await failure(res);
      return res.json();
    },
    async post(path, body, signal) {
      const res = await post(path, body, signal);
      if (!res.ok) throw await failure(res);
      return res.json();
    },
    async postAudio(path, body, signal) {
      const res = await post(path, body, signal);
      if (!res.ok) throw await failure(res);
      return res.blob();
    },
    async *stream(path, body, signal) {
      const res = await post(path, body, signal);
      if (!res.ok) throw await failure(res);
      if (!res.body) throw new ApiError(res.status, "empty event stream");
      yield* readSse(res.body);
    },
  };
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const enc = encodeURIComponent;

export function createClient(transport: Transport) {
  return {
    vault: async (signal?: AbortSignal) => FundSchema.parse(await transport.get("/vault", signal)),
    agents: async (signal?: AbortSignal) =>
      z.array(AgentSummarySchema).parse(await transport.get("/agents", signal)),
    agent: async (id: string, signal?: AbortSignal) =>
      AgentSchema.parse(await transport.get(`/agents/${enc(id)}`, signal)),
    agentLog: async (id: string, opts: { month?: string; type?: LogType } = {}, signal?: AbortSignal) =>
      z
        .array(LogEntrySchema)
        .parse(await transport.get(`/agents/${enc(id)}/log${query(opts)}`, signal)),
    log: async (opts: { limit?: number; type?: LogType } = {}, signal?: AbortSignal) =>
      z.array(LogEntrySchema).parse(await transport.get(`/log${query(opts)}`, signal)),
    capital: async (opts: { from?: string } = {}, signal?: AbortSignal) =>
      CapitalSchema.parse(await transport.get(`/capital${query(opts)}`, signal)),
    chat: async (id: string, message?: string, signal?: AbortSignal) =>
      AgentReplySchema.parse(
        await transport.post(`/agents/${enc(id)}/chat`, message === undefined ? {} : { message }, signal),
      ),
    chatHistory: async (id: string, signal?: AbortSignal) =>
      z.array(ChatMessageSchema).parse(await transport.get(`/agents/${enc(id)}/chat`, signal)),
    /** POST /agents: yields each creation stage as the server reports it. */
    async *createAgent(prompt: string, signal?: AbortSignal): AsyncGenerator<CreateEvent> {
      for await (const raw of transport.stream("/agents", { prompt }, signal)) {
        yield CreateEventSchema.parse(raw);
      }
    },
    strategyChat: async (
      message: string,
      history: { role: "user" | "assistant"; text: string }[],
      strategy: RecipeOut,
      signal?: AbortSignal,
    ): Promise<StrategyChatResponse> =>
    StrategyChatResponseSchema.parse(
      await transport.post(
        "/agents/strategy-chat",
        {
          message,
          history,
          strategy,
        },
        signal,
      ),
    ),
    recruiterSpeech: (text: string, signal?: AbortSignal): Promise<Blob> =>
      transport.postAudio("/agents/strategy-chat/speech", { text }, signal),
    async *createAgentFromStrategy(
      body: {
        prompt: string;
        strategy: RecipeOut;
        name: string;
        persona: string;
        strategy_line: string;
        pitch: string;
      },
      signal?: AbortSignal,
    ): AsyncGenerator<CreateEvent> {
      for await (
        const raw of transport.stream(
          "/agents/from-strategy",
          body,
          signal,
        )
      ) {
        yield CreateEventSchema.parse(raw);
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

export const API_MOCK = process.env.NEXT_PUBLIC_API_MOCK === "1";
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Loaded on first use so a real build never fetches, and never shows, the fixtures.
let transport: Promise<Transport> | null = null;
function resolveTransport(): Promise<Transport> {
  transport ??= API_MOCK
    ? import("@/lib/mock/mock-transport").then((m) => m.mockTransport())
    : Promise.resolve(httpTransport(API_URL));
  return transport;
}

const lazyTransport: Transport = {
  get: async (path, signal) => (await resolveTransport()).get(path, signal),
  post: async (path, body, signal) => (await resolveTransport()).post(path, body, signal),
  postAudio: async (path, body, signal) =>
    (await resolveTransport()).postAudio(path, body, signal),
  async *stream(path, body, signal) {
    yield* (await resolveTransport()).stream(path, body, signal);
  },
};

/** The client the app uses: the real API, or the fixtures when NEXT_PUBLIC_API_MOCK=1. */
export const api = createClient(lazyTransport);
