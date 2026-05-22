# v3 Shelf Commands

## Background

v2 attached a `commands: PluginCommand[]` array to every shelf. Each shelf command
opened a date in the journals belonging to that shelf, restricted to a single
write type (`command.writeType`). v3 instead keeps all dynamic commands in one
`commands` collection, where each command carries a `target` describing which
journals it acts on. The target is currently a union of `kind: "all"` (every
journal of a chosen write type) and `kind: "journal"` (one named journal).

Porting shelf commands means adding a third target variant — one that resolves
to the journals on a named shelf — and surfacing it through the existing command
management UI. No new command behaviour is introduced; shelf commands reuse the
whole resolution, registration, and ribbon pipeline that `kind: "all"` and
`kind: "journal"` already use.

## Target variant

A shelf can hold journals of mixed write types, so a shelf command must pick the
write type it operates on — the same constraint that gives `kind: "all"` its
`writeType` field. The new variant is the `kind: "all"` shape scoped to one
shelf:

- `kind: "shelf"`
- `shelfName` — non-empty string referencing a shelf
- `writeType` — one of `day`, `week`, `month`, `quarter`, `year`

Shelf-targeted commands live in the same `commands` collection as every other
command. They are not nested inside the shelf record.

## Candidate resolution

When a shelf command runs, its candidate journals are the journals currently on
the named shelf whose write type matches the command's `writeType`. The shelf
membership is read live from the shelves collection at resolution time, so
adding or removing a journal from a shelf takes effect immediately without
re-registering the command.

If the named shelf no longer exists, the candidate set is empty and the command
is hidden from the command palette and ribbon — the same graceful behaviour the
existing variants already exhibit when their target disappears.

## Lifecycle reconciliation

The dynamic command registry already reconciles commands when a journal is
renamed or deleted. Shelf commands need the equivalent for shelves:

- When a shelf is renamed, every shelf-targeted command pointing at the old name
  is updated to the new name.
- When a shelf is deleted, every shelf-targeted command pointing at it is
  removed.

This preserves v2 fidelity: in v2 a shelf's commands travelled with the shelf
record, so renaming a shelf kept its commands working. In v3 the command stores
the shelf name by reference, so the registry must follow renames itself.

To support this, the shelves lifecycle service gains a typed event emitter that
publishes a shelf-renamed event and a shelf-deleted event, emitted from its
rename and delete operations. This mirrors the journal lifecycle service, which
already exposes journal-renamed and journal-deleted events that the command
registry consumes. The command registry subscribes to the shelf events the same
way it subscribes to the journal events.

The command feature thus gains a dependency on the shelves feature (for the
shelves collection and the shelves lifecycle service). The shelves feature does
not depend on the command feature, so the dependency is acyclic.

## Command management UI

### Shelf commands section

A shelf commands section is added to the shelf-detail subpage, presented as a
second collapsible block below the existing journals block. It mirrors the
journal commands section: it lists the commands whose target is this shelf,
sorted by name, with add, edit, and delete controls. Adding a command opens the
edit-command flow with a shelf target seeded to the `day` write type; the user
changes the write type inside the modal.

### Edit-command modal

The edit-command modal already shows a write-type dropdown for `kind: "all"`
targets and static text for `kind: "journal"` targets. The dropdown is extended
to also show for `kind: "shelf"` targets, seeded from the target's write type.
On submit, the modal reconstructs a shelf target from the chosen shelf name and
write type, alongside the existing `all` and `journal` branches.

## Localisation

New messages are added for the shelf commands section, mirroring the existing
journal command messages: a section title, an add-command tooltip, and an
empty-state line.

## Testing

Tests are colocated with their implementation as `*.test.ts` files:

- Registry resolves shelf-targeted commands to the journals on the shelf,
  filtered by write type.
- Registry renames a shelf-targeted command's shelf reference when the shelf is
  renamed.
- Registry removes a shelf-targeted command when its shelf is deleted.
- Shelves lifecycle service emits the shelf-renamed and shelf-deleted events.
- Shelf commands section lists, adds, edits, and deletes shelf-targeted
  commands.
- Edit-command modal shows the write-type dropdown for a shelf target and
  submits a shelf target.

## Out of scope

The v2 built-in `change-calendar-shelf` command is not part of this port.
