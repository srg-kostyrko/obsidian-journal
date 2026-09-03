// A fence body that isn't a mapping — a bare scalar (`mode:month` with no space parses to
// the string "mode:month"), a sequence, null — degrades to an empty record so the block
// renders with its schema defaults instead of blanking into an error panel.
export function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

// A fence value the user wrote as a bare word but YAML parsed as another scalar type — an
// unquoted `shelf: 2024` is a number, `shelf: no` is a boolean — coerces to its string form so
// the fence can still name a shelf the user genuinely called "2024" or "no". Anything else
// (null, a mapping, a sequence) degrades to unset.
export function asFenceString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return;
}

// A fence option that names several things but was written as one — `types: Meeting` — still
// means that one thing. Anything a single value can't be read as (a mapping, null) degrades
// to no filter rather than to an error panel.
export function asFenceStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => asFenceString(entry)).filter((entry) => entry !== undefined);
  const single = asFenceString(value);
  return single === undefined ? [] : [single];
}
