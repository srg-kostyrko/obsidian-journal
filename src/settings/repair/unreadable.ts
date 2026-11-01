import * as v from "valibot";

// A stored value this version cannot read, held so that it matches nothing. It is a wrapper in
// memory only: settings are written with unwrapUnreadable, so data.json keeps the value as it was
// stored and no version ever has to read the wrapper back.
export const unreadableSchema = v.strictObject({ type: v.literal("unreadable"), raw: v.unknown() });

export type Unreadable = v.InferOutput<typeof unreadableSchema>;

export function unreadable(raw: unknown): Unreadable {
  return { type: "unreadable", raw };
}

export function isUnreadable(value: unknown): value is Unreadable {
  return v.is(unreadableSchema, value);
}

// Set on a list built to hold a stored value that was not a list at all, so the save writes that
// value back in the list's place. A property rather than a registry: the save reads the settings
// through their reactive proxy, which forwards a property but is not the list it wraps.
const HOLDS_WHOLE_VALUE = Symbol("holds whole value");

/** A one-item list holding `raw`, a stored value that should have been a list. */
export function unreadableList(raw: unknown): Unreadable[] {
  const list = [unreadable(raw)];
  Object.defineProperty(list, HOLDS_WHOLE_VALUE, { value: true });
  return list;
}

function heldWhole(value: unknown): Unreadable | undefined {
  if (!Array.isArray(value) || (value as { [HOLDS_WHOLE_VALUE]?: true })[HOLDS_WHOLE_VALUE] !== true) return;
  const [only, ...rest] = value as unknown[];
  return rest.length === 0 && isUnreadable(only) ? only : undefined;
}

// Reads `schema`, or wraps what it cannot read. A wrapper read back is kept as it is, in case one
// ever reaches disk.
export function readOrUnreadable<T>(schema: v.GenericSchema<unknown, T>, value: unknown): T | Unreadable {
  if (isUnreadable(value)) return value;
  const parsed = v.safeParse(schema, value);
  return parsed.success ? parsed.output : unreadable(value);
}

/** Parses as `schema`, or holds the value as unreadable instead of failing. */
export function orUnreadable<T>(schema: v.GenericSchema<unknown, T>) {
  return v.pipe(
    v.unknown(),
    v.transform((value): T | Unreadable => readOrUnreadable(schema, value)),
  );
}

/** A JSON.stringify replacer that writes each unreadable value back as it was stored. */
export function unwrapUnreadable(_key: string, value: unknown): unknown {
  const whole = heldWhole(value);
  if (whole !== undefined) return whole.raw;
  return isUnreadable(value) ? value.raw : value;
}
