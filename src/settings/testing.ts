import { createNanoEvents } from "nanoevents";

import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { SettingsService } from "./settings-service";
import {
  CollectionDefinitionToken,
  DashboardBlockToken,
  MigrationToken,
  SettingsEventsToken,
  SliceDefinitionToken,
  SubpageToken,
  type SettingsEvents,
} from "./tokens";
import { SettingsUiService } from "./ui/settings-ui-service";

import type { AnyCollectionDefinition, AnySliceDefinition, Migration } from "./schema";
import type { AnySubpage, DashboardBlock } from "./ui/schema";

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

export interface CreateSettingsUiServiceOptions {
  blocks?: readonly DashboardBlock[];
  subpages?: readonly AnySubpage[];
}

export interface CreatedSettingsUiService {
  readonly service: SettingsUiService;
  readonly container: Container;
}

export function createSettingsUiService(options: CreateSettingsUiServiceOptions = {}): CreatedSettingsUiService {
  const c = new Container();
  const blocks = options.blocks ?? [];
  for (const b of blocks) c.register(DashboardBlockToken).useValue(b);
  const subpages = options.subpages ?? [];
  for (const s of subpages) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  return { service: c.resolve(SettingsUiService), container: c };
}
