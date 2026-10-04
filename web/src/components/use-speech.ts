"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

export type SpeechStatus = "idle" | "loading" | "playing" | "error";

// Shared by every speak button on the page, so starting one clip silences the one before it.
let stopCurrent: (() => void) | null = null;

/** Reads `text` aloud through the API's voice; one clip plays at a time across the page. */
export function useSpeech(text: string) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const owned = useRef<(() => void) | null>(null);

  useEffect(() => () => owned.current?.(), []);

  async function start() {
    stopCurrent?.();
    const controller = new AbortController();
    let player: HTMLAudioElement | null = null;
    let url: string | null = null;

    const release = (next: SpeechStatus) => {
      controller.abort();
      if (player) {
        player.onended = null;
        player.onerror = null;
        player.pause();
      }
      if (url) URL.revokeObjectURL(url);
      player = null;
      url = null;
      if (stopCurrent === stop) stopCurrent = null;
      if (owned.current === stop) owned.current = null;
      setStatus(next);
    };
    const stop = () => release("idle");

    stopCurrent = stop;
    owned.current = stop;
    setStatus("loading");
    try {
      const blob = await api.recruiterSpeech(text, controller.signal);
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      player = audio;
      audio.onended = stop;
      audio.onerror = () => release("error");
      setStatus("playing");
      await audio.play();
    } catch {
      if (!controller.signal.aborted) release("error");
    }
  }

  function toggle() {
    if (status === "loading" || status === "playing") owned.current?.();
    else void start();
  }

  return { status, toggle };
}
