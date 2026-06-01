# Open on startup — design

Date: 2026-06-01
Branch: `v3-ai`
Closes gap #4 in `docs/2026-06-01-v2-v3-feature-gaps.md`.

## Problem

v2 let users pick a journal whose note is opened automatically when the vault
opens (`PluginSettings.openOnStartup` + `openStartupNote()`, fired from the
`onLayoutReady` hook and kept in sync on journal rename/remove,
`src/_old-code/main.ts:425-433`). v3 dropped the setting and the startup-open
logic entirely. This restores it.

Data migration of the old `openOnStartup` value is **out of scope** (tracked
separately, as for all gaps).

## Approach

Reuse the existing `OpenJournalEntryFlow` (`src/journals/flows/open-journal-entry.flow.ts`)
— the v3 equivalent of v2's `openDateInJournal`; it ensures (creates if missing)
and opens a journal's note for an anchor. The new work is a settings slice, a
small startup service, a dashboard block, and a thin host capability for
layout-ready.

These live in a cohesive **`src/journals/startup/` sub-feature** with its own
`module.ts`, mirroring `journals/notes` and `journals/settings`, and the way
`calendar/settings` colocates `slice` + `bridge` + dashboard block. The
rejected alternative — folding the service into `journals/notes` and the
slice/block into `journals/settings` — scatters one concern across two modules
and couples the shelves-owned `JournalsDashboardBlock`.

## Components

### 1. `startupSlice` — `src/journals/startup/slice.ts`

Global slice, key `"startup"`:

```ts
export const startupSliceSchema = v.object({ journalName: v.string() });
export const startupSlice = defineSlice("startup", startupSliceSchema, { journalName: "" });
```

Empty `journalName` is the "don't open" sentinel (v2 parity). Registered via
`SliceDefinitionToken`.

### 2. `WorkspaceService` host extension — `src/infrastructure/host/internal/workspace-service.ts`

Two additions wrapping Obsidian's workspace API:

- `get layoutReady(): boolean` → `this.#app.workspace.layoutReady`
- `onLayoutReady(callback: () => void): void` → `this.#app.workspace.onLayoutReady(callback)`

Obsidian's `onLayoutReady` invokes the callback immediately if the layout is
already ready; combined with reading `layoutReady` _before_ registering, this is
what implements the startup gate.

### 3. `StartupOpenService` — `src/journals/startup/startup-open.ts`

Injects `WorkspaceService`, `OpenJournalEntryFlow`, `SettingsService` (for the
slice), `JournalsEventsToken`, and a named logger.

- **Constructor** subscribes to journal events (mirrors `ShelvesService`):
  - `"renamed"`: if `slice.state.journalName === oldName`, set it to `newName`.
  - `"deleted"`: if it matches the removed journal, reset to `""`.
- **`initialize(): AsyncResult<void, never>`**: captures
  `appStartup = !workspace.layoutReady`, then registers
  `workspace.onLayoutReady(callback)`. The callback opens only when **all** hold:
  `appStartup` was true, `journalName` is non-empty, and the journal still
  exists — running
  `OpenJournalEntryFlow.execute({ journalName, anchor: CalendarDate.today().toAnchor(), openMode: "active" })`
  and logging (never throwing) on error, like `AutoCreateService`.

The `appStartup` gate reproduces v2: when the plugin is enabled/reloaded
mid-session the layout is already ready, so the note is **not** opened and focus
is not stolen. Only a genuine vault launch (layout not yet ready at load) opens
the note.

### 4. `StartupBlock.vue` — `src/journals/startup/ui/StartupBlock.vue`

A `UiCollapsibleBlock` dashboard block. Inside, a `UiSettingRow` + `UiDropdown`
bound to `slice.state.journalName`: a "Don't open" option (`value=""`) plus one
`<option>` per journal from `JournalsRepository.find().options()`. Reads/writes
the slice via `useService(SettingsService).getSlice(startupSlice)`.

### 5. `startupModule` — `src/journals/startup/module.ts`

Registers `SliceDefinitionToken` (startupSlice), `DashboardBlockToken`
(`StartupBlock`, order ~8 — after `views` at 7, before `calendar-week` at 10),
and `StartupOpenService`. `main.ts` adds the module and calls
`container.resolve(StartupOpenService).initialize()` immediately after the
existing `AutoCreateService` initialization (`src/main.ts:61`).

## Data flow

```
plugin load
  └─ StartupOpenService.initialize()
       ├─ appStartup = !workspace.layoutReady   (captured now)
       └─ workspace.onLayoutReady(cb)
            └─ cb: if appStartup && journalName && journal exists
                     └─ OpenJournalEntryFlow.execute({ journalName, anchor: today, openMode: "active" })

dashboard block  ⇄  startupSlice            (user picks journal / "Don't open")
journal "renamed"/"deleted"  →  reconcile stored journalName
```

## Error handling

`OpenJournalEntryFlow` returns `NoteCreationError | WorkspaceOpenError`. The
service logs and swallows — startup must never throw. A stale or missing journal
name is a silent no-op.

## Testing

Colocated `*.test.ts`, black-box assertions, one behavior per test.

- `startup-open.test.ts`:
  - opens the configured journal's today note when layout was **not** ready at init;
  - does **not** open when layout **was** ready at init (v2 gate);
  - no-op when `journalName` is empty;
  - no-op when the named journal no longer exists;
  - `"renamed"` updates the stored name;
  - `"deleted"` of the configured journal clears the name.
  - Uses a fake/controllable `WorkspaceService` (settable `layoutReady`, captured
    `onLayoutReady` callback) and a spy on `OpenJournalEntryFlow`.
- `StartupBlock.test.ts` (@testing-library/vue + user-event):
  - renders "Don't open" plus one option per journal;
  - selecting an option writes the slice.

Skipped per repo conventions: the `WorkspaceService` layout-ready wrapper (thin
host wiring), `startupSlice` defaults (config), and any data migration
(out of scope).

## Quality gates

`npm run test`, `npm run check:types`, `npm run check:lint` before completion.
