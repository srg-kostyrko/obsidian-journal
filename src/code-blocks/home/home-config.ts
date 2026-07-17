import * as v from "valibot";

import { asFenceString, asRecord } from "../fence-record";

const homeEntries = ["day", "week", "month", "quarter", "year", "custom"] as const;

export const homeEntrySchema = v.picklist(homeEntries);

export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;

function isHomeEntry(value: unknown): value is HomeEntry {
  return typeof value === "string" && (homeEntries as readonly string[]).includes(value);
}

const homeBlockEntries = {
  // A typo'd entry drops out instead of failing the whole block into an error
  // panel — v2 filtered invalid entries and rendered the rest. A non-array
  // `show` (e.g. the scalar `show: month`) degrades to the default rather than
  // erroring: v2 caught the resulting `.filter` throw and fell back the same way.
  show: v.optional(
    v.fallback(
      v.pipe(
        v.array(v.unknown()),
        v.transform((entries) => entries.filter(isHomeEntry)),
      ),
      ["day"] as HomeEntry[],
    ),
    () => ["day"] as const,
  ),
  // A null / wrong-type value degrades to the default, and an empty string coerces to the
  // bullet too (v2 coerced with `separator || " • "`).
  separator: v.optional(
    v.fallback(
      v.pipe(
        v.string(),
        v.transform((s) => s || " • "),
      ),
      " • ",
    ),
    " • ",
  ),
  // Non-number degrades to 1; a zero scale coerces to 1 so the block stays visible (v2 `scale || 1`).
  scale: v.optional(
    v.fallback(
      v.pipe(
        v.number(),
        v.transform((n) => n || 1),
      ),
      1,
    ),
    1,
  ),
  // An explicit null degrades to unset (current shelf); see asFenceString for the rest.
  shelf: v.optional(v.pipe(v.unknown(), v.transform(asFenceString))),
};

export const homeBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(homeBlockEntries));

// Derived from the entries so the two can never drift: the block reports any other key as
// unrecognized rather than ignoring it and rendering a plausible-looking default.
export const homeBlockKeys = Object.keys(homeBlockEntries);

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
