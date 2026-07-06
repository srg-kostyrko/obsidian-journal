import { getLocale } from "./paraglide/runtime.js";

// Joins items as a locale-aware "A, B, and C" list; the separator/conjunction can't be a
// paraglide message because it varies with item count and position.
export function formatConjunction(items: readonly string[]): string {
  return new Intl.ListFormat(getLocale(), { style: "long", type: "conjunction" }).format(items);
}
