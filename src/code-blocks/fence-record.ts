// A fence body that isn't a mapping — a bare scalar (`mode:month` with no space parses to
// the string "mode:month"), a sequence, null — degrades to an empty record so the block
// renders with its schema defaults instead of blanking into an error panel (v2 still rendered).
export function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
