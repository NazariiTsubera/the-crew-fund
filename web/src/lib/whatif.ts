import type { RecipeOut } from "@/lib/api";

// Edits a judge makes to an agent's recipe in the What-if panel. Pure, so the panel can undo by
// keeping the original; the API re-validates and re-normalizes whatever is sent.

const MIN_WEIGHT = 0.01; // the recipe grammar refuses a zero weight

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normalized(r: RecipeOut): RecipeOut {
  const total = r.features.reduce((s, f) => s + f.weight, 0) || 1;
  return { ...r, features: r.features.map((f) => ({ ...f, weight: f.weight / total })) };
}

export function setWeight(r: RecipeOut, name: string, weight: number): RecipeOut {
  return {
    ...r,
    features: r.features.map((f) => (f.name === name ? { ...f, weight: Math.max(MIN_WEIGHT, weight) } : f)),
  };
}

export function flipDirection(r: RecipeOut, name: string): RecipeOut {
  return {
    ...r,
    features: r.features.map((f) =>
      f.name === name ? { ...f, direction: f.direction === "high" ? "low" : "high" } : f,
    ),
  };
}

export function setTopN(r: RecipeOut, n: number): RecipeOut {
  return { ...r, top_n: clamp(Math.round(n), 1, 50) };
}

export function setSitOut(r: RecipeOut, floor: number | null): RecipeOut {
  return { ...r, sit_out_if_trailing_sharpe_below: floor === null ? null : clamp(floor, -3, 3) };
}

export function isEdited(base: RecipeOut, draft: RecipeOut): boolean {
  const a = normalized(base);
  const b = normalized(draft);
  return (
    a.top_n !== b.top_n ||
    a.sit_out_if_trailing_sharpe_below !== b.sit_out_if_trailing_sharpe_below ||
    a.features.some(
      (f, i) =>
        f.name !== b.features[i]?.name ||
        f.direction !== b.features[i]?.direction ||
        Math.abs(f.weight - b.features[i].weight) > 1e-6,
    )
  );
}
