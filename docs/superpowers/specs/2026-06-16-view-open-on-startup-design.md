# View "open on startup" toggle

## Problem

v2 auto-revealed the calendar view on boot. v3 has no auto-open for journal views at
all — every view is reachable only via its per-view command (`journal:open-view:{id}`)
or an optional ribbon icon. We want to restore opt-in auto-open as a **per-view toggle**,
defaulting **on** for the seeded default calendar view so fresh installs behave like v2.

## Scope

- A new `openOnStartup` boolean on each view.
- At app startup, open every view whose toggle is on.
- Flipping the toggle **on** in settings opens the view immediately (consistent with the
  recent "create today's note when auto-create is switched on" behaviour).
- Make view-opening idempotent so startup does not duplicate a leaf Obsidian already
  restored from its saved workspace.

Out of scope: retrofitting existing v3 vaults (see Back-compat), a global/all-views
startup setting, changing ribbon or command behaviour beyond the shared open path.

## Data model

`viewSchema` (`src/views/config.ts`) gains:

```ts
openOnStartup: v.optional(v.boolean(), false);
```

Using `v.optional(..., false)` mirrors the existing `leaf` field and means views persisted
before this change parse without a data migration.

- `viewsCollection` factory default → `openOnStartup: false`.
- `defaultCalendarView()` (`src/views/default-view.ts`) → `openOnStartup: true`.
- `ViewsService.update`'s patch type (`src/views/service.ts`) adds `openOnStartup` to its
  `Partial<Pick<View, ...>>`.

### Back-compat decision

Existing v3 vaults already have a stored default-calendar view; it will parse as
`openOnStartup: false`. We deliberately do **not** migrate it to `true`. v3 has never
auto-opened a view, so this preserves current behaviour for upgrading users; only fresh
installs (which run the collection `seed`) get auto-open out of the box. v2's auto-open is
not a parity obligation here — the v2→v3 migration is separate and non-interactive.

## Opening logic — `ViewHostService` (`src/views/view-host.ts`)

### Public, idempotent `open(id)`

Promote the private `#open(id)` to a public `open(id: ViewId): Promise<void>` and make it
dedupe:

- If a leaf of `viewTypeOf(id)` already exists (`app.workspace.getLeavesOfType(...)`),
  reveal that leaf instead of creating a new one.
- Otherwise create a leaf for the view's `leaf` placement (current behaviour) and reveal it.

This is required for correct startup behaviour: Obsidian restores sidebar and tab leaves
from its saved workspace, so a non-deduping open would create a second leaf for an
already-present view (and tab-placement views would stack a fresh tab on every launch).
The existing command's `execute` is repointed at the public `open`, gaining the same
idempotence as a bonus.

### `initialize()` — startup auto-open

Add `initialize()` to `ViewHostService`, mirroring `StartupOpenService`:

- Snapshot `workspace.layoutReady` to detect an app-startup vs. a later layout change.
- Register an `onLayoutReady` callback; when it fires for an app-startup, iterate the views
  in registration order and call `open(id)` for each with `openOnStartup === true`.
- Errors from an individual `open` are logged (via the existing `#logger`) and do not abort
  the remaining views.

Wire `container.resolve(ViewHostService).initialize()` in `src/main.ts` alongside the other
`.initialize()` calls (next to `StartupOpenService`). `ViewHostService` is exported from the
views barrel for that import.

This lives inside `ViewHostService` rather than a separate `ViewStartupOpenService`:
`ViewHostService` already owns view-leaf lifecycle and holds the workspace handle, so a
separate service would be a thin indirection that calls straight back into `open()`.

## Toggle-on-open — settings UI (`src/views/ui/ViewEditSubpage.vue`)

Add a toggle row, placed near the existing "Show in ribbon" / "Open in" rows:

```vue
<UiSettingRow :name="m.view_edit_open_on_startup_label()">
  <UiToggle v-model="openOnStartupValue" />
</UiSettingRow>
```

`openOnStartupValue` is a `computed` get/set in the existing style of this file:

- `get` → `view.value?.openOnStartup ?? false`
- `set(next)` → `viewsService.update(viewId, { openOnStartup: next })`, **and** when
  `next === true`, call `viewHost.open(viewId)` so the view appears immediately.

The component resolves `ViewHostService` via `useService` (same DI access pattern the file
already uses for `ViewsService`/`Flows`). Toggling **off** only persists; it does not close
any open leaf.

New i18n message in `messages/en.json`: `view_edit_open_on_startup_label` →
`"Open on startup"`.

## Testing

Quality gates: `npm run test`, `npm run check:types`, `npm run check:lint`. This change is
runtime-touching (startup behaviour), so it also warrants a wdio e2e (see below).

### Unit

- **`config.test.ts` / `default-view.test.ts`**
  - `viewsCollection` factory default has `openOnStartup: false`.
  - `defaultCalendarView()` has `openOnStartup: true`.
  - `viewSchema` parses a stored view object that omits `openOnStartup` (back-compat),
    yielding `false`.
- **`view-host.test.ts`**
  - `open` reveals an existing leaf of the view's type instead of creating a second one.
  - `open` creates and reveals a leaf when none exists.
  - `initialize` opens views with `openOnStartup: true` once layout is ready at app startup.
  - `initialize` does not open a view with `openOnStartup: false`.
  - `initialize` does not open views when layout was already ready before it ran (i.e. not an
    app-startup).
- **`ViewEditSubpage` (testing-library + user-event)**
  - Toggling the row on calls `viewHost.open` for the view.
  - Toggling the row off does not call `viewHost.open`.

Follow existing test conventions: one behaviour per test, subject+verb descriptions, nested
`describe`s for scope, black-box assertions, no wiring/trivial tests.

### e2e (wdio)

A startup auto-open e2e: a fixture vault (`e2e-*` prefix) with a view configured
`openOnStartup: true`; on plugin load, assert the view leaf is present/revealed. Keep it to
the observable outcome (leaf of the view type exists and is revealed), not internals.

## Files touched

- `src/views/config.ts` — schema field + factory default
- `src/views/default-view.ts` — `openOnStartup: true`
- `src/views/service.ts` — `update` patch type
- `src/views/view-host.ts` — public idempotent `open`, `initialize`
- `src/main.ts` — wire `ViewHostService.initialize()`
- `src/views/index.ts` — export `ViewHostService` if not already
- `src/views/ui/ViewEditSubpage.vue` — toggle row + computed
- `messages/en.json` — `view_edit_open_on_startup_label`
- Colocated `*.test.ts` updates + a new wdio e2e spec
