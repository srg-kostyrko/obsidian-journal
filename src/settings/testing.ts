import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";

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

export function createSettingsService(options: CreateSettingsServiceOptions = {}): CreatedSettingsService {
  const data = new FakePluginData(options.raw);
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(LogSinkMultiToken).useValue(new MemorySink());
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  for (const s of options.slices ?? []) c.register(SliceDefinitionToken).useValue(s);
  for (const col of options.collections ?? []) c.register(CollectionDefinitionToken).useValue(col);
  for (const m of options.migrations ?? []) c.register(MigrationToken).useValue(m);
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, container: c };
}
