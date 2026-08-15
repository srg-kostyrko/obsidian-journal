import { createMultiToken, createToken } from "@/infrastructure/di";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";
import type { DashboardBlock, AnySubpage } from "./ui/schema";
import type { Emitter } from "nanoevents";

export interface SettingsEvents {
  // Fired while the previous state is still live, so a listener whose data is only
  // interpretable under it (the week grid, and every anchor written against it) can read
  // what it needs before the incoming data.json overwrites the slices.
  reloading: () => void;
  reloaded: () => void;
}

export const SettingsEventsToken = createToken<Emitter<SettingsEvents>>("settings.events");

export const SliceDefinitionToken = createMultiToken<AnySliceDefinition>("settings.slice");
export const CollectionDefinitionToken = createMultiToken<AnyCollectionDefinition>("settings.collection");
export const MigrationToken = createMultiToken<Migration>("settings.migration");
export const DashboardBlockToken = createMultiToken<DashboardBlock>("settings.dashboardBlock");
export const SubpageToken = createMultiToken<AnySubpage>("settings.subpage");
