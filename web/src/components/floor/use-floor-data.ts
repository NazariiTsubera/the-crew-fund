"use client";

import { useCallback, useEffect, useState } from "react";

import { api, type AgentSummary, type LogEntry } from "@/lib/api";
import { TAPE_LIMIT } from "@/lib/floor-tape";
import { describeLoadError, type LoadError } from "@/lib/load-error";

export type FloorData =
  | { status: "loading" }
  | { status: "ready"; log: LogEntry[]; crew: AgentSummary[] }
  | { status: "error"; error: LoadError };

type Settled = { attempt: number; data: FloorData };

/**
 * The newest TAPE_LIMIT entries of GET /log, plus GET /agents for names and glyphs. The crew is
 * a nicety: if it fails the tape still plays, showing agent ids instead of names.
 */
export function useFloorData(): { data: FloorData; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const crew = api.agents(controller.signal).catch((): AgentSummary[] => []);
    api.log({ limit: TAPE_LIMIT }, controller.signal).then(
      async (log) => {
        const agents = await crew;
        if (!controller.signal.aborted) setSettled({ attempt, data: { status: "ready", log, crew: agents } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ attempt, data: { status: "error", error: describeLoadError(error) } });
      },
    );
    return () => controller.abort();
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data: settled && settled.attempt === attempt ? settled.data : { status: "loading" }, retry };
}
