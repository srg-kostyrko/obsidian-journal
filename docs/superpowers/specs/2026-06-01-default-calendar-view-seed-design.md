# Default "Calendar" view — new-install seed

## Summary

On a fresh plugin install (no stored plugin data yet), seed a single view named
**"Calendar"** that reproduces the v2 calendar view: a toolbar (shelf selector ·
date picker · today · the four chevrons flanking the month/quarter/year period
badges), a month grid, a divider, and per-custom-journal interval rows. The
seeded view appears in the views dashboard, registers an "Open Calendar"
command, and shows a ribbon icon. Opening it renders the v2-equivalent layout
from the already-built view blocks.

This is the **new-install seed** path only. It is one of three pieces the
broader views design (`2026-05-28-v3-journal-views-design.md`) groups under the
default Calendar view; the **v2→v3 migration** (for upgraders) and the legacy
`CALENDAR_VIEW_TYPE` **adapter** (redirecting old workspace leaves) are out of
scope here and deferred to a future task.

## Background

The v3 views feature already ships every building block this seed composes:

- Blocks: `toolbar`, `month-calendar`, `week-calendar`, `custom-intervals`,
  `divider`.
- Toolbar items: `shelf-selector`, `period-buttons`, and `button` with the full
  action union (`pick-date` / `current` / `navigate-step`).
- `ViewsRepository` over the `views` settings collection, `ViewHostService`
  (eager) that registers each view's command + ribbon at boot, and the view leaf
  that renders blocks reactively.

What is missing is any code that _creates_ the default view. Nothing references
a default view id today. This spec adds the seed and the minimal settings-infra
hook it needs.

## Behavior

### Fresh install

"Fresh install" means the `views` collection key is **absent** from stored
plugin data. `SettingsService.initialize()` already treats absent storage as a
clean record at the current version (`{ version: CURRENT_VERSION }`), so for a
new install the `views` key is simply missing when the collections hydrate.

When the `views` key is absent, hydrate the collection with the seeded Calendar
view. The seed runs inside `initialize()`, before `autoLoad()`, so the eager
`ViewHostService` sees the seeded view at boot and registers its command and
ribbon entry.

### Respecting deletion

If the `views` key is **present but empty** (`{}`) — the state after a user
deletes all their views — nothing is seeded. Only an _absent_ key triggers
seeding. This distinguishes "never installed" from "emptied on purpose".

### Idempotency

A fresh-install user who never changes a setting never persists the `views`
key, so the seed re-fires identically on each boot until the first settings
write. This is harmless: the view, its blocks, and all instance ids are fixed
literals, so re-seeding reproduces byte-identical state. The first persisted
settings change — including deleting the seeded view, which writes
`views: {}` — stops re-seeding.

Leaf navigation state (current date, selected shelf) persists to
`workspace.json`, not plugin settings, so navigating the seeded view does not by
itself persist the `views` key.

## Design

### Generic collection-seed mechanism (settings infrastructure)

`defineCollection` gains an optional fourth argument:

```ts
defineCollection(key, itemSchema, defaultItem, { seed });
```

- `CollectionDefinition` carries `readonly seed?: () => Record<string, Item>`.
- Existing callers are unaffected — the argument is optional.

`parseCollectionValue(definition, raw, logger)` changes:

- When `raw === undefined` **and** `definition.seed` is defined: run the seed,
  validate each entry through `safeParse(itemSchema, …)`, include valid entries,
  and log + omit any entry that fails validation.
- When `raw === null` or any present value: existing behavior (no seed). Only an
  absent key (`undefined`) triggers seeding.

The validate-and-omit path is defensive only; a unit test guarantees the real
seed is schema-valid, so the omit branch never fires in practice. Invalid seed
entries are dropped (not replaced with `defaultItem(id)`, which would yield a
blank entry named after a UUID).

This is the only settings-infra change. `SettingsService.#hydrate` already calls
`parseCollectionValue` per collection; no service-level change beyond what the
helper does.

### The seed (views feature)

New file `src/views/default-view.ts`:

- `DEFAULT_CALENDAR_VIEW_ID` plus fixed UUID literals for every block-instance id
  and toolbar-item id. Fixed literals make re-seeding stable and tests
  deterministic. All ids are valid UUIDs (the view, block, and toolbar-item
  schemas require `v.uuid()`).
- `defaultCalendarView(): View` returns the composition below.
- Imports `View` / id-brand types from `./config` **type-only**, so the
  `config.ts` → `default-view.ts` value import forms no runtime cycle.

Seeded composition (reproduces v2 exactly):

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| `name`         | `m.view_default_calendar_name()` ("Calendar") |
| `icon`         | `calendar-days`                               |
| `defaultShelf` | `null`                                        |
| `showInRibbon` | `true`                                        |

Blocks, in order:

1. `toolbar`, items in order:
   - `shelf-selector`
   - `button` — `{ action: { type: "pick-date", mode: "navigate", levels: ["day"] } }`
   - `button` — `{ action: { type: "current", mode: "create", levels: ["day"] } }`
   - `button` — `{ action: { type: "navigate-step", direction: "prev", unit: "year", amount: 1 } }`
   - `button` — `{ action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } }`
   - `period-buttons` — `{ week: false, month: true, quarter: true, year: true }`
   - `button` — `{ action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } }`
   - `button` — `{ action: { type: "navigate-step", direction: "next", unit: "year", amount: 1 } }`
2. `month-calendar` — `{ before: 0, after: 0, hideWeekends: false }`
3. `divider` — `{}`
4. `custom-intervals` — `{ window: "current-month", hideEmpty: true }` (`journals`
   omitted ⇒ all custom journals in the active shelf)

The button-mode defaults (`pick-date` → `navigate`, `current` → `create`) are
v2's new-install defaults. `hideWeekends`, `before`/`after`, the `navigate-step`
amounts, and `period-buttons.week` have no v2 equivalent and use the
conservative defaults that keep the seeded view visually identical to v2.

### Wiring

`config.ts` passes the seed to the collection:

```ts
export const viewsCollection = defineCollection(
  "views",
  viewSchema,
  (id) => ({
    /* existing default item */
  }),
  { seed: () => ({ [DEFAULT_CALENDAR_VIEW_ID]: defaultCalendarView() }) },
);
```

### i18n

Add one message, `view_default_calendar_name` → "Calendar". The seeded `name` is
localized at seed time and becomes user-editable data thereafter (switching
Obsidian's language later does not rewrite stored data — expected for seeded
values).

### Out of scope

- The `defaultCalendarViewId` settings slice — no consumer under new-install-only
  scope. The future migration/adapter task adds it (or imports the exported
  constant directly).
- The v2→v3 migration and the legacy `CALENDAR_VIEW_TYPE` adapter.

## Testing

`src/views/default-view.test.ts`:

- `defaultCalendarView()` produces a schema-valid view (parses against
  `viewSchema`).
- Blocks are ordered month grid → intervals: `[toolbar, month-calendar, divider,
custom-intervals]`.
- The toolbar mirrors the v2 header: the 8 items in the specified order and kind.
- The pick-date button seeds `mode: "navigate"` (v2 new-install default).
- The current button seeds `mode: "create"` (v2 new-install default).
- `period-buttons` seeds `{ week: false, month: true, quarter: true, year: true }`.

One behavior per test; assert on the returned object (black-box).

`src/settings/settings-service.test.ts`, using a throwaway test collection that
defines a `seed`:

- Seeds the collection when its key is absent from stored data.
- Does not seed when the key is present but empty.
- A collection with no `seed` stays empty when its key is absent.

No tests for: barrel shapes, DI wiring, that the real seed's per-item validity is
re-checked in the infra test (the `default-view` schema test covers it), or
framework reactivity.

## Files

- `src/settings/schema.ts` — `CollectionDefinition.seed?`; `defineCollection`
  optional `options`.
- `src/settings/settings-service.ts` — `parseCollectionValue` seeds on absent
  key.
- `src/views/default-view.ts` — new; `DEFAULT_CALENDAR_VIEW_ID`, fixed instance
  ids, `defaultCalendarView()`.
- `src/views/config.ts` — wire `seed` into `viewsCollection`.
- `messages/en.json` (or the project's message source) — `view_default_calendar_name`.
- `src/views/default-view.test.ts`, `src/settings/settings-service.test.ts` —
  tests.
