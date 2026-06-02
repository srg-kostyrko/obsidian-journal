import * as v from "valibot";

import { defineSlice } from "@/settings";

const sectionName = v.picklist(["day", "week", "month", "quarter", "year"] as const);

const intervalMarker = v.object({
  oldJournalId: v.string(),
  kind: v.literal("interval"),
  name: v.string(),
});

const calendarMarker = v.object({
  oldJournalId: v.string(),
  kind: v.literal("calendar"),
  sectionToName: v.record(sectionName, v.string()),
});

export const pendingNoteMigrationSchema = v.array(v.variant("kind", [intervalMarker, calendarMarker]));

export type PendingNoteMigration = v.InferOutput<typeof pendingNoteMigrationSchema>[number];

export const PENDING_NOTE_MIGRATION_KEY = "pendingNoteMigration";

export const pendingNoteMigrationSlice = defineSlice(PENDING_NOTE_MIGRATION_KEY, pendingNoteMigrationSchema, []);
