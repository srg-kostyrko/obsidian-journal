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

type AllWriteType = "day" | "week" | "month" | "quarter" | "year";

const defaultCommands: readonly {
  key: string;
  name: string;
  writeType: AllWriteType;
  type: CommandType;
}[] = [
  { key: "default-open-today", name: "Open today's note", writeType: "day", type: "same" },
  { key: "default-open-weekly", name: "Open weekly note", writeType: "week", type: "same" },
  { key: "default-open-monthly", name: "Open monthly note", writeType: "month", type: "same" },
  { key: "default-open-quarterly", name: "Open quarterly note", writeType: "quarter", type: "same" },
  { key: "default-open-yearly", name: "Open yearly note", writeType: "year", type: "same" },
  { key: "default-open-tomorrow", name: "Open tomorrow's note", writeType: "day", type: "next" },
  { key: "default-open-next-week", name: "Open next week note", writeType: "week", type: "next" },
  { key: "default-open-next-month", name: "Open next month note", writeType: "month", type: "next" },
  { key: "default-open-next-quarter", name: "Open next quarter note", writeType: "quarter", type: "next" },
  { key: "default-open-next-year", name: "Open next year note", writeType: "year", type: "next" },
  { key: "default-open-yesterday", name: "Open yesterday's note", writeType: "day", type: "previous" },
  { key: "default-open-last-week", name: "Open last week note", writeType: "week", type: "previous" },
  { key: "default-open-last-month", name: "Open last month note", writeType: "month", type: "previous" },
  { key: "default-open-last-quarter", name: "Open last quarter note", writeType: "quarter", type: "previous" },
  { key: "default-open-last-year", name: "Open last year note", writeType: "year", type: "previous" },
];

export const commandCollection = defineCollection(
  "commands",
  commandConfigSchema,
  () => ({
    name: "",
    icon: "",
    showInRibbon: false,
    openMode: "active" as const,
    target: { kind: "all" as const, writeType: "day" as const },
    type: "same" as const,
    context: "today" as const,
  }),
  {
    seed: () =>
      Object.fromEntries(
        defaultCommands.map(({ key, name, writeType, type }) => [
          key,
          {
            name,
            icon: "",
            showInRibbon: false,
            openMode: "tab" as const,
            target: { kind: "all" as const, writeType },
            type,
            context: "today" as const,
          },
        ]),
      ),
  },
);
