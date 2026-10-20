import * as v from "valibot";

import { climb } from "@/settings/repair";

import type { BlockInstanceId } from "../../config";

export const toolbarItemSchema = v.object({
  id: v.pipe(
    v.string(),
    v.uuid(),
    v.transform((s) => s as BlockInstanceId),
    climb("an item without an id or key cannot render"),
  ),
  key: v.pipe(v.string(), v.minLength(1), climb("an item without an id or key cannot render")),
  config: v.optional(v.record(v.string(), v.unknown()), () => ({})),
});

export type ToolbarItemInstance = v.InferOutput<typeof toolbarItemSchema>;

export const toolbarBlockSchema = v.object({ items: v.array(toolbarItemSchema) });

export type ToolbarConfig = v.InferOutput<typeof toolbarBlockSchema>;
