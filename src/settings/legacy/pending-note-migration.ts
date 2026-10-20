import * as v from "valibot";

import { defineSlice } from "@/settings";
import { climb } from "@/settings/repair";

const sectionName = v.picklist(["day", "week", "month", "quarter", "year"] as const);

const namesNotes = "a marker names the notes it migrates";

const intervalMarker = v.object({
  oldJournalId: v.pipe(v.string(), climb(namesNotes)),
  kind: v.pipe(v.literal("interval"), climb("discriminant")),
  name: v.pipe(v.string(), climb(namesNotes)),
});

const calendarMarker = v.object({
  oldJournalId: v.pipe(v.string(), climb(namesNotes)),
  kind: v.pipe(v.literal("calendar"), climb("discriminant")),
  // A section missing from the map strips the legacy keys from that section's notes, so neither a
  // default nor a dropped section is safe; the whole marker goes instead.
  sectionToName: v.pipe(v.record(sectionName, v.string()), climb(namesNotes)),
});

// Notes already in the current shape but written by a plugin version that anchored a
// weekly note somewhere other than its week's first day — v2's week end for a cross-year
// week, or the week's representative day. Their journal-date must be re-canonicalized to
// the week start, the only anchor the current version accepts.
const weekAnchorMarker = v.object({
  kind: v.pipe(v.literal("week-anchor"), climb("discriminant")),
  journalName: v.pipe(v.string(), climb(namesNotes)),
});

export const pendingNoteMigrationSchema = v.array(
  v.variant("kind", [intervalMarker, calendarMarker, weekAnchorMarker]),
);

export type PendingNoteMigration = v.InferOutput<typeof pendingNoteMigrationSchema>[number];

export const PENDING_NOTE_MIGRATION_KEY = "pendingNoteMigration";

export const pendingNoteMigrationSlice = defineSlice(PENDING_NOTE_MIGRATION_KEY, pendingNoteMigrationSchema, []);
