import * as v from "valibot";

import { defineCollection } from "@/settings";
import { icons } from "@/ui/icons";

import { DEFAULT_CALENDAR_VIEW_ID, defaultCalendarView } from "./default-view";

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

export const FALLBACK_VIEW_ICON = icons.entity.view;

export const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.optional(v.string(), ""),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  leaf: v.optional(v.picklist(["left", "right", "tab"]), "right"),
  openOnStartup: v.optional(v.boolean(), false),
  blocks: v.array(viewBlockInstanceSchema),
});

export type View = v.InferOutput<typeof viewSchema>;
export type ViewBlockInstance = v.InferOutput<typeof viewBlockInstanceSchema>;

export const viewsCollection = defineCollection(
  "views",
  viewSchema,
  (id) => ({
    id: id as ViewId,
    name: id,
    icon: icons.entity.month,
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right" as const,
    openOnStartup: false,
    blocks: [],
  }),
  { seed: () => ({ [DEFAULT_CALENDAR_VIEW_ID]: defaultCalendarView() }) },
);
