import * as v from "valibot";

import { asRecord } from "../fence-record";

const homeEntries = ["day", "week", "month", "quarter", "year", "custom"] as const;

export const homeEntrySchema = v.picklist(homeEntries);

export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;

function isHomeEntry(value: unknown): value is HomeEntry {
  return typeof value === "string" && (homeEntries as readonly string[]).includes(value);
}

export const homeBlockSchema = v.pipe(
  v.unknown(),
  v.transform(asRecord),
  v.object({
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
    // A non-string shelf (e.g. an unquoted `shelf: 2024` parsed as a number) coerces to
    // its string form instead of erroring — v2 passed the raw value through, so it simply
    // matched no shelf. An explicit null degrades to unset (current shelf).
    shelf: v.optional(
      v.pipe(
        v.unknown(),
        v.transform((value) => {
          if (typeof value === "string") return value;
          if (typeof value === "number" || typeof value === "boolean") return String(value);
          return;
        }),
      ),
    ),
  }),
);

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
