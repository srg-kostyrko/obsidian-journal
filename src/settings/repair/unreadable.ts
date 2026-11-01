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
  return isUnreadable(value) ? value.raw : value;
}
