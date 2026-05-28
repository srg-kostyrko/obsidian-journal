import * as v from "valibot";

import { defineCollection } from "@/settings";

export type ViewId = string & { readonly __viewId: true };
export type BlockInstanceId = string & { readonly __blockInstanceId: true };

const viewIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as ViewId),
);

const blockInstanceIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as BlockInstanceId),
);

const viewBlockInstanceSchema = v.object({
  id: blockInstanceIdSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

export const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  blocks: v.array(viewBlockInstanceSchema),
});

export type View = v.InferOutput<typeof viewSchema>;
export type ViewBlockInstance = v.InferOutput<typeof viewBlockInstanceSchema>;

export const viewsCollection = defineCollection("views", viewSchema, (id) => ({
  id: id as ViewId,
  name: id,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
}));
