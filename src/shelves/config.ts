import * as v from "valibot";

import { defineCollection } from "@/settings";

const shelfConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  journals: v.array(v.string()),
});

export type ShelfConfig = v.InferOutput<typeof shelfConfigSchema>;

export const shelvesCollection = defineCollection("shelves", shelfConfigSchema, (id) => ({
  name: id,
  journals: [],
}));
