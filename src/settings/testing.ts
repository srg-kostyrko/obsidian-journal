import * as v from "valibot";

import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";

import { defineCollection, defineSlice } from "./schema";
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

const SENTINEL_SLICE = defineSlice("__test_core__", v.object({}), {});
const SENTINEL_COLLECTION = defineCollection("__test_core_collection__", v.object({}), () => ({}));

export function createSettingsService(options: CreateSettingsServiceOptions = {}): CreatedSettingsService {
  const data = new FakePluginData(options.raw);
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(LogSinkMultiToken).useValue(new MemorySink());
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  if (options.slices && options.slices.length > 0) {
    for (const s of options.slices) c.register(SliceDefinitionToken).useValue(s);
  } else {
    c.register(SliceDefinitionToken).useValue(SENTINEL_SLICE);
  }
  if (options.collections && options.collections.length > 0) {
    for (const col of options.collections) c.register(CollectionDefinitionToken).useValue(col);
  } else {
    c.register(CollectionDefinitionToken).useValue(SENTINEL_COLLECTION);
  }
  const migrations = options.migrations && options.migrations.length > 0 ? options.migrations : [IDENTITY_MIGRATION];
  for (const m of migrations) c.register(MigrationToken).useValue(m);
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, container: c };
}
