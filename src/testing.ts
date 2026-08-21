import { CalendarModule } from "@/calendar";
import { Container, type Module } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import {
  InputSuggestService,
  NoticeService,
  PluginData,
  SuggestService,
  TemplaterService,
  createHostModule,
} from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { createFakeHost, type FakeHost } from "@/infrastructure/host/internal/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { FakeNoticeService, FakePluginData, FakeTemplaterService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule, type MemorySink } from "@/infrastructure/logger/testing";
import { CURRENT_VERSION, SettingsService, settingsCoreModule } from "@/settings";
import { templatesModule } from "@/templates";

export interface TestContainerOptions {
  /**
   * Feature CORE modules this test opts into. `testContainer` always adds
   * `settingsCoreModule`, `CalendarModule` and `templatesModule` itself — passing a FULL
   * `<feature>Module` (or anything that transitively re-registers those) throws
   * `DuplicateRegistrationError`, since single-kind tokens reject a second registration.
   */
  readonly modules?: readonly Module[];
  /** Seeded settings data, keyed by collection or slice key. Parsed by the real schema. */
  readonly data?: Record<string, unknown>;
  /** Defaults to true. Set false to skip eager construction. */
  readonly autoLoad?: boolean;
}

export interface TestHarness {
  readonly c: Container;
  readonly host: FakeHost;
  readonly logs: MemorySink;
  readonly modals: FakeModalService;
  readonly notices: FakeNoticeService;
  readonly settings: SettingsService;
}

export async function testContainer(options: TestContainerOptions = {}): Promise<TestHarness> {
  const host = createFakeHost();
  const c = new Container();

  const { module: loggerModule, sink: logs } = createLoggerTestingModule();
  c.addModule(loggerModule);
  c.addModule(FlowsModule);
  c.addModule(createHostModule(host.plugin));
  c.addModule(settingsCoreModule);
  c.addModule(CalendarModule);
  c.addModule(templatesModule);
  c.addModules(options.modules ?? []);

  const data = new FakePluginData({ version: CURRENT_VERSION, ...options.data });
  c.override(PluginData).useValue(data as unknown as PluginData);

  // Interaction services await a user decision or stand in for an absent external plugin, so a
  // test has to drive them. Everything else in the host module runs real against the fake vault.
  const modals = new FakeModalService();
  const notices = new FakeNoticeService();
  c.override(ModalService).useValue(modals as unknown as ModalService);
  c.override(NoticeService).useValue(notices);
  c.override(SuggestService).useValue(new FakeSuggestService() as unknown as SuggestService);
  c.override(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  c.override(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);

  const settings = c.resolve(SettingsService);
  await settings.initialize();
  if (options.autoLoad !== false) await c.autoLoad();

  return { c, host, logs, modals, notices, settings };
}
