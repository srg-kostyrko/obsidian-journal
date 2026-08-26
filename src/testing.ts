import { render as tlRender, type RenderOptions, type RenderResult } from "@testing-library/vue";
import { onTestFinished, vi, type Mock } from "vitest";

import { Calendar, CalendarModule } from "@/calendar";
import { testCalendar } from "@/calendar/testing";
import {
  type AnyTokenLike,
  type Class,
  Container,
  type MultiToken,
  type Module,
  type TokenLike,
  provideInjectorOnApp,
} from "@/infrastructure/di";
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
import { ModalService, type ModalApi } from "@/infrastructure/host/modals";
import { FakeModalService, provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { FakeNoticeService, FakePluginData, FakeTemplaterService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule, type MemorySink } from "@/infrastructure/logger/testing";
import { CURRENT_VERSION, CollectionDefinitionToken, SettingsService, SliceDefinitionToken } from "@/settings";
import { settingsCoreModule } from "@/settings/module";
import { templatesModule } from "@/templates";

import type { App } from "vue";

// Copied string literals: these are the warnings SettingsService logs when a parse repairs
// rather than rejects. A message reworded there without this list is a guard that stops firing.
const REPAIR_WARNINGS = new Set([
  "collection entry reset to defaults",
  "collection entry fields reset to defaults",
  "collection seed entry failed validation; omitting",
  "collection discarded; stored value is not an object",
  "slice reset to defaults",
]);

/**
 * Thrown when a `testContainer` boot leaves host side effects (a registered command, setting
 * tab, ribbon icon, or markdown code-block processor) that a CORE module never produces. The
 * likely cause is a FULL `<feature>Module` passed in `modules` instead of its core half — see
 * the `modules` option's doc comment below for why the type system does not catch this.
 */
export class TestContainerLeakedHostStateError extends Error {
  constructor(leaked: readonly string[]) {
    super(
      `testContainer booted with host side effects: ${leaked.join(", ")}. ` +
        "This usually means a FULL <feature>Module was passed in `modules` instead of its " +
        "CORE half — the multi-tokens a full module adds beyond core register additively, so " +
        "the mistake is not caught at the type level.",
    );
    this.name = "TestContainerLeakedHostStateError";
  }
}

/**
 * Thrown when a `data` fixture did not survive the settings parse unchanged. The parse never
 * rejects an entry — `parseCollectionValue` field-repairs it or falls back to `defaultItem`,
 * leaving only a log line — so without this guard a test asserts against a journal it did not ask
 * for and fails somewhere far away. Pass `allow: { dataRepair: true }` for a test whose subject IS
 * the repair path.
 */
export class TestContainerInvalidSeedError extends Error {
  readonly warnings: readonly string[];
  constructor(warnings: readonly string[]) {
    super(`testContainer seed did not survive the settings parse:\n  ${warnings.join("\n  ")}`);
    this.name = "TestContainerInvalidSeedError";
    this.warnings = warnings;
  }
}

/**
 * Thrown when `data` carries a key that no loaded module registers. An absent slice or collection
 * key is silent by design — a fresh install has none — which leaves a *mis-keyed* seed silent too:
 * `calender` for `calendar` would otherwise let the test assert against the slice's defaults and
 * pass with the seed ignored. The other cause is a correctly spelled key whose module was left out
 * of `modules`.
 */
export class TestContainerUnknownSeedKeyError extends Error {
  readonly keys: readonly string[];
  constructor(keys: readonly string[], registered: readonly string[]) {
    super(
      `testContainer seed has key(s) no loaded module registers: ${keys.join(", ")}. ` +
        `Registered: ${registered.join(", ")}. Either the key is misspelled, or the module that ` +
        "registers it is missing from `modules`.",
    );
    this.name = "TestContainerUnknownSeedKeyError";
    this.keys = keys;
  }
}

/**
 * Thrown when a test passes both `data` and `pluginData`. The two are different seams onto the same
 * slot — `data` seeds a fixture the harness parses and guards, `pluginData` hands over an instance
 * the harness must not touch — so silently letting one win would make the ignored one read as
 * applied.
 */
export class TestContainerConflictingDataError extends Error {
  constructor() {
    super(
      "testContainer received both `data` and `pluginData`. `data` seeds a fixture through the " +
        "settings parse; `pluginData` supplies a FakePluginData instance outright. Pass one.",
    );
    this.name = "TestContainerConflictingDataError";
  }
}

export type TestOverride = (container: Container) => void;

export function overrideWith<T>(token: TokenLike<T>, value: T): TestOverride {
  return (container) => void container.override(token).useValue(value);
}

export function overrideWithClass<T>(token: TokenLike<T>, ctor: Class<T>): TestOverride {
  return (container) => void container.override(token).useClass(ctor);
}

interface Initializable {
  initialize(): unknown;
}

function withPlugins<C>(options: RenderOptions<C> | undefined, install: (app: App) => void): RenderOptions<C> {
  return {
    ...options,
    global: { ...options?.global, plugins: [{ install }, ...(options?.global?.plugins ?? [])] },
  };
}

export interface TestContainerOptions {
  /**
   * Feature CORE modules this test opts into. `testContainer` always adds
   * `settingsCoreModule`, `CalendarModule` and `templatesModule` itself. Pass CORE modules only
   * — a FULL `<feature>Module` is not rejected by the type system: the tokens a full module adds
   * on top of its core half (`CollectionDefinitionToken`, `FunctionHandlerToken`,
   * `JournalEditSectionToken`) are all multi-tokens, whose bindings are additive, so registering
   * one a second time succeeds silently instead of throwing. A boot with a full module registers
   * exactly the host side effects (commands, setting tabs, ribbon icons) the core/full split
   * exists to keep out of tests; `testContainer` throws `TestContainerLeakedHostStateError` after
   * `autoLoad` if it finds any, naming this as the likely cause. A passed module's `register()`
   * must also not resolve anything itself: overrides run after every module is added, so a
   * module that resolves during registration would either see the un-overridden real service or
   * throw `CannotOverrideError` pointing at this file, not at the module that resolved too early.
   */
  readonly modules?: readonly Module[];
  /**
   * Seeded settings data, keyed by collection or slice key. Parsed by the real schema. `version`
   * is an honored key too — it defaults to `CURRENT_VERSION` but can be overridden to exercise
   * migrations. Omit `data` entirely (rather than passing `{}`) to simulate a fresh install with
   * no stored data at all. Any other key throws `TestContainerUnknownSeedKeyError`: the parse
   * treats an absent key as a fresh install and returns defaults, so a typo is otherwise silent.
   */
  readonly data?: Record<string, unknown>;
  /**
   * A `FakePluginData` built by the caller, used instead of `data` and returned as `harness.data`.
   * For the two scenarios `data` cannot express, both in `src/settings`:
   *
   * - **Two boots over one stored file.** `data` builds a fresh instance per harness, so a second
   *   boot cannot see what the first wrote. A test proving a write happens only once needs both
   *   services reading the same instance.
   * - **A pre-migration blob.** The seed-key guard below checks the raw keys, which for a v1/v2/v3
   *   fixture include keys no module registers (`calendar_view`, `useShelves`, …). Those keys cannot
   *   be dropped — the migrations dereference them.
   *
   * Mutually exclusive with `data`: passing both throws `TestContainerConflictingDataError`. The
   * seed-key guard is gated on `options.data` and skips this path, since it has no `data` fixture
   * to check. The repair guard is not gated on `data` — it filters `logs.records` unconditionally —
   * so a `pluginData` boot whose migration output field-repairs still throws
   * `TestContainerInvalidSeedError`; `allow: { dataRepair: true }` is the escape hatch for that
   * case same as it is for `data`.
   */
  readonly pluginData?: FakePluginData;
  /** Defaults to true. Set false to skip eager construction. */
  readonly autoLoad?: boolean;
  /**
   * Applied in the same window as the harness's own five overrides — after every module is
   * registered, before `autoLoad` resolves anything eagerly. Overriding through the returned
   * handle instead is a trap: which tokens are still eager by then changes whenever an unrelated
   * module gains a dependency, and an eager one throws `CannotOverrideError{reason:"resolved"}`.
   */
  readonly overrides?: readonly TestOverride[];
  /**
   * Services to `initialize()` after `autoLoad`, in the tokens the caller names — never a fixed
   * list inside the harness. `main.ts` calls `initialize()` on eight services after `autoLoad()`;
   * a test opting into two modules cannot run that list, and a list baked into the harness would
   * be a second wiring definition that drifts from `main.ts`. Name what this scenario needs, e.g.
   * `initialize: [VaultSubscriptionService]` to route seeded/emitted vault events into
   * `JournalsIndex`.
   */
  readonly initialize?: readonly TokenLike<Initializable>[];
  /**
   * Disarms a guard for a test whose subject IS the guarded thing.
   *
   * `hostState` — the test asserts on `host.commands`/`settingTabs`/`ribbonIcons`/
   * `codeBlockProcessors`, so it passes a FULL `<feature>Module` on purpose. Not an escape hatch for "the guard is in my way": a
   * component test needing UI tokens takes `<feature>UiModule`, not this.
   *
   * `dataRepair` — the test exercises the settings repair path with a deliberately broken fixture.
   */
  readonly allow?: { readonly hostState?: boolean; readonly dataRepair?: boolean };
}

export interface TestHarness {
  readonly container: Container;
  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
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
  /**
   * Mounts under the harness's own injector, prepended ahead of a caller's `global.plugins`.
   * A caller's `global.stubs`/`provide` pass through untouched.
   */
  render<C>(component: C, options?: RenderOptions<C>): RenderResult;
  /**
   * Mounts a component that IS a modal, wiring its `useModal()` to mock `submit`/`cancel`. For a
   * component that OPENS a modal, assert on `modals.lastOpen()` instead — the two seams are not
   * interchangeable.
   */
  renderModal<C, Result = void>(
    component: C,
    options?: RenderOptions<C>,
  ): RenderResult & { submit: Mock<(value: Result) => void>; cancel: Mock<() => void> };
  readonly dispose: () => Promise<void>;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}

export async function testContainer(options: TestContainerOptions = {}): Promise<TestHarness> {
  const host = createFakeHost();
  const container = new Container();

  const dispose = (): Promise<void> => container.dispose();
  // settings.initialize() arms a deep watch and #scheduleSave sets a timeout; under isolate:false a
  // container left alive fires its debounce inside a LATER file. Registering before anything can
  // throw is what disposes the container of a boot that trips a guard, and is why no converted test
  // needs an afterEach.
  onTestFinished(() => dispose());

  const { module: loggerModule, sink: logs } = createLoggerTestingModule();
  container.addModule(loggerModule);
  container.addModule(FlowsModule);
  container.addModule(createHostModule(host.plugin));
  container.addModule(settingsCoreModule);
  container.addModule(CalendarModule);
  container.addModule(templatesModule);
  container.addModules(options.modules ?? []);

  // The real PluginData reads app.vault.adapter and plugin.manifest.dir, neither of which
  // createFakeHost models, so it is overridden unconditionally rather than only when a test
  // opts in — unlike the five interaction services below, which stand in for a user decision
  // or an absent external plugin.
  if (options.pluginData !== undefined && options.data !== undefined) {
    throw new TestContainerConflictingDataError();
  }
  const data =
    options.pluginData ??
    new FakePluginData(options.data === undefined ? undefined : { version: CURRENT_VERSION, ...options.data });
  container.override(PluginData).useValue(data as unknown as PluginData);

  // CalendarModule registers Calendar eager, and its constructor re-seeds CUSTOM_LOCALE's week from
  // the SYSTEM locale — so autoLoad() would silently discard the grid the ambient installTestCalendar
  // set, and a test asking for {dow:0} would assert against the machine's.
  container.override(Calendar).useValue(testCalendar());

  // Interaction services await a user decision or stand in for an absent external plugin, so a
  // test has to drive them. Everything else in the host module runs real against the fake vault.
  const modals = new FakeModalService();
  const notices = new FakeNoticeService();
  const suggests = new FakeSuggestService();
  const inputSuggests = new FakeInputSuggestService();
  const templater = new FakeTemplaterService();
  container.override(ModalService).useValue(modals as unknown as ModalService);
  container.override(NoticeService).useValue(notices);
  container.override(SuggestService).useValue(suggests as unknown as SuggestService);
  container.override(InputSuggestService).useValue(inputSuggests as unknown as InputSuggestService);
  container.override(TemplaterService).useValue(templater as unknown as TemplaterService);

  const overrides = options.overrides ?? [];
  for (const override of overrides) override(container);

  const settings = container.resolve(SettingsService);
  const init = await settings.initialize();
  if (init.kind === "err") throw init.error;

  const seededKeys = Object.keys(options.data ?? {});
  if (seededKeys.length > 0) {
    const registered = new Set([
      "version",
      ...container.resolve(SliceDefinitionToken).map((slice) => slice.key),
      ...container.resolve(CollectionDefinitionToken).map((collection) => collection.key),
    ]);
    const unknown = seededKeys.filter((key) => !registered.has(key));
    if (unknown.length > 0) throw new TestContainerUnknownSeedKeyError(unknown, [...registered].toSorted());
  }

  if (options.allow?.dataRepair !== true) {
    const repairs = logs.records
      .filter((record) => REPAIR_WARNINGS.has(record.message))
      .map((record) => `${record.message}: ${JSON.stringify(record.fields)}`);
    if (repairs.length > 0) throw new TestContainerInvalidSeedError(repairs);
  }

  // Services that require an explicit initialize() call in main.ts (VaultSubscriptionService,
  // AutoAttachService, and their neighbors) are constructed here but never initialized: a test
  // names the ones its own scenario needs via `initialize`, run below after autoLoad.
  if (options.autoLoad !== false) await container.autoLoad();

  const toInitialize = options.initialize ?? [];
  for (const token of toInitialize) await container.resolve(token).initialize();

  if (options.allow?.hostState !== true) {
    const leaked: string[] = [];
    if (host.commands.size > 0) leaked.push("commands");
    if (host.settingTabs.length > 0) leaked.push("settingTabs");
    if (host.ribbonIcons.length > 0) leaked.push("ribbonIcons");
    // CodeBlockService is eager and lives in the always-added host module, so a full feature
    // module's CodeBlockDefinitionToken values reach the host during autoLoad — the same leak
    // a stray command is, and invisible without this line.
    if (host.codeBlockProcessors.size > 0) leaked.push("codeBlockProcessors");
    if (leaked.length > 0) throw new TestContainerLeakedHostStateError(leaked);
  }

  function resolve<T>(token: TokenLike<T>): T;
  function resolve<T>(token: MultiToken<T>): T[];
  function resolve(token: AnyTokenLike): unknown {
    return container.resolve(token as TokenLike<unknown>);
  }

  function render<C>(component: C, renderOptions?: RenderOptions<C>): RenderResult {
    return tlRender(
      component,
      withPlugins(renderOptions, (app) => provideInjectorOnApp(app, container)),
    );
  }

  function renderModal<C, Result = void>(
    component: C,
    renderOptions?: RenderOptions<C>,
  ): RenderResult & { submit: Mock<(value: Result) => void>; cancel: Mock<() => void> } {
    const submit = vi.fn<(value: Result) => void>();
    const cancel = vi.fn<() => void>();
    const result = tlRender(
      component,
      withPlugins(renderOptions, (app) => {
        provideInjectorOnApp(app, container);
        provideModalApiOnApp(app, { submit, cancel } as ModalApi<unknown>);
      }),
    );
    return { ...result, submit, cancel };
  }

  return {
    container,
    resolve,
    host,
    logs,
    modals,
    notices,
    suggests,
    inputSuggests,
    templater,
    data,
    settings,
    render,
    renderModal,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
