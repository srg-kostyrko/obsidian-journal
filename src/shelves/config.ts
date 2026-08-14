import * as v from "valibot";

import { calendarDecorationSchema } from "@/decorations/config";
import { defineCollection } from "@/settings";

const shelfConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  journals: v.array(v.string()),
  // Optional with a default so a shelf saved before calendar decorations existed parses
  // instead of failing and resetting the whole shelf to defaults. Falls back (rather than
  // just defaulting on absence) so a *present but invalid* array — e.g. synced from a newer
  // plugin version with a condition type this version doesn't know — degrades to an empty
  // list instead of failing the whole item parse and wiping the shelf's journal membership.
  decorations: v.optional(v.fallback(v.array(calendarDecorationSchema), []), []),
});

export type ShelfConfig = v.InferOutput<typeof shelfConfigSchema>;

export const shelvesCollection = defineCollection("shelves", shelfConfigSchema, (id) => ({
  name: id,
  journals: [],
  decorations: [],
}));
