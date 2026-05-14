# v3 Settings UI — Design

**Stage:** Pluggable settings UI layer for the v3 plugin rewrite — a shell
(dashboard + subpage router) into which feature modules contribute their own
UI sections and routed pages.
**Date:** 2026-05-14
**Status:** Draft for review

## Purpose

v2 settings UI was tightly coupled: `JournalSettingsRoot.vue` hard-coded
both the dashboard composition (notifications, journals list, plugin
commands, migration, ...) and the subpage navigation (`selectedJournalName`
and `selectedShelfName` refs determined whether to show the dashboard, the
edit page, or the shelf details page). Adding a feature meant editing the
central root component.

v3 replaces that with a pluggable shell. The settings module owns only the
Obsidian `PluginSettingTab` adapter, a dashboard scroller, and a subpage
router. Every dashboard section is a registered _block_ contributed by its
owning feature module, and every routed page is a registered _subpage_.
Blocks and subpages are pure value contributions through DI multi-tokens —
the same mechanism the settings data layer already uses for slices,
collections, and migrations
([`2026-05-14-v3-settings-design.md`](./2026-05-14-v3-settings-design.md)).

The UI layer lives inside `src/settings/` alongside the data layer; the two
are one feature surface and ship together.

## Non-goals

- **Per-block settings state.** Blocks read and write reactive slice state
  through `SettingsService.getSlice(...)` directly. This spec does not
  add a parallel mutation API.
- **Runtime register/unregister.** Blocks and subpages are bound at
  compose time. There is no `registerBlock(...)` / `registerSubpage(...)`
  service. The future view-host helper (per the `project_v3_views_dynamic`
  memory) is a separate concern; settings UI stays compose-time, like the
  rest of `src/settings/`.
- **Third-party extensibility.** The multi-token surface is internal to
  this plugin's modules. We do not expose a public API for other Obsidian
  plugins or user scripts to register blocks.
- **Modals.** Opening a modal from inside a block continues to use the
  existing `ModalService` directly; modals and subpages are different
  abstractions (result vs. navigation) and we do not unify them.
- **Cross-tab persistence of navigation state.** Closing and reopening
  the settings tab resets the stack to the dashboard. This matches v2.

## Architecture

### Module layout

```
src/settings/
  index.ts                       public barrel — exports defineDashboardBlock,
                                 defineSubpage, DashboardBlockToken,
                                 SubpageToken in addition to existing exports
  module.ts                      settingsModule — registers data layer AND UI shell
  schema.ts                      ← unchanged (defineSlice/defineCollection/Migration)
  tokens.ts                      ← adds DashboardBlockToken, SubpageToken
  version.ts                     ← unchanged
  settings-service.ts            ← unchanged
  collection.ts                  ← unchanged
  migrations.ts                  ← unchanged
  errors.ts                      ← adds DuplicateBlockKeyError,
                                 DuplicateSubpageKeyError,
                                 UnregisteredSubpageError
  testing.ts                     ← adds createSettingsUiService(...)
                                 alongside existing createSettingsService(...)
  ui/
    schema.ts                    defineDashboardBlock, defineSubpage
                                 (pure value builders)
    settings-ui-service.ts       SettingsUiService — resolves multi-tokens
                                 + owns the navigation stack
    settings-ui-service.test.ts
    plugin-setting-tab.ts        adapter: PluginSettingTab → mounts Shell.vue
    Shell.vue                    dashboard scroller + active-subpage outlet
    Shell.test.ts
    DashboardBlock.vue           thin container that mounts a contributed
                                 block component
```

Top-level `tokens.ts` / `errors.ts` / `testing.ts` stay one-file-per-concern
(per the `feedback_errors_in_errors_ts` memory). The `ui/` subfolder keeps
Vue-flavoured pieces from cluttering the data-layer files. Public API is
one barrel (`src/settings/index.ts`).

`PluginSettingTabAdapter` and `DashboardBlock.vue` are internal — not
re-exported from the public barrel.

### Responsibilities

- **`ui/schema.ts`** — pure value builders. `defineDashboardBlock({ key,
component, order })` and `defineSubpage<TProps>({ key, component })`
  return tagged data objects with no service dependency, safe to evaluate
  at module-import time. The returned object is both the DI value bound
  to its multi-token and the typed lookup key passed to
  `nav.push(subpageDef, props)`.
- **`tokens.ts`** — two new multi-tokens, `DashboardBlockToken` and
  `SubpageToken`, alongside the existing slice/collection/migration
  tokens.
- **`ui/settings-ui-service.ts`** — `SettingsUiService` resolves both
  multi-tokens at construction (after the DI multi-token change in
  § _Infrastructure delta_, an empty contribution set is fine). It sorts
  blocks by `order`, validates uniqueness of block and subpage keys, and
  owns the navigation stack. Exposes `blocks` (sorted, readonly),
  `current` (top of stack as a Vue `Ref`), `push(...)`, `pop()`,
  `reset()`.
- **`ui/plugin-setting-tab.ts`** — internal adapter that extends Obsidian's
  `PluginSettingTab`. Registered eager; constructor calls
  `inject(InternalPluginToken).addSettingTab(this)`. Its `display()`
  creates a Vue app rooted on `Shell.vue` and provides the `Injector`
  so child components can `useService(...)`. `hide()` unmounts and
  calls `settingsUiService.reset()`.
- **`ui/Shell.vue`** — reads `service.current`. If `null`, renders the
  dashboard scroller iterating `service.blocks` in order, each wrapped
  in `<DashboardBlock>`. Otherwise mounts the active subpage component
  with `props` and `nav`.
- **`ui/DashboardBlock.vue`** — thin container `<div>` (block wrapper /
  spacing) that mounts the contributed block component. No props logic.

### How a feature module contributes

A feature module binds its blocks and subpages through the multi-tokens.
No method calls on `SettingsUiService`.

```ts
// src/journals/settings-ui.ts
import { defineDashboardBlock, defineSubpage } from "@/settings";

import JournalsBlock from "./components/JournalsBlock.vue";
import JournalEditPage from "./components/JournalEditPage.vue";

export const journalsBlock = defineDashboardBlock({
  key: "journals.list",
  component: JournalsBlock,
  order: 20,
});

export const journalEditSubpage = defineSubpage<{ name: string }>({
  key: "journals.edit",
  component: JournalEditPage,
});

// src/journals/module.ts
import { DashboardBlockToken, SubpageToken } from "@/settings";

export const journalsModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(journalsBlock);
    c.register(SubpageToken).useValue(journalEditSubpage);
  },
};
```

A block opens a subpage by reading the UI service in its own setup and
calling `push`:

```vue
<!-- src/journals/components/JournalsBlock.vue -->
<script setup lang="ts">
import { useService } from "@/infrastructure/di";
import { SettingsUiService, journalEditSubpage } from "@/settings";
// ^ journalEditSubpage is re-exported from the journals barrel; the import path
//   above is illustrative — feature modules export their own definitions.

const ui = useService(SettingsUiService);
function edit(name: string) {
  ui.push(journalEditSubpage, { name });
}
</script>
```

A subpage receives `props` and a `nav` prop from the shell. The subpage
owns its own chrome (header, back button); the shell provides nothing
visual around it.

```vue
<!-- src/journals/components/JournalEditPage.vue -->
<script setup lang="ts">
defineProps<{ name: string; nav: SubpageNav }>();
</script>

<template>
  <header>
    <button @click="nav.back">← Dashboard</button>
    <h2>Edit {{ name }}</h2>
  </header>
  <!-- body -->
</template>
```

A subpage can drill into another subpage by calling `nav.push(next, props)`;
back navigation is LIFO, so edit → shelf → edit produces a sensible
back-stack.

## Public API

```ts
// src/settings/ui/schema.ts
import type { Component } from "vue";

export interface DashboardBlock {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineDashboardBlock(block: DashboardBlock): DashboardBlock;

export interface Subpage<TProps> {
  readonly key: string;
  readonly component: Component;
  readonly __props: (witness: never) => TProps;
}

export function defineSubpage<TProps = void>(input: { key: string; component: Component }): Subpage<TProps>;

export interface SubpageNav {
  back(): void;
  push<TProps>(subpage: Subpage<TProps>, props: TProps): void;
}
```

```ts
// src/settings/tokens.ts (additions; existing slice/collection/migration
// tokens unchanged)
export const DashboardBlockToken = createMultiToken<DashboardBlock>("settings.dashboardBlock");
export const SubpageToken = createMultiToken<Subpage<unknown>>("settings.subpage");
```

```ts
// src/settings/ui/settings-ui-service.ts
export class SettingsUiService {
  readonly blocks: readonly DashboardBlock[];
  readonly current: Ref<{ subpage: Subpage<unknown>; props: unknown } | null>;

  push<TProps>(subpage: Subpage<TProps>, props: TProps): void;
  pop(): void;
  reset(): void;
}
```

API decisions confirmed during brainstorming:

- **Pluggability scope.** Settings module owns only the shell; every
  dashboard section is a contributed block (no built-in blocks).
- **Navigation.** Typed `defineSubpage` definitions + LIFO stack via
  `push`/`pop`. Supports nested drill-downs (edit → shelf → edit).
- **Ordering.** Explicit `order: number` on each block; stable ascending
  sort. Modules pick numbers with spacing for easy insertion.
- **Registration timing.** Compose-time only via DI multi-tokens. No
  runtime register/unregister.
- **Subpage chrome.** The subpage component renders its own header and
  back button. The shell hands the subpage a typed `nav` prop and no
  other surrounding chrome.
- **Visibility.** No `visible` predicate on `DashboardBlock`. Each block
  component handles its own visibility via Vue reactivity
  (`<template v-if=...>` reading from `useService(SettingsService)`).
- **Props typing.** `defineSubpage<TProps>` uses the same phantom-witness
  trick as `defineModal<TProps, TResult>` for type-safe props without
  runtime schemas.

## Bootstrap lifecycle

`settingsModule` registers `SettingsService` (existing), `SettingsUiService`
(new), and `PluginSettingTabAdapter` (new, eager). Boot runs from
`container.autoLoad()` in `main.ts`.

1. **`SettingsService` constructs first** (eager) — loads, migrates,
   validates the root. This must happen before any UI mounts because
   blocks read slice state.
2. **`SettingsUiService` constructs** — `inject(DashboardBlockToken)` and
   `inject(SubpageToken)` return arrays (possibly empty, after the
   multi-token change in § _Infrastructure delta_). It:
   - sorts blocks by `order` (stable, ascending);
   - validates uniqueness of block keys → `DuplicateBlockKeyError` if any
     collision;
   - validates uniqueness of subpage keys → `DuplicateSubpageKeyError`;
   - initializes `current` to `null`.
     Block keys and subpage keys live in independent namespaces — a block
     and a subpage may share a name.
3. **`PluginSettingTabAdapter` constructs** (eager) — extends
   `PluginSettingTab`. The constructor calls
   `inject(InternalPluginToken).addSettingTab(this)` so Obsidian shows
   the tab. The adapter holds a reference to the injector to provide
   it into the Vue app on `display()`.

### Tab open → close cycle

- **`display()`** — creates a Vue app rooted on `Shell.vue`, calls
  `provideInjectorOnApp(app, injector)` (from `@/infrastructure/di`) so
  descendants resolve services with `useService(...)`, then
  `app.mount(containerEl)`.
- **`Shell.vue`** reads `service.current`. If `null`, renders the
  dashboard: a scroller iterating `service.blocks` in order, each wrapped
  in `<DashboardBlock>` mounting the contributed component. If non-null,
  renders the active subpage's component with `props` and a `nav` prop
  bound to `{ back: service.pop, push: service.push }`.
- A block dispatches navigation by calling
  `useService(SettingsUiService).push(subpageDef, props)`. The shell
  rerenders to mount the subpage. The subpage owns its header and back
  button; calling `nav.back()` pops the stack and the shell rerenders.
- Nested `nav.push(...)` from inside a subpage adds another frame; LIFO
  popping returns to the previous subpage, then to the dashboard.
- **`hide()`** — unmounts the Vue app and calls
  `settingsUiService.reset()` so the next `display()` starts at the
  dashboard (matches v2).

### Re-entry safety

- `push()` may be called mid-render (e.g., from a click handler) — the
  underlying `current` ref is reactive and Vue handles the rerender.
- `pop()` on an empty stack is a no-op, defending the shell against stray
  back clicks.

### Unload (`container.dispose()`)

DI's normal disposal handles `PluginSettingTabAdapter`. Obsidian owns the
`PluginSettingTab` DOM and removes the tab when the plugin unloads; the
adapter has no explicit teardown beyond what Obsidian performs.
`SettingsUiService` has no resources to clean up.

## Data flow

```
DashboardBlockToken (multi) ─┐
SubpageToken        (multi) ─┤
                              ▼
              SettingsUiService constructor
                  - sort blocks by order
                  - check duplicate keys
                  - current = null
                              │
                              ▼
              PluginSettingTabAdapter.display()
                  - create Vue app, provideInjectorOnApp(app, injector)
                  - mount Shell.vue
                              │
                              ▼
Shell.vue ──► current === null  ──► render blocks (in order)
              │
              └─► block calls ui.push(subpageDef, props)
                              │
                              ▼
              Shell.vue ──► render subpage with { ...props, nav }
                              │
                              └─► subpage calls nav.back() / nav.push(...)
                              │
                              ▼
                       hide() → reset()
```

## Errors

All entries live in `src/settings/errors.ts` per the
`feedback_errors_in_errors_ts` memory. The existing file gains the three
new classes; they extend the existing `SettingsError` abstract base
(`src/settings/errors.ts:1`).

- **`DuplicateBlockKeyError`** — two modules contributed
  `DashboardBlockToken` with the same `key`. Boot-fatal, programmer
  error. Carries the conflicting key.
- **`DuplicateSubpageKeyError`** — same for `SubpageToken`. Boot-fatal.
- **`UnregisteredSubpageError`** — `service.push(subpage, props)` called
  with a definition whose `key` is not in the resolved subpage set.
  Thrown synchronously. Programmer error: this is unreachable in normal
  code paths because callers import the subpage definition value from
  the owning module's barrel, but the runtime check defends against
  type-erasure tricks (e.g., passing a structurally-similar object).

No async/result-returning APIs are added here — every error condition is
a programmer mistake at boot or in the call site, not user data
corruption, so they throw rather than returning `Result`.

## Testing

Per the `feedback_test_hygiene`, `feedback_testing_dir_layout`,
`feedback_one_behavior_per_test`, `feedback_black_box_assertions`, and
`feedback_testing_library_for_components` memories:

**`src/settings/ui/settings-ui-service.test.ts`**

- blocks resolve sorted by `order` regardless of binding order
- duplicate block key fails construction with `DuplicateBlockKeyError`
- duplicate subpage key fails construction with `DuplicateSubpageKeyError`
- `push(subpage, props)` advances `current` to the new frame
- `pop()` removes the top frame; nested push → push → pop returns to the
  prior frame (LIFO stack)
- `pop()` on empty stack is a no-op
- `push(unregisteredSubpage, ...)` throws `UnregisteredSubpageError`
- `reset()` clears the stack to dashboard

**`src/settings/ui/Shell.test.ts`** (testing-library/vue + user-event)

- renders blocks in `order` sequence (assert visible DOM ordering, not
  internal arrays)
- when `current` is non-null, dashboard content is hidden and the active
  subpage is mounted with its props
- nested subpage push renders the new subpage; invoking its `nav.back`
  returns to the previous subpage

**`src/settings/testing.ts`** (additions)

- `createSettingsUiService({ blocks = [], subpages = [] })` — constructs
  a real `SettingsUiService` in an isolated DI scope; used by feature-
  module tests for integration coverage of their own blocks/subpages
  without mocking the service itself.

**Tests deliberately not written**, per memory:

- `defineDashboardBlock` / `defineSubpage` — trivial value constructors
  (`feedback_no_trivial_tests`).
- multi-token wiring (`feedback_no_wiring_tests`).
- the `PluginSettingTabAdapter` Obsidian glue — wiring
  (`feedback_no_wiring_tests`); its behavior is covered through
  `Shell.test.ts` + `settings-ui-service.test.ts`.
- the barrel shape (`feedback_no_wiring_tests`).
- `createSettingsUiService` itself (`feedback_no_mock_fake_tests`).

Per-task quality gates: `npm run test`, `npm run check:types`,
`npm run check:lint` (per the `feedback_test_commands` memory).

## Infrastructure delta — DI multi-tokens default to empty

Today, `Container.resolve(...)` on a multi-token with zero bindings throws
`TokenNotRegisteredError` (`src/infrastructure/di/container.ts:53-56`;
asserted by `container.test.ts:129-134`). The existing settings data
layer works around this by registering sentinel `coreSlice`,
`coreCollection`, and `identityMigration` values in `settingsModule`.

This spec folds in the semantic fix: an empty multi-token resolves to
`[]`. A multi-token represents _"all the contributions for this purpose"_;
zero contributions is a valid state for that question. Single-token
resolution still throws — a missing single binding is a misconfiguration.

Changes:

- **`src/infrastructure/di/container.ts`** — in `resolve()`, when
  `entries` is empty, check `tokenKind(token)`; multi → return `[]`;
  single → throw `TokenNotRegisteredError`.
- **`src/infrastructure/di/container.test.ts`** — flip the test at
  lines 129-134:
  `"throws TokenNotRegisteredError when a multi-token has no bindings"`
  becomes
  `"returns an empty array when a multi-token has no bindings"`,
  asserting `expect(c.resolve(t)).toEqual([])`.
- **`src/settings/module.ts`** — delete `coreSlice`, `coreCollection`,
  `identityMigration` declarations and their `c.register(...).useValue(...)`
  calls. The new `settingsModule` body is:

  ```ts
  export const settingsModule: Module = {
    register(c) {
      c.register(SettingsService).useClass(SettingsService).eager();
      c.register(SettingsUiService).useClass(SettingsUiService);
      c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
    },
  };
  ```

- **`SettingsService` consumers** — `SettingsService` already iterates the
  arrays it receives from `inject(SliceDefinitionToken)` etc.; empty
  input produces a root holding only `version`, which is the correct
  fresh-install shape. No call-site changes required.
