export {
  defineCollection,
  defineSlice,
  type CollectionDefinition,
  type Migration,
  type SliceDefinition,
} from "./schema";
export {
  DuplicateBlockKeyError,
  DuplicateSubpageKeyError,
  MigrationFailedError,
  SettingsError,
  SettingsLoadError,
  SettingsSaveError,
  SliceKeyConflictError,
  UnregisteredSliceError,
  UnregisteredSubpageError,
} from "./errors";
export { settingsModule } from "./module";
export { SettingsService } from "./settings-service";
export {
  CollectionDefinitionToken,
  DashboardBlockToken,
  MigrationToken,
  SliceDefinitionToken,
  SubpageToken,
} from "./tokens";
export type { CollectionHandle, SliceHandle } from "./types";
export { CURRENT_VERSION } from "./version";
export { defineDashboardBlock, defineSubpage, type DashboardBlock, type Subpage, type SubpageNav } from "./ui/schema";
export { SettingsUiService } from "./ui/settings-ui-service";
