import * as v from "valibot";

import type { BlockInstanceId } from "../../config";

export const toolbarItemSchema = v.object({
  id: v.pipe(
    v.string(),
    v.uuid(),
    v.transform((s) => s as BlockInstanceId),
  ),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

export type ToolbarItemInstance = v.InferOutput<typeof toolbarItemSchema>;

export const toolbarBlockSchema = v.object({ items: v.array(toolbarItemSchema) });

export type ToolbarConfig = v.InferOutput<typeof toolbarBlockSchema>;
