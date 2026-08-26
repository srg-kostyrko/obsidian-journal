import * as v from "valibot";

import { defineSlice } from "@/settings";

export type WeekPlacement = "none" | "left" | "right";

export const vaultDayNotesSorts = ["modified-desc", "modified-asc", "name-asc", "name-desc"] as const;
export type VaultDayNotesSort = (typeof vaultDayNotesSorts)[number];
export type VaultDayNotesSortField = "modified" | "name";
export type VaultDayNotesSortDirection = "asc" | "desc";

export function vaultDayNotesSortField(sort: VaultDayNotesSort): VaultDayNotesSortField {
  return sort.startsWith("modified") ? "modified" : "name";
}

export function vaultDayNotesSortDirection(sort: VaultDayNotesSort): VaultDayNotesSortDirection {
  return sort.endsWith("asc") ? "asc" : "desc";
}

export function withVaultDayNotesSortField(sort: VaultDayNotesSort, field: VaultDayNotesSortField): VaultDayNotesSort {
  return `${field}-${vaultDayNotesSortDirection(sort)}`;
}

export function withVaultDayNotesSortDirection(
  sort: VaultDayNotesSort,
  direction: VaultDayNotesSortDirection,
): VaultDayNotesSort {
  return `${vaultDayNotesSortField(sort)}-${direction}`;
}

export const calendarDisplaySliceSchema = v.object({
  weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left"),
  // Off by default: turning it on adds a row to every calendar-timeline block in the vault,
  // and no existing note asked for one.
  timelineNavigation: v.optional(v.boolean(), false),
  vaultDayNotes: v.optional(v.boolean(), false),
  vaultDayNotesSort: v.optional(v.picklist(vaultDayNotesSorts), "modified-desc"),
  vaultDayNotesIncludeJournals: v.optional(v.boolean(), true),
});

export type CalendarDisplaySliceState = v.InferOutput<typeof calendarDisplaySliceSchema>;

export const calendarDisplaySlice = defineSlice<"calendarDisplay", typeof calendarDisplaySliceSchema>(
  "calendarDisplay",
  calendarDisplaySliceSchema,
  {
    weekPlacement: "left",
    timelineNavigation: false,
    vaultDayNotes: false,
    vaultDayNotesSort: "modified-desc",
    vaultDayNotesIncludeJournals: true,
  },
);
