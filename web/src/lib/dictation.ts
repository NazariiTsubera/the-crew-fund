/** Adds what the user said to what they already typed; dictation never replaces their draft. */
export function appendDictation(base: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return base;
  const draft = base.replace(/[ \t]+$/, "");
  if (!draft || draft.endsWith("\n")) return draft + words;
  return `${draft} ${words}`;
}

/** The recognizer reports results as lists of alternatives; the first one is its best guess. */
export function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  return Array.from(results, (alternatives) => alternatives[0]?.transcript ?? "")
    .join("")
    .trim();
}
