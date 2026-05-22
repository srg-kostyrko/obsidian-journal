# v3 Shelves — Design

## Goal

Port v2's shelves feature into v3 as a data layer: a settings collection of
shelves and a lifecycle service for creating, renaming, deleting, and
populating them.

v3 has no shelf concept anywhere. The journal-entity spec deferred shelves to
a future spec — this is that spec. It delivers the foundation only; the
settings UI, calendar shelf filter, and shelf-scoped commands are separate
later specs.

## Scope

In scope:

- A new feature slice at `src/shelves/`.
- `shelvesCollection` — a settings collection of shelves.
- `ShelvesLifecycleService` — create / rename / delete / assign operations.
- Reconciliation of shelf membership when a journal is renamed or deleted.

Out of scope (later specs):

- Create / rename / delete modals and any settings-dashboard UI.
- The "use shelves?" global toggle — dropped in v3 (see Background).
- Calendar shelf filter (v2's `ui.calendarShelf`).
- Shelf-scoped commands (extending the command `target` union).
- Migrating actual v2 shelf data into the v3 shape — handled by the separate
  v2→v3 migration path.

## Background: v2 shelf model

- v2 stored shelves two ways at once: `PluginSettings.shelves` keyed by name
  (`ShelfSettings` = `{ name, journals, commands }`), and a redundant
  `JournalSettings.shelves: string[]` back-reference on every journal.
- The v2 UI only ever placed a journal on a single shelf ("Not on a shelf" or
  pick one), so the journal-side array was never exercised as multi-value.
- A global `useShelves` boolean gated the whole feature.
- Operations: create, rename, remove (with an optional destination shelf to
  move member journals to), and assign-journal-to-shelf.

## v3 model decisions

**Membership lives only on the shelf.** A shelf entry carries the list of
journal names on it. The journal config is untouched — no shelf back-reference.

**A journal belongs to at most one shelf.** `assign` enforces this, so no
journal name appears in two shelves' `journals` arrays.

**No global toggle.** Shelves are always available. An empty `shelvesCollection`
behaves exactly as "shelves off" did in v2, so the `useShelves` boolean is
dropped. (A deliberate v2 shrink, opted into for this port.)

## Component 1 — `shelvesCollection`

Location: `src/shelves/config.ts`. Defined with `defineCollection` from the
settings slice, mirroring `journalConfigCollection` and `commandCollection`.

```ts
const shelfConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  journals: v.array(v.string()),
});

export const shelvesCollection = defineCollection("shelves", shelfConfigSchema, (id) => ({ name: id, journals: [] }));

export type ShelfConfig = v.InferOutput<typeof shelfConfigSchema>;
```

The collection is keyed by shelf name. `journals` is the ordered list of
journal names on the shelf — this is the sole source of truth for membership.

This is the entire shelves data model. No slice, no toggle.

## Component 2 — `ShelvesLifecycleService`

Location: `src/shelves/lifecycle.ts`. Mirrors `JournalLifecycleService`:
returns `Result`s, opens no modals (UI is a later spec), reads and writes the
collection through `SettingsService`.

```ts
class ShelvesLifecycleService {
  create(name: string): Result<ShelfConfig, InvalidShelfNameError | ShelfNameTakenError>;

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownShelfError | InvalidShelfNameError | ShelfNameTakenError>;

  delete(name: string, destinationShelf?: string): Result<void, UnknownShelfError>;

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError>;
}
```

### `create(name)`

- Rejects an empty name with `InvalidShelfNameError`.
- Rejects a name already in the collection with `ShelfNameTakenError`.
- Otherwise adds `{ name, journals: [] }` and returns it.

### `rename(oldName, newName)`

- Rejects an empty `newName`, or `newName === oldName`, with
  `InvalidShelfNameError`.
- Rejects an unknown `oldName` with `UnknownShelfError`.
- Rejects a `newName` already in the collection with `ShelfNameTakenError`.
- Otherwise re-adds the entry under `newName` with its `journals` preserved and
  removes the `oldName` entry. Journals hold no shelf reference, so nothing
  else cascades.

### `delete(name, destinationShelf?)`

- Rejects an unknown `name` with `UnknownShelfError`.
- Rejects a provided-but-unknown `destinationShelf` with `UnknownShelfError`.
- With a destination: the member journal names are appended to the destination
  shelf's `journals` array, then the `name` entry is removed.
- Without a destination: the `name` entry is simply removed. Membership lived
  only in that entry, so the member journals become unassigned — their journal
  configs are untouched and they keep working exactly as before. This is v2's
  RemoveShelf "None" / "Journals will be moved out" behaviour.

### `assign(journalName, shelfName)`

- Rejects an unknown `journalName` (not in `journalConfigCollection`) with
  `UnknownJournalError`.
- `shelfName === ""` means unassign: `journalName` is removed from every
  shelf's `journals` array. No error.
- Otherwise rejects an unknown `shelfName` with `UnknownShelfError`, then
  removes `journalName` from every shelf and appends it to `shelfName`'s
  `journals`. The remove-from-all step enforces single-shelf membership.

### Reconciliation

The service is registered `.eager()` and, in its constructor, subscribes to
`JournalLifecycleService.events` — the same events `command-registry` already
consumes:

- `journalRenamed` → in every shelf, replace the old journal name with the new
  one in `journals`.
- `journalDeleted` → in every shelf, remove the journal name from `journals`.

This keeps shelf membership consistent with journal renames and deletions —
the cost of storing membership shelf-side rather than on the journal.

The service emits no events of its own; nothing consumes them until the UI
spec, so none are added now.

## Component 3 — errors

`src/shelves/errors.ts`:

- `InvalidShelfNameError` — empty or otherwise unusable shelf name.
- `ShelfNameTakenError` — name already in the collection.
- `UnknownShelfError` — no shelf with the given name.

`assign` reuses `UnknownJournalError` from `src/journals/settings/errors.ts`
rather than redefining it.

## Component 4 — module wiring

`src/shelves/module.ts` exports `shelvesModule`, which registers:

- `CollectionDefinitionToken` → `shelvesCollection`.
- `ShelvesLifecycleService` → itself, `.eager()` (so its journal-event
  subscription is live from boot).

`src/shelves/index.ts` is the public barrel, exporting `shelvesCollection`,
`ShelfConfig`, `ShelvesLifecycleService`, and the error classes.

`main.ts` adds `container.addModule(shelvesModule)` after
`journalsSettingsModule`.

## Migration

The `shelves` collection key is absent from existing stored data.
`SettingsService` hydration already initialises a missing collection as empty,
so no migration entry is required.

## Testing

Unit tests for `ShelvesLifecycleService`, colocated as `lifecycle.test.ts`,
following the `src/journals/settings/lifecycle.test.ts` harness:

- `create` — success; empty name rejected; duplicate name rejected.
- `rename` — success preserves `journals`; empty / unchanged name rejected;
  unknown shelf rejected; duplicate target name rejected.
- `delete` — without destination, the shelf is gone and members are unassigned;
  with destination, members appear on the destination shelf; unknown shelf and
  unknown destination rejected.
- `assign` — places a journal on a shelf; moving a journal off its current
  shelf leaves it on only the new one; `""` unassigns; unknown journal and
  unknown shelf rejected.
- Reconciliation — renaming a journal updates its name in every shelf;
  deleting a journal removes it from every shelf.

The `shelvesCollection` definition and the module wiring are not tested
directly.
