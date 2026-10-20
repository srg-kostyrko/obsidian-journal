import * as v from "valibot";

import { calendarDecorationSchema } from "@/decorations/config";
import { defineCollection } from "@/settings";

const shelfConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  journals: v.array(v.string()),
  decorations: v.optional(v.array(calendarDecorationSchema), []),
});

export type ShelfConfig = v.InferOutput<typeof shelfConfigSchema>;

export const shelvesCollection = defineCollection("shelves", shelfConfigSchema, (id) => ({
  name: id,
  journals: [],
  decorations: [],
}));
