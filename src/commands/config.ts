import { match } from "ts-pattern";
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
  v.object({
    kind: v.literal("notelet"),
    journalName: v.pipe(v.string(), v.minLength(1)),
    typeId: v.pipe(v.string(), v.minLength(1)),
  }),
]);

const commandTypeSchema = v.picklist([
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
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

// Command names are namespaced per owner (a journal, a shelf, or the plugin level):
// the palette prefix disambiguates across owners, so only same-owner names collide.
// Plugin-level commands share one namespace regardless of write type — they list unprefixed.
export function sameCommandOwner(a: CommandTarget, b: CommandTarget): boolean {
  return match([a, b] as const)
    .with([{ kind: "journal" }, { kind: "journal" }], ([x, y]) => x.journalName === y.journalName)
    .with([{ kind: "shelf" }, { kind: "shelf" }], ([x, y]) => x.shelfName === y.shelfName)
    .with([{ kind: "all" }, { kind: "all" }], () => true)
    .with([{ kind: "notelet" }, { kind: "notelet" }], ([x, y]) => x.journalName === y.journalName)
    .otherwise(() => false);
}

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
  { key: "default-open-next-week", name: "Open next weekly note", writeType: "week", type: "next" },
  { key: "default-open-next-month", name: "Open next monthly note", writeType: "month", type: "next" },
  { key: "default-open-next-quarter", name: "Open next quarterly note", writeType: "quarter", type: "next" },
  { key: "default-open-next-year", name: "Open next yearly note", writeType: "year", type: "next" },
  { key: "default-open-yesterday", name: "Open yesterday's note", writeType: "day", type: "previous" },
  { key: "default-open-last-week", name: "Open previous weekly note", writeType: "week", type: "previous" },
  { key: "default-open-last-month", name: "Open previous monthly note", writeType: "month", type: "previous" },
  { key: "default-open-last-quarter", name: "Open previous quarterly note", writeType: "quarter", type: "previous" },
  { key: "default-open-last-year", name: "Open previous yearly note", writeType: "year", type: "previous" },
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
