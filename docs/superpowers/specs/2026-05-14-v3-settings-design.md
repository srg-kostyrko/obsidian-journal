# v3 Settings — Design

**Stage:** Settings data-layer foundation for the v3 plugin rewrite — a typed,
DI-composed, valibot-validated replacement for v2's monolithic `PluginSettings`.
**Date:** 2026-05-14
**Status:** Draft for review

## Purpose

v2 stored every piece of plugin configuration in a single 334-line
`PluginSettings` interface (`src/_old-code/types/settings.types.ts`) with one
matching `defaultPluginSettings` literal and a hand-written
`migrateV1toV2` / `migrateV2toV3` pipeline operating on the whole blob. Adding
a feature meant editing the central type, the central defaults, and reasoning
about a god-object that spans calendar config, dynamic journal entries,
plugin commands, decorations, and UI state at once.

v3 replaces that with a settings layer composed from independent slices:

- Each feature module owns its own valibot schema + defaults and contributes
  them through a DI multi-token at compose time. The settings module never
  hard-codes the list of slices and exposes no imperative
  `defineSlice(...)` method on the service.
- A single `SettingsService` collects all slice and migration contributions
  at construction, runs the migration pipeline on the raw root, validates
  each slice independently, and exposes typed reactive handles.
- Validation failures fall back to that slice's defaults and surface a
  user-visible notice; load and migration failures are boot-fatal.

The settings module lives at `src/settings/` (peer of `calendar/`, not under
`infrastructure/` — it depends on `host/PluginData` and Vue reactivity).

## Non-goals

- **Settings tab UI.** This spec is the data layer only. How modules
  contribute UI sections to the Obsidian settings tab is a separate spec
  (likely another multi-token like `SettingsPanelToken`).
- **Feature slices themselves.** Calendar, journals, shelves, plugin
  commands, decorations, cross-cutting UI flags (`showReloadHint`,
  `dismissedNotifications`, etc.) each belong to their owning v3 module and
  ship alongside that module's port.
- **Runtime add/remove of slices.** Slices are contributed at compose time
  through DI. Adding a slice means adding a module binding; there is no
  registration API at runtime.
- **Third-party extensibility.** The multi-token surface is internal. We do
  not expose a public API for external Obsidian plugins or user scripts to
  register slices.

## Architecture

### Module layout

```
src/settings/
  index.ts                 public barrel
  module.ts                settingsModule: Module (zero-arg per feedback_di_module_factories)
  schema.ts                defineSlice, defineCollection, Migration types
  tokens.ts                SliceDefinitionToken, CollectionDefinitionToken, MigrationToken
  version.ts               CURRENT_VERSION constant
  settings-service.ts      SettingsService (eager, public)
  settings-service.test.ts
  collection.ts            internal: keyed reactive collection handle
  collection.test.ts
  migrations.ts            internal: pipeline runner
  migrations.test.ts
  notices.ts               SettingsNotice type + emitter
  errors.ts                error classes (one place per feedback_errors_in_errors_ts)
  testing.ts               sibling test-helper barrel (FakePluginData, createSettingsService)
  testing/                 (if helpers grow beyond a single file)
```

### Responsibilities

- **`schema.ts`** — pure value builders. `defineSlice(key, schema, defaults)`
  and `defineCollection(key, itemSchema, defaultItemFactory)` return tagged
  data objects. They have no SettingsService dependency and are safe to
  evaluate at module-import time. The returned object is both the DI value
  bound to its multi-token and the typed lookup key passed to
  `service.getSlice(...)`.
- **`tokens.ts`** — three multi-tokens.
- **`settings-service.ts`** — `SettingsService` resolves all three
  multi-tokens at construction, holds a single root `reactive({})` that
  contains every slice value and every collection's keyed record,
  installs one deep `watch` on that root, and schedules a debounced
  flush through `PluginData.save()` (300 ms). Exposes
  `getSlice(definition)` / `getCollection(definition)` and a readonly
  `notices` reactive array.
- **`collection.ts`** — `CollectionHandle<T>` implementation that wraps
  a reactive `Record<string, T>` provided by the service (the same
  object stored under `root[key]`, so its mutations fire the root
  watch). The wire format on disk is already `Record<string, T>`, so no
  serialize step is required — flush stringifies the root directly.
- **`migrations.ts`** — sorts contributed migrations by `fromVersion`,
  runs them in order against the raw root until the version reaches
  `CURRENT_VERSION`.
- **`notices.ts`** — small value type + a reactive `SettingsNotice[]` that
  the (future) settings UI can subscribe to.
- **`errors.ts`** — all `Error` subclasses (see _Errors_ below).
- **`module.ts`** — exports `settingsModule: Module` that registers
  `SettingsService` eager via `autoLoad`.

### How a feature module contributes

A feature module (calendar in the example) binds its slice and any
migrations through the multi-tokens. No method calls on `SettingsService`.

```ts
// src/calendar/settings.ts
import * as v from "valibot";
import { defineSlice } from "@/settings";

const calendarSchema = v.object({
  dow: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
  doy: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)),
  global: v.boolean(),
});

export const calendarSlice = defineSlice("calendar", calendarSchema, {
  dow: 1,
  doy: 4,
  global: true,
});

// src/calendar/migrations.ts
import type { Migration } from "@/settings";
export const calendarV2toV3Migration: Migration = {
  fromVersion: 2,
  toVersion: 3,
  migrate(raw) {
    /* reshape raw.calendar in place */
    return raw;
  },
};

// src/calendar/module.ts
import { SliceDefinitionToken, MigrationToken } from "@/settings";

export const calendarModule: Module = {
  register(c) {
    c.register(CalendarService).useClass(CalendarService);
    c.register(SliceDefinitionToken).useValue(calendarSlice);
    c.register(MigrationToken).useValue(calendarV2toV3Migration);
  },
};
```

A consumer pulls the typed handle by passing the slice definition back in:

```ts
const { state } = inject(SettingsService).getSlice(calendarSlice);
state.dow = 0; // typed as number, triggers debounced save
```

## Public API

```ts
// schema.ts
export function defineSlice<TKey extends string, TSchema extends v.BaseSchema>(
  key: TKey,
  schema: TSchema,
  defaults: v.InferOutput<TSchema>,
): SliceDefinition<TKey, TSchema>;

export function defineCollection<TKey extends string, TItem extends v.BaseSchema>(
  key: TKey,
  itemSchema: TItem,
  defaultItem: (id: string) => v.InferOutput<TItem>,
): CollectionDefinition<TKey, TItem>;

export interface Migration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(raw: Record<string, unknown>): Record<string, unknown>;
}

// settings-service.ts
export class SettingsService {
  initialize(): AsyncResult<void, SettingsLoadError | MigrationFailedError | SliceKeyConflictError>;

  getSlice<TKey extends string, TSchema extends v.BaseSchema>(
    slice: SliceDefinition<TKey, TSchema>,
  ): SliceHandle<v.InferOutput<TSchema>>;

  getCollection<TKey extends string, TItem extends v.BaseSchema>(
    collection: CollectionDefinition<TKey, TItem>,
  ): CollectionHandle<v.InferOutput<TItem>>;

  readonly notices: Readonly<Ref<readonly SettingsNotice[]>>;
}

export interface SliceHandle<T> {
  readonly state: T; // Vue reactive — read/write directly
}

export interface CollectionHandle<T> {
  readonly entries: Readonly<Record<string, T>>; // reactive
  add(id: string, init?: Partial<T>): T;
  remove(id: string): void;
  get(id: string): T | undefined;
}

export interface SettingsNotice {
  readonly kind: "slice-reset" | "save-failed";
  readonly sliceKey: string;
  readonly detail: string;
}
```

API decisions confirmed during brainstorming:

- **Mutation surface.** Direct mutation on `state.x = y`. Vue templates and
  field forms bind naturally; modules that want a guarded API wrap the
  handle themselves.
- **Save trigger.** Debounced auto-save on any reactive mutation (300 ms
  trailing). Matches v2's save-on-mutate behavior.
- **Defaults shape.** Slices take an inline `defaults` value. Collections
  take a `defaultItem` factory because each new entry is a fresh value.

## Bootstrap lifecycle

`settingsModule` registers `SettingsService` as eager. Boot runs from
`container.autoLoad()` in `main.ts`.

1. **Collect contributions.** At construction the service calls
   `inject(SliceDefinitionToken)`, `inject(CollectionDefinitionToken)`,
   `inject(MigrationToken)`. DI throws on empty multi-tokens
   (`container.test.ts:129`). `settingsModule` therefore registers a
   built-in **core slice** (`defineSlice("core", v.object({}), {})`) so
   `SliceDefinitionToken` always has at least one binding; the core slice
   is otherwise empty and exists only to satisfy DI. The migration
   multi-token is treated the same way via a single no-op identity
   migration registered by `settingsModule`. `CollectionDefinitionToken`
   follows the same pattern with a sentinel empty collection. Test helpers
   that construct a `SettingsService` directly never need this — they go
   through `createSettingsService(...)` from `testing.ts`, which always
   provides at least the core slice.
2. **Validate uniqueness.** Duplicate slice or collection keys →
   `SliceKeyConflictError`. Boot-fatal, programmer error.
3. **Load raw.** `PluginData.load()` returns `unknown`. `null`/`undefined`
   is treated as `{ version: 0 }` (fresh install — migrations will run from
   the lowest known version up to `CURRENT_VERSION`).
4. **Run migrations.** Migrations are sorted by `fromVersion`. Starting at
   `raw.version ?? 0`, the runner finds a migration whose `fromVersion`
   matches the current version, applies it, advances. The loop ends when
   the version reaches `CURRENT_VERSION`. No matching migration before
   reaching the target → `MigrationFailedError`. A migration that throws →
   wrapped in `MigrationFailedError`.
5. **Per-slice validate.** For each slice/collection definition, the
   service calls `v.safeParse(schema, migrated[key])`.
   - Success: place the parsed value at `root[key]`.
   - Failure: place `defaults` (or an empty object for collections) at
     `root[key]` and push a `slice-reset` `SettingsNotice` onto `notices`.
6. **Wire up save.** Install a single deep Vue `watch` on the root. On
   any change, schedule a 300 ms debounced flush. Save serializes the
   whole root: `{ version: CURRENT_VERSION, [sliceKey]: state, ... }`
   through `PluginData.save()`. A save IO failure pushes a `save-failed`
   notice and leaves the in-memory state intact; the next mutation
   re-arms the flush.

`CURRENT_VERSION` lives in `settings/version.ts` as a single exported
constant. Bumping it is a deliberate act paired with adding a `Migration`
to one of the contributing modules.

### Migration ownership

- **Single-slice migration** lives in the owning module's `migrations.ts`
  and is bound to `MigrationToken` in that module.
- **Cross-slice migration** (e.g. moving `ui.calendarShelf` from the
  journals slice to the ui slice on a v2→v3 step) is just another
  `MigrationToken` binding — it receives the _raw_ root object
  pre-validation and can move keys between any slices freely. Ownership
  lives wherever it makes sense, typically the destination module.

### Boot failure handling

`SettingsService.initialize()` returns
`AsyncResult<void, SettingsLoadError | MigrationFailedError | SliceKeyConflictError>`.
`autoLoad` propagates the failure; `JournalPlugin.onload` catches and
shows a single fatal `Notice`. We do not try to partially load — if the
root cannot be migrated, refusing to start beats silently corrupting
user data.

The slice-level fallback (Q4 → B in brainstorming) only kicks in for
**validation** failures (step 5), not for load/migration failures.
Consumers detect that a slice fell back by filtering `notices` for
`{ kind: "slice-reset", sliceKey: <key> }`; there is no per-slice
`status` flag — the notice array is the single source of truth.

## Data flow

```
PluginData.load()  ─►  raw: unknown
                       │
                       ▼  migrations.run(raw, CURRENT_VERSION)
                       migrated: { version, [key]: unknown }
                       │
                       ▼  per slice: v.safeParse(schema, migrated[key])
                       parsed ──► root[key] (single reactive root)
                       │
                       │  one Vue deep watch on root
                       ▼
                       debounced 300ms
                       │
                       ▼  serialize { version, ...slices }
                       PluginData.save()
```

A `CollectionHandle` wraps a reactive `Record<string, T>` whose values
pass through the same per-item validation; the wire format is
`{ [id]: item, ... }`, matching v2's
`journals: Record<string, JournalSettings>` shape on disk.

## Errors

All in `src/settings/errors.ts` per `feedback_errors_in_errors_ts.md`.

- `SettingsLoadError` — wraps `PluginDataIOError` from host. Boot-fatal.
- `SliceKeyConflictError` — two modules contributed the same slice or
  collection key. Boot-fatal, programmer error.
- `MigrationFailedError` — a migration threw, or the version never reached
  `CURRENT_VERSION`. Carries the version it got stuck at.
- `SliceValidationError` — internal; not re-thrown. Recorded as a
  `SettingsNotice` and reflected in `status: "reset"`. Carries the slice
  key and the valibot issue list for diagnostics.
- `SettingsSaveError` — wraps save IO failure. Surfaces as a notice but
  doesn't break the in-memory state; the next mutation re-arms the flush.
- `UnregisteredSliceError` — `getSlice` / `getCollection` called with a
  definition whose key was never bound to the relevant multi-token.
  Programmer error, thrown synchronously.

## Testing

Per `feedback_test_hygiene.md` and `feedback_testing_dir_layout.md`:

- `settings-service.test.ts`
  - load → migrate → validate happy path returns typed slice handles
  - missing version treated as 0 and migrated up
  - corrupted slice falls back to defaults and emits a `slice-reset` notice
  - duplicate slice key fails boot with `SliceKeyConflictError`
  - save debounce coalesces multiple mutations into one `PluginData.save` call
  - save IO failure emits a `save-failed` notice; next mutation re-attempts save
- `collection.test.ts`
  - add/remove/get with reactive iteration
  - default factory called per item
  - per-item validation falls back the same way as a slice
- `migrations.test.ts`
  - migrations ordered by `fromVersion` regardless of binding order
  - unreachable target → `MigrationFailedError` with the stuck version
  - cross-slice migration moves a key successfully
- `testing.ts`
  - exports `FakePluginData` (in-memory `load`/`save` over a mutable `unknown`)
  - exports `createSettingsService({ slices, collections, migrations, raw })`
    that constructs a real `SettingsService` against a `FakePluginData`,
    used by feature-module tests that want to exercise `getSlice(...)`
    end-to-end without mocking the service itself
- Tests deliberately not written (per memory):
  - `defineSlice` / `defineCollection` — trivial value constructors (`feedback_no_trivial_tests.md`)
  - multi-token wiring (`feedback_no_wiring_tests.md`)
  - the barrel shape (`feedback_no_wiring_tests.md`)
  - the fakes themselves (`feedback_no_mock_fake_tests.md`)

Per-task quality gates: `npm run test`, `npm run check:types`,
`npm run check:lint` (per `feedback_test_commands.md`).
