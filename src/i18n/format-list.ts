import { getLocale } from "./paraglide/runtime.js";

// Joins items as a locale-aware "A, B, and C" list; the separator/conjunction can't be a
// paraglide message because it varies with item count and position.
export function formatConjunction(items: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { style: "long", type: "conjunction" }).format(items);
}

// "or" rather than "and", for a rule whose conditions are alternatives. Same reason
// formatConjunction is not a paraglide message: the word and its placement vary with item count.
export function formatDisjunction(items: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { style: "long", type: "disjunction" }).format(items);
}
