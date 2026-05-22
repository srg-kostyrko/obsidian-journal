# v3 Shelf Settings UI — Design

## Goal

Port v2's shelf-management settings UI to v3. The v3 shelves spec shipped the
data layer — `shelvesCollection` and `ShelvesLifecycleService` (create / rename
/ delete / assign, plus journal rename/delete reconciliation) — and explicitly
deferred the settings UI to a later spec. This is that spec.

## Scope

In scope:

- A "Journal shelves" dashboard block: list / create / delete shelves.
- A shelf-detail subpage: rename a shelf and manage its member journals.
- A journal-editor "Shelf" section that places a journal on a shelf.
- The journal-list dashboard block, moved into the `shelves` module so it can
  show only journals not on a shelf.
- Modals and flows for the create / rename / delete / place operations.

Out of scope:

- Any change to the shelves backend (`config.ts`, `lifecycle.ts`). The UI only
  calls existing `ShelvesLifecycleService` methods and reads the collections.
- Shelf-scoped commands and the calendar shelf filter — dropped / deferred by
  the shelves spec. v2's shelf-detail "Commands" tab is therefore not ported.
- The `useShelves` global toggle — dropped in v3; an empty `shelvesCollection`
  is the "shelves off" state.

## Background: v2 shelf UI

v2 gated the whole feature on a `useShelves` boolean and rendered one of two
journal-settings views:

- `JournalSettingsWithoutShelves` — a single flat "Journals" list.
- `JournalSettingsWithShelves` — a "Journal shelves" list plus a "Journals not
  on shelf" list. Each shelf row opened `JournalSettingsShelfDetails`, a page
  with the shelf's journals and (now dropped) its commands.

Assignment happened two ways: the shelf-detail page created journals directly
onto the shelf, and each journal's editor had a "Place journal" button opening
`JournalShelf.modal` — a shelf dropdown.

v3 has no `useShelves` toggle, so the two views collapse into one always-on
layout, and the journal list becomes shelf-aware.

## Architecture: who owns what

`journals` must not depend on `shelves`. The journal list now needs to know
which journals sit on a shelf, so the journal-list dashboard block moves into
the `shelves` module. `shelves` may depend on `journals`; the reverse edge
stays absent.

After this spec:

- `journals` keeps the journal collection, lifecycle, flows, and the
  `JournalEditSubpage`. It no longer registers a dashboard block.
- `shelves` owns both dashboard blocks (shelves + journals), the shelf-detail
  subpage, the journal-editor shelf section, and all shelf modals/flows.

The current `JournalsDashboardBlock.vue` and its test (in
`src/journals/settings/ui/`) are deleted; `journalsSettingsModule` stops
registering `DashboardBlockToken`.

All new UI lives in `src/shelves/ui/`.

## Component 1 — `ShelvesDashboardBlock.vue`

A dashboard block registered through `DashboardBlockToken` at `order: 4` (just
before the journals block). Mirrors `CommandsDashboardBlock`: a
`UiCollapsibleBlock` with an entry-count flair and a `+` `UiIconButton` in
`#controls`.

- One `UiSettingRow` per shelf, sorted by name: the shelf name, a member-count
  flair, a `library` `UiIconButton` that opens the shelf-detail subpage, and a
  `trash-2` `UiIconButton` that runs `DeleteShelfFlow`.
- An empty-state row when no shelves exist.
- The `+` button runs `EditShelfNameFlow` with no `shelfName` (create).

Shelf membership comes from `shelvesCollection`; the row count is the shelf
entry's `journals.length`.

## Component 2 — `JournalsDashboardBlock.vue`

The replacement journal-list block, in `src/shelves/ui/`, registered through
`DashboardBlockToken` at `order: 5` (the order the old block held). Lists
journals **not on any shelf** — every journal whose name appears in no shelf's
`journals` array. When no shelves exist this is every journal, reproducing v2's
"shelves off" flat list.

- A `UiCollapsibleBlock`; the title is `m.shelf_journals_block_title({ hasShelves })`
  — "Journals" when no shelves exist, "Journals not on a shelf" once they do.
- The `+` button runs `journals`' `AddJournalFlow`.
- The body renders `JournalList` with the filtered entries.

## Component 3 — `JournalList.vue`

A presentational component shared by `JournalsDashboardBlock` and
`ShelfEditSubpage`, following the `CommandList.vue` precedent. It takes the
already-filtered `[string, JournalConfig][]` entries and an `emptyText`, renders
one `UiSettingRow` per journal — the journal name, a `describeWrite` flair, and
`pencil` / `trash-2` `UiIconButton`s — plus an empty-state row. It emits
`edit(name)` and `delete(name)`; it owns no service access and no mutation.

## Component 4 — `ShelfEditSubpage.vue`

The shelf-detail page. `shelf-edit-subpage.ts` exports
`shelfEditSubpage = defineSubpage<{ shelfName: string }>(...)`, registered
through `SubpageToken`. The component receives `shelfName` and `nav`, mirroring
`JournalEditSubpage`.

- A `heading` `UiSettingRow`: "Configuring {name}", with a `pencil`
  `UiIconButton` (runs `EditShelfNameFlow` with the current `shelfName` —
  rename) and a `chevron-left` button (`nav.back()`).
- A `UiCollapsibleBlock` "Journals" with a member-count flair and a `+`
  `UiIconButton` in `#controls`. The body is `JournalList` over the shelf's
  members. The `+` button creates a new journal directly onto this shelf:
  invoke `AddJournalFlow`, then on success `ShelvesLifecycleService.assign(name,
shelfName)` (v2 behavior). `AddJournalFlow` already pushes the journal editor,
  so the user lands on the new journal's editor with the shelf set.
- A `watchEffect` calls `nav.back()` if the shelf entry disappears (e.g. it was
  deleted), matching `JournalEditSubpage`'s guard.

Journal rows `edit` (push `journalEditSubpage`) and `delete` (run
`DeleteJournalFlow`). Removing a journal from a shelf without deleting it is
done from the journal editor's Shelf section, below.

## Component 5 — `JournalShelfSection.vue`

The journal-editor shelf control, contributed through the existing
`JournalEditSectionToken` (the extension point `commands` already uses), at
`order: 5`. Receives a `journalName` prop.

A `UiCollapsibleBlock` "Shelf" containing one `UiSettingRow`: static text of the
journal's current shelf name (or an "Not on a shelf" message) and a `pencil`
`UiIconButton` that runs `PlaceJournalFlow`. This ports v2's "Place journal"
button — the assignment happens through a modal, not an inline dropdown.

The current shelf is the shelf whose `journals` array contains `journalName`,
read from `shelvesCollection`.

## Flows

All in `src/shelves/ui/`, registered as classes in `shelves/module.ts`.
Each follows the `EditCommandFlow` / `DeleteCommandFlow` shape: inject
`ModalService` and the services it needs, run `attempt.in`, map a cancelled
modal to `UserAborted`.

### `EditShelfNameFlow`

Input `{ shelfName?: string }`. One flow for create and rename, mirroring
`EditCommandFlow`.

- `takenNames` is every shelf name except `shelfName`.
- Opens `shelfNameModal` with `{ currentName: shelfName, takenNames }`.
- With no `shelfName`: calls `ShelvesLifecycleService.create(name)`, then pushes
  `shelfEditSubpage` for the new shelf (v2 navigated to the new shelf).
- With a `shelfName`: calls `ShelvesLifecycleService.rename(shelfName, name)`.
- Lifecycle errors map to `FlowError`; a cancelled modal aborts and mutates
  nothing.

### `DeleteShelfFlow`

Input `{ shelfName }`. Opens `deleteShelfModal` with `{ shelfName, otherShelves
}` (the other shelf names), then `ShelvesLifecycleService.delete(shelfName,
destination)` where `destination` is the modal's chosen shelf or `""`.

### `PlaceJournalFlow`

Input `{ journalName }`. Opens `placeJournalModal` with `{ currentShelf,
shelfNames }`, then `ShelvesLifecycleService.assign(journalName, selected)`.
`selected` of `""` unassigns. A cancelled modal mutates nothing.

## Modals

`defineModal` definitions plus `vee-validate` + `valibot` SFCs, following
`AddJournalModal` / `DeleteCommandModal`: every field and the action buttons
wrap in `UiSettingRow`, field errors render in the `#description` slot.

### `shelfNameModal`

`shelf-name-modal.ts` + `ShelfNameModal.vue`. Params `{ currentName?: string;
takenNames: string[] }`, resolves to a shelf name string. One text field, named
"Shelf name", initialised to `currentName ?? ""`:

- required (non-empty);
- unique — not in `takenNames`;
- for rename, must differ from `currentName`.

The modal title comes from whether `currentName` is set ("Add shelf" /
"Rename shelf").

### `deleteShelfModal`

`delete-shelf-modal.ts` + `DeleteShelfModal.vue`. Params `{ shelfName: string;
otherShelves: string[] }`, resolves to the destination shelf name (`""` for
none). A `UiDropdown` "Move journals to" with a "None" option plus
`otherShelves`; when `otherShelves` is empty it shows v2's "Journals will be
moved out" text instead. Cancel / Delete buttons.

### `placeJournalModal`

`place-journal-modal.ts` + `PlaceJournalModal.vue`. Params `{ currentShelf:
string; shelfNames: string[] }`, resolves to the chosen shelf name (`""` =
not on a shelf). A `UiDropdown` "Shelf" with a "Not on a shelf" option plus
`shelfNames`, initialised to `currentShelf`. Cancel / Save buttons.

## Wiring

`shelves/module.ts` additionally registers:

- `DashboardBlockToken` → `ShelvesDashboardBlock` (`order: 4`) and
  `JournalsDashboardBlock` (`order: 5`) via `defineDashboardBlock`;
- `SubpageToken` → `shelfEditSubpage`;
- `JournalEditSectionToken` → `JournalShelfSection` (`order: 5`) via
  `defineJournalEditSection`;
- `EditShelfNameFlow`, `DeleteShelfFlow`, `PlaceJournalFlow` as classes.

`journalsSettingsModule` drops its `DashboardBlockToken` registration and the
`JournalsDashboardBlock` import.

The `@/journals` barrel adds `AddJournalFlow`, `DeleteJournalFlow`, and
`journalEditSubpage` to its public exports so `shelves` can invoke and navigate
them. `journalConfigCollection` and `JournalConfig` are already exported.

The `@/shelves` barrel does not need to export the UI — modules and modals are
imported within the slice.

`main.ts` is unchanged; `shelvesModule` is already added.

## i18n

New `shelf_*` paraglide messages:

- Blocks: shelves-block title, shelf member-count context, empty-state text,
  add/open/delete tooltips; the parameterized journals-block title.
- Shelf-detail subpage: header title, rename/back tooltips, journals section
  title and add tooltip.
- Journal-editor section: "Shelf" title, current-shelf / not-on-a-shelf text,
  the place-journal tooltip.
- Modals: titles, field labels, the delete "move journals" / "moved out" text,
  and validation errors (name required, name not unique, name unchanged).

## Testing

Following project conventions — colocated `*.test.ts`, `@testing-library/vue`
for components, one behavior per test, black-box assertions:

- `ShelfNameModal` — required and uniqueness errors each surface; for rename the
  unchanged name is rejected; a valid submit resolves the name.
- `DeleteShelfModal` — the destination dropdown lists the other shelves;
  the "moved out" text shows when there are none.
- `PlaceJournalModal` — the dropdown lists every shelf plus "Not on a shelf"
  and starts at the current shelf; a submit resolves the selection.
- `EditShelfNameFlow` — create adds the shelf and navigates to it; rename
  renames it; a cancelled modal mutates nothing.
- `DeleteShelfFlow` — confirming deletes the shelf and moves members to the
  chosen destination; cancelling leaves it.
- `PlaceJournalFlow` — assigns the journal to the chosen shelf; cancelling
  leaves membership unchanged.
- `ShelvesDashboardBlock` — lists shelves with member counts; add/delete/open
  controls invoke the right flow or subpage.
- `JournalsDashboardBlock` — lists only journals not on any shelf.
- `ShelfEditSubpage` — shows the shelf's members; the add control creates a
  journal onto the shelf.
- `JournalShelfSection` — shows the journal's current shelf; the control runs
  `PlaceJournalFlow`.

Module wiring and barrel shape are not tested directly. Quality gates:
`test`, `check:types`, `check:lint`.
