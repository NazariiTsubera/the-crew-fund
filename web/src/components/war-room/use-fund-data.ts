"use client";

import { useCallback, useEffect, useState } from "react";

import { api, type Capital, type Fund } from "@/lib/api";
import { describeLoadError, type LoadError } from "@/lib/load-error";

export type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: LoadError };

type Settled<T> = { attempt: number; load: Load<T> };

// Each result remembers which attempt produced it, so a retry reads as loading until its own
// answer arrives instead of showing the previous failure.
function useLoad<T>(fetcher: ((signal: AbortSignal) => Promise<T>) | null, attempt: number): Load<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    const controller = new AbortController();
    fetcher(controller.signal).then(
      (data) => setSettled({ attempt, load: { status: "ready", data } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ attempt, load: { status: "error", error: describeLoadError(error) } });
      },
    );
    return () => controller.abort();
  }, [fetcher, attempt]);
  return settled && settled.attempt === attempt ? settled.load : { status: "loading" };
}

const fetchVault = (signal: AbortSignal) => api.vault(signal);
const fetchCapital = (signal: AbortSignal) => api.capital({}, signal);

/**
 * GET /vault, and GET /capital when the page shows the allocation history. They load
 * independently so a missing history never blanks the vault. `retry` refetches both.
 */
export function useFundData({ withCapital }: { withCapital: boolean }): {
  vault: Load<Fund>;
  capital: Load<Capital>;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const vault = useLoad(fetchVault, attempt);
  const capital = useLoad(withCapital ? fetchCapital : null, attempt);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { vault, capital, retry };
}
