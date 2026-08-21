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
   * `DuplicateRegistrationError`, since single-kind tokens reject a second registration. A
   * passed module's `register()` must also not resolve anything itself: overrides run after
   * every module is added, so a module that resolves during registration would either see the
   * un-overridden real service or throw `CannotOverrideError` pointing at this file, not at the
   * module that resolved too early.
   */
  readonly modules?: readonly Module[];
  /**
   * Seeded settings data, keyed by collection or slice key. Parsed by the real schema. `version`
   * is an honored key too — it defaults to `CURRENT_VERSION` but can be overridden to exercise
   * migrations. Omit `data` entirely (rather than passing `{}`) to simulate a fresh install with
   * no stored data at all.
   */
  readonly data?: Record<string, unknown>;
  /** Defaults to true. Set false to skip eager construction. */
  readonly autoLoad?: boolean;
}

export interface TestHarness {
  readonly c: Container;
  /**
   * `host.pluginData` is inert: it backs the fake plugin's own `loadData`/`saveData`, but
   * `PluginData` is overridden below, so nothing in the resolved graph ever reaches it. `data`
   * is the live seam for settings persistence.
   */
  readonly host: FakeHost;
  readonly logs: MemorySink;
  readonly modals: FakeModalService;
  readonly notices: FakeNoticeService;
  readonly suggests: FakeSuggestService;
  readonly inputSuggests: FakeInputSuggestService;
  readonly templater: FakeTemplaterService;
  readonly data: FakePluginData;
  readonly settings: SettingsService;
  readonly dispose: () => Promise<void>;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
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

  // The real PluginData reads app.vault.adapter and plugin.manifest.dir, neither of which
  // createFakeHost models, so it is overridden unconditionally rather than only when a test
  // opts in — unlike the five interaction services below, which stand in for a user decision
  // or an absent external plugin.
  const data = new FakePluginData(
    options.data === undefined ? undefined : { version: CURRENT_VERSION, ...options.data },
  );
  c.override(PluginData).useValue(data as unknown as PluginData);

  // Interaction services await a user decision or stand in for an absent external plugin, so a
  // test has to drive them. Everything else in the host module runs real against the fake vault.
  const modals = new FakeModalService();
  const notices = new FakeNoticeService();
  const suggests = new FakeSuggestService();
  const inputSuggests = new FakeInputSuggestService();
  const templater = new FakeTemplaterService();
  c.override(ModalService).useValue(modals as unknown as ModalService);
  c.override(NoticeService).useValue(notices);
  c.override(SuggestService).useValue(suggests as unknown as SuggestService);
  c.override(InputSuggestService).useValue(inputSuggests as unknown as InputSuggestService);
  c.override(TemplaterService).useValue(templater as unknown as TemplaterService);

  const settings = c.resolve(SettingsService);
  const init = await settings.initialize();
  if (init.kind === "err") throw init.error;
  // Services that require an explicit initialize() call in main.ts (VaultSubscriptionService,
  // AutoAttachService, and their neighbors) are constructed here but never initialized, so
  // vault-event-driven indexing does not run. Notes seeded via host.putFile() will not surface
  // through JournalsIndex. Whether to change that is a Phase 1 decision for the journals slice.
  if (options.autoLoad !== false) await c.autoLoad();

  const dispose = (): Promise<void> => c.dispose();

  return {
    c,
    host,
    logs,
    modals,
    notices,
    suggests,
    inputSuggests,
    templater,
    data,
    settings,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
