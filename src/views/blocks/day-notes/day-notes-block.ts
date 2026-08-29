import * as v from "valibot";

import { periodKinds } from "@/calendar";
import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import DayNotesBlock from "./ui/DayNotesBlock.vue";
import DayNotesBlockConfig from "./ui/DayNotesBlockConfig.vue";

export const dayNotesSortFields = ["name", "modified", "created"] as const;
export const dayNotesSortDirections = ["asc", "desc"] as const;

const schema = v.object({
  granularity: v.optional(v.picklist(periodKinds), "day"),
  sortField: v.optional(v.picklist(dayNotesSortFields), "modified"),
  sortDirection: v.optional(v.picklist(dayNotesSortDirections), "desc"),
  showHeading: v.optional(v.boolean(), true),
  showNavigation: v.optional(v.boolean(), false),
});

export type DayNotesBlockConfig = v.InferOutput<typeof schema>;
export type DayNotesBlockConfigChange = (next: DayNotesBlockConfig) => void;

export const dayNotesBlock = defineViewBlock<DayNotesBlockConfig>({
  key: "day-notes",
  label: () => m.view_block_day_notes_label(),
  description: () => m.view_block_day_notes_description(),
  icon: icons.block.dayNotes,
  schema,
  defaultConfig: {
    granularity: "day",
    sortField: "modified",
    sortDirection: "desc",
    showHeading: true,
    showNavigation: false,
  },
  component: DayNotesBlock,
  configComponent: DayNotesBlockConfig,
});
