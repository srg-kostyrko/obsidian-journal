export {
  defineCollection,
  defineSlice,
  type CollectionDefinition,
  type Migration,
  type SliceDefinition,
} from "./schema";
export {
  MigrationFailedError,
  SettingsError,
  SettingsLoadError,
  SettingsSaveError,
  SliceKeyConflictError,
  UnregisteredSliceError,
} from "./errors";
export { settingsModule } from "./module";
export { SettingsService } from "./settings-service";
export { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";
export type { CollectionHandle, SliceHandle } from "./types";
export { CURRENT_VERSION } from "./version";
