import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";

import { SettingsService } from "./settings-service";
import { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";

export { FakePluginData } from "@/infrastructure/host/testing";

export interface CreateSettingsServiceOptions {
  raw?: unknown;
  slices?: readonly AnySliceDefinition[];
  collections?: readonly AnyCollectionDefinition[];
  migrations?: readonly Migration[];
}

export interface CreatedSettingsService {
  readonly service: SettingsService;
  readonly data: FakePluginData;
  readonly container: Container;
}

const IDENTITY_MIGRATION: Migration = { fromVersion: -1, toVersion: -1, migrate: (r) => r };

export function createSettingsService(options: CreateSettingsServiceOptions = {}): CreatedSettingsService {
  const data = new FakePluginData(options.raw);
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  if (options.slices && options.slices.length > 0) {
    for (const s of options.slices) c.register(SliceDefinitionToken).useValue(s);
  } else {
    const sentinelSlice: AnySliceDefinition = {
      __brand: "slice",
      key: "__test_core__",
      schema: { kind: "schema" } as never,
      defaults: {},
    };
    c.register(SliceDefinitionToken).useValue(sentinelSlice);
  }
  if (options.collections && options.collections.length > 0) {
    for (const col of options.collections) c.register(CollectionDefinitionToken).useValue(col);
  } else {
    const sentinelCollection: AnyCollectionDefinition = {
      __brand: "collection",
      key: "__test_core_collection__",
      itemSchema: { kind: "schema" } as never,
      defaultItem: () => ({}),
    };
    c.register(CollectionDefinitionToken).useValue(sentinelCollection);
  }
  const migrations = options.migrations && options.migrations.length > 0 ? options.migrations : [IDENTITY_MIGRATION];
  for (const m of migrations) c.register(MigrationToken).useValue(m);
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, container: c };
}
