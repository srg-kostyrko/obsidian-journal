# Regression #5 — Journal delete: `clear` / `delete` note handling

Date: 2026-06-01
Branch: `v3-ai`
Tracks: gap #5 in `docs/2026-06-01-v2-v3-feature-gaps.md`

## Problem

Deleting a journal in v3 only ever removes the journal config. The three v2 note
dispositions are not honored:

- `keep` — leave connected notes untouched (only mode currently working).
- `clear` — strip the journal's frontmatter keys from every connected note.
- `delete` — remove every connected note file.

`DeleteJournalModal.vue` hardcodes `{ mode: "keep" }` and renders `clear`/`delete`
as `disabled` options with a "not implemented" hint. `DeleteJournalFlow` never
touches notes.

v2 reference: `JournalPlugin.removeJournal(name, notesProcessing)`
(`src/_old-code/main.ts:233-259`) dispatching to `Journal.clearNotes()` /
`deleteNotes()` (`src/_old-code/journals/journal.ts:392-408`), both looping the
journal index best-effort via `Promise.allSettled`.

## Design

### Note-purge methods on `NoteConnectionService`

`NoteConnectionService` already owns the `JournalsIndex`, single-note
`disconnect`, and `NotesService`. Two journal-wide methods sit beside `disconnect`:

```ts
disconnectAll(journalName: string): AsyncResult<void, never>
deleteAll(journalName: string): AsyncResult<void, never>
```

Each:

1. Snapshots paths up front: `[...this.#index.entriesFor(journalName)].map(([, path]) => path)`.
   Snapshotting matters — clearing frontmatter / trashing files mutates the index
   reactively (via `vault-subscription`'s `deleted`/metadata listeners), so we must
   not iterate the live index.
2. Runs the per-note op for every path concurrently, best-effort:
   - `disconnectAll` → `this.disconnect(path)` per note.
   - `deleteAll` → `this.#notes.delete(path)` per note.
   - `await Promise.all(paths.map(...))` — `AsyncResult` is thenable and never
     rejects, so failures surface as `Err` Results that we deliberately ignore
     (matching v2's `allSettled`). Resolves `AsyncResult.ok()`.

The `never` error channel is honest: these methods cannot fail the caller. A
single bad note must not strand the journal config (v2 parity).

`disconnectAll` reuses `disconnect`, which resolves the journal's _custom_
frontmatter field names through `clearMutator(journalName)`. This is why purge
must run **before** the config is deleted (see ordering).

### `DeleteJournalFlow` dispatch and ordering

The modal result widens from `{ mode: "keep" }` to
`{ mode: "keep" | "clear" | "delete" }`. The flow dispatches with `ts-pattern`:

```ts
yield *
  match(mode)
    .with("clear", () => this.#connection.disconnectAll(journalName))
    .with("delete", () => this.#connection.deleteAll(journalName))
    .with("keep", () => AsyncResult.ok())
    .exhaustive();
yield * this.#repository.delete(journalName).mapErr(toFlowError);
// ...existing UI pop on the open journal-edit subpage
```

**Ordering is the one hard constraint:** purge → `repository.delete` → pop.
Once the config is gone, `clearMutator` can no longer resolve renamed frontmatter
fields and would fall back to the default key set, missing custom keys.

`DeleteJournalFlow` gains a `NoteConnectionService` injection. The modal-cancel
and `toFlowError` paths are unchanged.

### Modal

`DeleteJournalModal.vue`:

- `useModal<{ mode: "keep" | "clear" | "delete" }>()`.
- `submit()` returns the live `mode` ref instead of the hardcoded literal.
- Remove the `disabled` attribute from the `clear` and `delete` `<option>`s.
- Drop `journal_delete_mode_not_implemented_hint` from the `#description` slot
  (and delete the now-unused message from `messages/en.json`). Replace with a
  plain descriptive hint if one reads well, otherwise no description.

## Behavioral notes (deltas from v2, intentional)

1. **Trash, not permanent delete.** v2 `deleteNote` used `vault.delete`
   (permanent). v3 standardized on `NotesService.delete` → `fileManager.trashFile`
   (recoverable, respects the user's trash setting); the connect-override path
   already uses it. `deleteAll` uses this v3 primitive. Strictly safer.
2. **Best-effort, silent.** Individual clear/delete failures are ignored and the
   journal config is still removed, matching v2. No aggregate notice is surfaced
   (v2 surfaced none).

## Out of scope

- Index cleanup for the deleted journal: handled reactively by existing
  `vault-subscription` listeners (`clear` → metadata change, `delete` → vault
  `deleted`). No explicit `clearJournal` call added.
- Regression #6 (rename rewriting frontmatter) — separate item, though it shares
  the `entriesFor` + frontmatter-rewrite shape.

## Testing

- `NoteConnectionService`:
  - `disconnectAll` clears the journal's frontmatter keys from every connected
    note (assert observable frontmatter, fake notes/index).
  - `deleteAll` trashes every connected note (assert the files are gone).
  - Each is best-effort: one failing note does not prevent the others (inject a
    failure on one path via `vi.spyOn`; assert the rest still processed).
  - Each snapshots paths so reactive index mutation mid-run doesn't drop notes.
- `DeleteJournalFlow`:
  - `clear` mode purges frontmatter before the config is deleted.
  - `delete` mode trashes notes before the config is deleted.
  - `keep` mode leaves notes untouched.
  - Cancelling the modal aborts without deleting the config or touching notes.
- `DeleteJournalModal`: submitting with `clear`/`delete` selected returns that
  mode; `clear`/`delete` options are enabled.
