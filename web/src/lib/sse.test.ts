import { describe, expect, it } from "vitest";

import { readSse, type SseEvent } from "@/lib/sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const e of readSse(streamOf(chunks))) out.push(e);
  return out;
}

describe("readSse", () => {
  it("reads the API's event blocks in order", async () => {
    const body =
      'event: compiling\ndata: {}\n\n' +
      'event: backtesting\ndata: {"name": "The Fence"}\n\n' +
      'event: error\ndata: {"message": "no key"}\n\n';
    expect(await collect([body])).toEqual([
      { event: "compiling", data: {} },
      { event: "backtesting", data: { name: "The Fence" } },
      { event: "error", data: { message: "no key" } },
    ]);
  });

  it("reassembles a block split across network chunks", async () => {
    expect(await collect(["event: red", "team\ndata: {\"kpis\"", ": 1}\n", "\n"])).toEqual([
      { event: "redteam", data: { kpis: 1 } },
    ]);
  });

  it("accepts CRLF line endings and a final block without a blank line", async () => {
    expect(await collect(["event: done\r\ndata: {\"ok\": true}\r\n\r\nevent: x\ndata: 2"])).toEqual([
      { event: "done", data: { ok: true } },
      { event: "x", data: 2 },
    ]);
  });

  it("skips comments and blocks without data", async () => {
    expect(await collect([": keep-alive\n\nevent: ping\n\nevent: a\ndata: 1\n\n"])).toEqual([
      { event: "a", data: 1 },
    ]);
  });
});
