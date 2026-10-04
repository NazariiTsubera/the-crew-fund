"use client";

import { useDictation } from "@/components/use-dictation";

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

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
      title={listening ? "Stop dictation" : "Dictate"}
      className={`grid flex-none cursor-pointer place-items-center rounded-[2px] border border-line-strong bg-transparent px-3 font-mono text-xs leading-none font-semibold tracking-[0.08em] text-soft hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-40 ${className}`}
    >
      <MicIcon className={listening ? "animate-pulse text-down motion-reduce:animate-none" : ""} />
    </button>
  );
}
