import * as v from "valibot";

import { defineNestedCollection } from "@/settings";

import { promptsSchema } from "../prompts/config";

export const DEFAULT_NOTELET_FIELD = "journal-notelet";

export type TypeId = string & { readonly __noteletTypeId: true };

const typeId = v.pipe(
  v.string(),
  v.minLength(1),
  v.transform((s) => s as TypeId),
);

const noteletCounterSchema = v.object({
  enabled: v.boolean(),
  frontmatterKey: v.pipe(v.string(), v.minLength(1)),
});

export const noteletTypeSchema = v.object({
  id: v.optional(typeId, "" as TypeId),
  name: v.optional(v.pipe(v.string(), v.minLength(1)), "Notelet"),
  folder: v.optional(v.string(), ""),
  nameTemplate: v.optional(v.string(), "{{journal_name}} {{notelet_index}}"),
  templates: v.optional(v.array(v.string()), []),
  counter: v.optional(noteletCounterSchema, () => ({ enabled: true, frontmatterKey: "journal-notelet-index" })),
  prompts: v.optional(promptsSchema, () => []),
});

export type NoteletType = v.InferOutput<typeof noteletTypeSchema>;
export type NoteletCounter = v.InferOutput<typeof noteletCounterSchema>;

// An absent `id` does not parse on its own: the `""` default still runs through the wrapped
// minLength(1) pipe and fails, so it comes back only via repairCollectionEntry substituting the
// record key. The record key is the identity — a stored id that disagrees with it would make
// every config reference unresolvable.
export function noteletTypeDefaults(id: string, raw?: unknown): NoteletType {
  const stored = (raw as { name?: unknown } | null | undefined)?.name;
  const name = typeof stored === "string" && stored.trim() !== "" ? stored : "Notelet";
  return {
    id: id as TypeId,
    name,
    folder: "",
    nameTemplate: "{{journal_name}} {{notelet_index}}",
    templates: [],
    counter: { enabled: true, frontmatterKey: "journal-notelet-index" },
    prompts: [],
  };
}

export const noteletTypeCollection = defineNestedCollection(noteletTypeSchema, noteletTypeDefaults);
