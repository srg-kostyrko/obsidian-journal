// Leaf on purpose: visibility.ts reads property values through these, and journalConfigSchema imports it.

export function scalarText(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
}

// YAML hands `isTask: true` and `type: 1` over as a boolean and a number, while the rule value is
// typed as text — matching only strings would make those notes unreachable by any rule.
export function lowerScalars(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => scalarText(item)?.toLowerCase() ?? []);
}
