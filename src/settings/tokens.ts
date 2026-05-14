import { createMultiToken } from "@/infrastructure/di";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";

export const SliceDefinitionToken = createMultiToken<AnySliceDefinition>("settings.slice");
export const CollectionDefinitionToken = createMultiToken<AnyCollectionDefinition>("settings.collection");
export const MigrationToken = createMultiToken<Migration>("settings.migration");
