import * as v from "valibot";

const homeEntries = ["day", "week", "month", "quarter", "year", "custom"] as const;

export const homeEntrySchema = v.picklist(homeEntries);

export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;

function isHomeEntry(value: unknown): value is HomeEntry {
  return typeof value === "string" && (homeEntries as readonly string[]).includes(value);
}

export const homeBlockSchema = v.object({
  // A typo'd entry drops out instead of failing the whole block into an error
  // panel — v2 filtered invalid entries and rendered the rest.
  show: v.optional(
    v.pipe(
      v.array(v.unknown()),
      v.transform((entries) => entries.filter(isHomeEntry)),
    ),
    () => ["day"] as const,
  ),
  separator: v.optional(v.string(), " • "),
  scale: v.optional(v.number(), 1),
  shelf: v.optional(v.string()),
});

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
