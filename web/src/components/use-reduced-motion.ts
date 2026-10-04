"use client";

import { useSyncExternalStore } from "react";

import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "@/lib/motion";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Whether the viewer asked the OS for less motion; false while rendering on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => prefersReducedMotion(window),
    () => false,
  );
}
