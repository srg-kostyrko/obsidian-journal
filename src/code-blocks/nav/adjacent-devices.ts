import type { DeviceKind } from "@/infrastructure/host";
import type { AdjacentDevices } from "@/journals";

/** The fence's `adjacent` as written: everywhere or nowhere, or the one device kind that shows them. */
export type FenceAdjacent = boolean | DeviceKind;

export function fenceAdjacentDevices(value: FenceAdjacent): AdjacentDevices {
  if (value === true) return "all";
  if (value === false) return "none";
  return value;
}

export function adjacentShownOn(devices: AdjacentDevices, device: DeviceKind): boolean {
  return devices === "all" || devices === device;
}
