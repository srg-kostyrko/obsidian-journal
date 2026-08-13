// A fence body that isn't a mapping — a bare scalar (`mode:month` with no space parses to
// the string "mode:month"), a sequence, null — degrades to an empty record so the block
// renders with its schema defaults instead of blanking into an error panel.
export function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

// A fence value the user wrote as a bare word but YAML parsed as another scalar type — an
// unquoted `shelf: 2024` is a number, `shelf: no` is a boolean — coerces to its string form
// rather than erroring, so a value that never matches a shelf just filters out none instead
// of blanking the whole block. Anything else (null, a mapping, a sequence) degrades to unset.
export function asFenceString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return;
}
