"use client";

import { useEffect, useState } from "react";

import { api, type Fund } from "@/lib/api";
import { describeLoadError, type LoadError } from "@/lib/load-error";

export type VaultState =
  | { status: "loading" }
  | { status: "ready"; vault: Fund }
  | { status: "error"; message: string; error: LoadError };

// The shell mounts once per session; a page that changes the crew (a new recruit) asks every
// mounted useVault to read /vault again rather than threading a context through the layout.
const listeners = new Set<() => void>();

/** Re-reads GET /vault for every mounted useVault, keeping the current data until it lands. */
export function refreshVault(): void {
  for (const listener of listeners) listener();
}

/** GET /vault on mount and on refreshVault(); the shell reads the crew and the fund's latest month from it. */
export function useVault(): VaultState {
  const [state, setState] = useState<VaultState>({ status: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const bump = () => setGeneration((g) => g + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.vault(controller.signal).then(
      (vault) => setState({ status: "ready", vault }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const described = describeLoadError(error);
        setState({ status: "error", message: described.title, error: described });
      },
    );
    return () => controller.abort();
  }, [generation]);
  return state;
}
