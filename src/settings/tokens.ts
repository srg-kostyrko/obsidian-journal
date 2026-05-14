import { createMultiToken } from "@/infrastructure/di";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";
import type { DashboardBlock, AnySubpage } from "./ui/schema";

export const SliceDefinitionToken = createMultiToken<AnySliceDefinition>("settings.slice");
export const CollectionDefinitionToken = createMultiToken<AnyCollectionDefinition>("settings.collection");
export const MigrationToken = createMultiToken<Migration>("settings.migration");
export const DashboardBlockToken = createMultiToken<DashboardBlock>("settings.dashboardBlock");
export const SubpageToken = createMultiToken<AnySubpage>("settings.subpage");
