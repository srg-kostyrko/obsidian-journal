import * as v from "valibot";

import type { DeviceKind } from "@/infrastructure/host";
import { defineSlice } from "@/settings";

// `v.fallback` inside `v.optional`: a slice has no per-field repair path, so an unknown stored
// value would otherwise reset every field this slice grows rather than just this one.
export const noteCreationSliceSchema = v.object({
  devices: v.optional(v.fallback(v.picklist(["all", "desktop", "mobile"]), "all"), "all"),
});

export type NoteCreationSliceState = v.InferOutput<typeof noteCreationSliceSchema>;
export type CreationDevices = NoteCreationSliceState["devices"];

export const noteCreationSlice = defineSlice<"noteCreation", typeof noteCreationSliceSchema>(
  "noteCreation",
  noteCreationSliceSchema,
  { devices: "all" },
);

export function creationAllowedOn(devices: CreationDevices, device: DeviceKind): boolean {
  return devices === "all" || devices === device;
}
