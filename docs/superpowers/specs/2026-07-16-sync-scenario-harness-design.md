# Sync-scenario test harness — design

**Date:** 2026-07-16
**Status:** Approved (design)

## Problem

The plugin runs while an external syncing engine (Obsidian Sync, Syncthing, iCloud,
Dropbox, git) mutates the vault behind its back. Those mutations arrive as ordinary
Obsidian vault / metadataCache events that the plugin did not originate. We have no
test that deliberately models these "a change arrived from another device" scenarios
and asserts the plugin's response. This harness builds an executable model of the
sync-scenario space and probes the plugin against it, surfacing correctness gaps as
test failures.

## The seam under test

All external file mutations funnel through **`VaultSubscriptionService`**
(`src/journals/vault-subscription.ts`), which translates the plugin's internal
event vocabulary into `JournalsIndex` mutations:

- `notes.events.on("metadata-changed")` → `#scan` (create/modify surface)
- `notes.events.on("renamed")` → `index.transferPath`
- `notes.events.on("deleted")` → `index.unregister`
- `journalEvents.on("deleted")` → `index.clearJournal`
- `settingsEvents.on("reloaded")` → full `#rebuild`
- `workspace.onLayoutReady(...)` → gated boot walk (`#rebuildWhenResolved`)

Note membership is **frontmatter-based**, not path-based: `FrontmatterService.parseEntry`
(`src/journals/frontmatter.ts`) reads the journal-name key and the date field to
compute the anchor. A note's folder location is where it is _written_, never how it is
_indexed_.

Two adjacent reactors also respond to the same events and are in scope:

- `AutoAttachService` (`src/journals/notes/auto-attach.ts`) — reacts to `created`.
- Settings reload path — `onExternalSettingsChange` → `SettingsService.reload()` →
  `reloaded` → `#rebuild` (the real Obsidian Sync entry point for `data.json`).

## Scenario model

Axes: **(A) the FS event** × **(B) the note's relationship to journals**.

| #   | Scenario                                                                    | Desired response                                                                   | Risk probed                                                              |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Foreign create, valid journal frontmatter                                   | `register` at anchor; **no frontmatter re-write**                                  | cross-device auto-attach write-loop                                      |
| 2   | Foreign create in a journal folder, **no** frontmatter                      | auto-attach writes frontmatter                                                     | fighting the originating device                                          |
| 3   | Foreign modify — journal-date changed                                       | re-register at new anchor, old slot freed                                          | stale slot left behind                                                   |
| 4   | Foreign modify makes frontmatter invalid                                    | `unregister`                                                                       | silent drop / flicker                                                    |
| 5   | Foreign delete                                                              | `unregister`                                                                       | —                                                                        |
| 6   | Foreign rename/move to another folder                                       | `transferPath`, membership preserved                                               | auto-attach mis-fire on move-into-folder                                 |
| 7   | **Conflict copy** — duplicate file, same name+date frontmatter              | one anchor slot; deterministic winner, no silent loss                              | `#byAnchor` overwrite → wrong note wins; auto-create mis-reads slot      |
| 8   | **data.json settings change** synced in                                     | reload → `#rebuild`, index reconciled                                              | minLength reset wiping an entity; config references not-yet-synced notes |
| 9   | **Boot during active sync** — files still streaming                         | walk waits for layout-ready + all-resolved; late arrivals via incremental handlers | files arriving _during_ the walk double-processed or skipped             |
| 10  | **Burst** — hundreds of synced notes at once                                | `journalDirty` microtask-batched; index consistent                                 | O(n) decoration recomputes                                               |
| 11  | Foreign create referencing a **journal config that does not exist locally** | note left unindexed, no crash                                                      | unhandled lookup / thrown error                                          |

Scenarios **7**, **8**, and **11** are the highest-suspicion cells.

## Assertion stance

Each test asserts the **desired** behavior, not merely the current behavior. Scenarios
the plugin mishandles surface as failures. The deliverable includes a reported pass/fail
matrix: which sync scenarios are handled correctly and which have gaps. Confirmed gaps
are documented (and, where cheap and clearly correct, fixed — but bug-fixing is a
follow-up, not part of this harness's scope unless trivial).

## Approach (C: unit core + targeted e2e)

### Unit layer — the full matrix

A dedicated `src/journals/sync-scenarios.test.ts` (colocated per test-hygiene) drives a
real DI `Container` wiring `VaultSubscriptionService` + `JournalsIndex` +
`AutoAttachService` against the existing `Fake*Service` ports:

- `FakeNotesService.externalEdit / create / rename / delete` — the create/modify/delete/rename events.
- `FakeNoteMetadataService.emitResolved` — the boot resolve batches (scenario 9).
- `FakePluginData` + a `settings "reloaded"` emit — the data.json change (scenario 8, unit slice).
- Duplicate-anchor: two `create`s whose frontmatter parses to the same anchor (scenario 7).

`src/journals/vault-subscription.test.ts` (`buildRig`) is the established template. The
harness covers cells 1–7, 10, 11 fully, and the _logic_ of 8–9. `one behavior per test`:
each scenario cell is its own `it`, grouped by nested `describe` per FS-event family.

### e2e layer — timing-sensitive cells only

Two specs where fakes lack fidelity:

- **`e2e/integration/sync-settings.e2e.ts`** (scenario 8, real path): extends the
  `settings-reload.e2e.ts` template — `writeRawSettings` out of band, then
  `triggerExternalSettingsChange()`, assert the index / command palette / decorations
  reconcile and no entity is wiped.
- **`e2e/integration/sync-boot-race.e2e.ts`** (scenario 9, real timing): seed a fixture
  vault with journal notes, boot, and assert every synced note is indexed (no skip)
  despite the resolve race.

A `deleteNote` helper (currently missing) is added to `e2e/support/vault.ts`, mirroring
`renameNote` via `fileManager.trashFile` / `vault.trash`. Conflict-copy files are created
with the existing `createNote`.

## Out of scope

- Fixing every gap the harness reveals (follow-up work; only trivial/obvious fixes inline).
- Modeling the sync engine itself or network/merge behavior — we only model the _events_
  it delivers to the plugin.
- Performance benchmarking beyond asserting index consistency under a burst.

## Testing

The harness _is_ the test. Quality gates: `test`, `check:types`, `check:lint`; the two
new e2e specs run under the wdio `integration` suite.
