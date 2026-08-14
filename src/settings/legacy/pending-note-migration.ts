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

// Notes already in the current shape but written by a plugin version that anchored a
// weekly note somewhere other than its week's first day — v2's week end for a cross-year
// week, or the week's representative day. Their journal-date must be re-canonicalized to
// the week start, the only anchor the current version accepts.
const weekAnchorMarker = v.object({
  kind: v.literal("week-anchor"),
  journalName: v.string(),
});

export const pendingNoteMigrationSchema = v.array(
  v.variant("kind", [intervalMarker, calendarMarker, weekAnchorMarker]),
);

export type PendingNoteMigration = v.InferOutput<typeof pendingNoteMigrationSchema>[number];

export const PENDING_NOTE_MIGRATION_KEY = "pendingNoteMigration";

export const pendingNoteMigrationSlice = defineSlice(PENDING_NOTE_MIGRATION_KEY, pendingNoteMigrationSchema, []);
