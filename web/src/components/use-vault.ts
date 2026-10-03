"use client";

import { useEffect, useState } from "react";

import { api, type Fund } from "@/lib/api";

export type VaultState =
  | { status: "loading" }
  | { status: "ready"; vault: Fund }
  | { status: "error"; message: string };

/** GET /vault once per mount; the shell reads the crew and the fund's latest month from it. */
export function useVault(): VaultState {
  const [state, setState] = useState<VaultState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    api.vault(controller.signal).then(
      (vault) => setState({ status: "ready", vault }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, []);
  return state;
}
