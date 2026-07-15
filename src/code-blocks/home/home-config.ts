import * as v from "valibot";

const homeEntries = ["day", "week", "month", "quarter", "year", "custom"] as const;

export const homeEntrySchema = v.picklist(homeEntries);

export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;

function isHomeEntry(value: unknown): value is HomeEntry {
  return typeof value === "string" && (homeEntries as readonly string[]).includes(value);
}

// A non-mapping fence (e.g. `show:day` with no space parses to the bare string "show:day")
// degrades to defaults rather than blanking the block into an error panel — v2 still rendered.
function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

export const homeBlockSchema = v.pipe(
  v.unknown(),
  v.transform(asRecord),
  v.object({
    // A typo'd entry drops out instead of failing the whole block into an error
    // panel — v2 filtered invalid entries and rendered the rest.
    show: v.optional(
      v.pipe(
        v.array(v.unknown()),
        v.transform((entries) => entries.filter(isHomeEntry)),
      ),
      () => ["day"] as const,
    ),
    // A null / wrong-type value degrades to the default (v2 coerced with `separator || " • "`).
    separator: v.optional(v.fallback(v.string(), " • "), " • "),
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
    shelf: v.optional(v.string()),
  }),
);

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
