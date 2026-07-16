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
matrix: which sync scenarios are handled correctly and which have gaps.

**Scenario 7 (conflict copy) is a confirmed bug and is fixed in this pass.** Tracing
`JournalsIndex.register`/`unregister`: `register` keys its dedup by _path_, so a conflict
copy (different path, same anchor) skips dedup and `journalIndex.set(anchor, conflictPath)`
silently overwrites the original's anchor→path mapping; the original lingers orphaned in
`#byPath`. Worse, when sync later deletes the conflict copy, `unregister` deletes the
anchor slot entirely, so the original note vanishes from all anchor/calendar lookups. The
fix makes same-anchor collisions **incumbent-wins**: the first live path keeps the slot, a
later different path is rejected (never entering `#byPath`), and `unregister` only frees a
slot it actually owns. Nothing is silently orphaned. Other gaps the harness reveals are
report-only unless a fix is trivial.

## Approach (C: unit core + one faithful e2e)

### Unit layer — the scenario matrix and the fix

The genuinely-uncovered cells (7, 11, burst 10) plus the `register`/`unregister` fix.
Cells already covered are **not** duplicated: `vault-subscription.test.ts` covers 4, 5, 6,
and partial 3/8/9; `auto-attach.test.ts` covers cell 1 (a foreign note synced in at a
matching path attaches to exactly one journal; an already-indexed path is skipped).

- **The fix** lives in `src/journals/journals-index.ts` with unit tests in the existing
  `src/journals/journals-index.test.ts`: `register` returns `"registered" | "collision"`
  (incumbent-wins on same-anchor different-path); `unregister` only frees a slot it owns;
  `VaultSubscriptionService.#scan` logs a warn on `"collision"` so a rejected note is
  observable, not silent.
- **The harness** — `src/journals/sync-scenarios.test.ts` (colocated per test-hygiene) —
  drives `VaultSubscriptionService` + `JournalsIndex` on the `vault-subscription.test.ts`
  `buildRig` pattern (extracted to a sibling `vault-subscription.testing.ts`) for
  conflict-copy (7), missing-config (11), and burst (10). `one behavior per test`: each
  cell is its own `it`, grouped by nested `describe`.

### e2e layer — one faithful, real-pipeline cell

- **`e2e/integration/sync-settings.e2e.ts`** (scenario 8): the real `onExternalSettingsChange`
  path, observable without touching plugin internals. Using `writeRawSettings` +
  `triggerExternalSettingsChange()` (both exist in `e2e/support/`), assert (a) a foreign
  note created under the freshly-synced config auto-attaches, and (b) `getSettings()` shows
  the journal entity intact — not wiped to defaults (the `minLength` reset trap).

The conflict-copy bug (7) is proven at the unit level only: the plugin deliberately keeps
its journal index private (`JournalPlugin.#container`), so an index-state bug is not
faithfully observable from e2e without adding a test-only production hook. No boot-race
e2e (cold-boot metadata races need unit-level fakes — an e2e would flake).

## Out of scope

- Fixing every gap the harness reveals (follow-up work; only trivial/obvious fixes inline).
- Modeling the sync engine itself or network/merge behavior — we only model the _events_
  it delivers to the plugin.
- Performance benchmarking beyond asserting index consistency under a burst.

## Testing

The harness _is_ the test. Quality gates: `test`, `check:types`, `check:lint`; the two
new e2e specs run under the wdio `integration` suite.
