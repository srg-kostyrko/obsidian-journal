import * as v from "valibot";

import { defineCollection } from "@/settings";

const commandTargetSchema = v.union([
  v.object({
    kind: v.literal("all"),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
  v.object({
    kind: v.literal("journal"),
    journalName: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    kind: v.literal("shelf"),
    shelfName: v.pipe(v.string(), v.minLength(1)),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
]);

const commandTypeSchema = v.picklist([
  "same",
  "next",
  "previous",
  "same_next_week",
  "same_previous_week",
  "same_next_month",
  "same_previous_month",
  "same_next_year",
  "same_previous_year",
]);

const commandContextSchema = v.picklist(["today", "open_note", "only_open_note"]);

const openModeSchema = v.picklist(["active", "tab", "split", "window"]);

const commandConfigSchema = v.object({
  name: v.string(),
  icon: v.string(),
  showInRibbon: v.boolean(),
  openMode: openModeSchema,
  target: commandTargetSchema,
  type: commandTypeSchema,
  context: commandContextSchema,
});

export type CommandTarget = v.InferOutput<typeof commandTargetSchema>;
export type CommandType = v.InferOutput<typeof commandTypeSchema>;
export type CommandContext = v.InferOutput<typeof commandContextSchema>;
export type CommandConfig = v.InferOutput<typeof commandConfigSchema>;

export const commandCollection = defineCollection("commands", commandConfigSchema, () => ({
  name: "",
  icon: "",
  showInRibbon: false,
  openMode: "active" as const,
  target: { kind: "all" as const, writeType: "day" as const },
  type: "same" as const,
  context: "today" as const,
}));
