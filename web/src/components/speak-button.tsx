"use client";

import { useSpeech } from "@/components/use-speech";

export function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  const { status, toggle } = useSpeech(text);
  const active = status === "loading" || status === "playing";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? "Stop reading" : "Read this answer aloud"}
      aria-pressed={active}
      className={`w-fit cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-2 py-1 font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-muted hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      {active ? "■ STOP" : "▶ PLAY"}
      {status === "error" && <span role="status"> · SPEECH UNAVAILABLE</span>}
    </button>
  );
}
