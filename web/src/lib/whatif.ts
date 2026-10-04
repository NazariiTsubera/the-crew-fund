import type { RecipeOut } from "@/lib/api";
import { FEATURES, MARKET_WIDE } from "@/lib/features";

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

export function setLookback(r: RecipeOut, months: number): RecipeOut {
  return { ...r, lookback_months: clamp(Math.round(months), 1, 60) };
}

// The recipe grammar's bounds on how many signals rank stocks (api/crew/recipe.py).
export const MAX_FEATURES = 8;
const MIN_FEATURES = 1;

export type AddableFeature = { name: string; meaning: string; marketWide: boolean };

/** Glossary features the recipe does not use yet, in glossary order. */
export function addable(r: RecipeOut): AddableFeature[] {
  const used = new Set(r.features.map((f) => f.name));
  return Object.entries(FEATURES)
    .filter(([name]) => !used.has(name))
    .map(([name, meaning]) => ({ name, meaning, marketWide: MARKET_WIDE.includes(name) }));
}

export const canAdd = (r: RecipeOut) => r.features.length < MAX_FEATURES;
export const canRemove = (r: RecipeOut) => r.features.length > MIN_FEATURES;

/** Appends `name` ranking high at the recipe's average weight, so it starts as an equal voice. */
export function addFeature(r: RecipeOut, name: string): RecipeOut {
  if (!canAdd(r) || !(name in FEATURES) || r.features.some((f) => f.name === name)) return r;
  const mean = r.features.reduce((s, f) => s + f.weight, 0) / r.features.length || 1;
  return { ...r, features: [...r.features, { name, weight: mean, direction: "high" }] };
}

export function removeFeature(r: RecipeOut, name: string): RecipeOut {
  if (!canRemove(r)) return r;
  return { ...r, features: r.features.filter((f) => f.name !== name) };
}

export function isEdited(base: RecipeOut, draft: RecipeOut): boolean {
  const a = normalized(base);
  const b = normalized(draft);
  return (
    a.top_n !== b.top_n ||
    a.lookback_months !== b.lookback_months ||
    a.sit_out_if_trailing_sharpe_below !== b.sit_out_if_trailing_sharpe_below ||
    a.features.length !== b.features.length ||
    a.filters.join("\n") !== b.filters.join("\n") ||
    a.features.some(
      (f, i) =>
        f.name !== b.features[i]?.name ||
        f.direction !== b.features[i]?.direction ||
        Math.abs(f.weight - b.features[i].weight) > 1e-6,
    )
  );
}
