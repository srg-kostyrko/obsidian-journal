import * as v from "valibot";

import type { DeviceKind } from "@/infrastructure/host";
import { defineSlice } from "@/settings";

export const noteCreationSliceSchema = v.object({
  devices: v.optional(v.picklist(["all", "desktop", "mobile"]), "all"),
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
