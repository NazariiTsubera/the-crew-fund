"use client";

import { useDictation } from "@/components/use-dictation";

/** Hidden where the browser cannot listen (e.g. Firefox). */
export function MicButton({
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { supported, listening, toggle } = useDictation(value, onChange);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled && !listening}
      aria-label={listening ? "Stop dictation" : "Dictate your message"}
      aria-pressed={listening}
      className={`flex-none cursor-pointer rounded-[2px] border border-line-strong bg-transparent px-3 font-mono text-xs leading-none font-semibold tracking-[0.08em] text-soft hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-40 ${className}`}
    >
      {listening ? (
        <span className="inline-flex items-center gap-1.5 text-down">
          <span aria-hidden className="inline-block size-2 animate-pulse rounded-full motion-reduce:animate-none bg-current" />
          REC
        </span>
      ) : (
        "MIC"
      )}
    </button>
  );
}
