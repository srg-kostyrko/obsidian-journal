import { createNanoEvents } from "nanoevents";

import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { SettingsService } from "./settings-service";
import { SnapshotService } from "./snapshots/snapshot-service";
import {
  CollectionDefinitionToken,
  MigrationToken,
  SettingsEventsToken,
  SliceDefinitionToken,
  type SettingsEvents,
} from "./tokens";

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
  c.register(SnapshotService).useClass(SnapshotService);
  c.register(SettingsEventsToken).useFactory(() => createNanoEvents<SettingsEvents>());
  c.addModule(createLoggerTestingModule().module);
  const slices = options.slices ?? [];
  for (const s of slices) c.register(SliceDefinitionToken).useValue(s);
  const collections = options.collections ?? [];
  for (const col of collections) c.register(CollectionDefinitionToken).useValue(col);
  const migrations = options.migrations ?? [];
  for (const m of migrations) c.register(MigrationToken).useValue(m);
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, container: c };
}
