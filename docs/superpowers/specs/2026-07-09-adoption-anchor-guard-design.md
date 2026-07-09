# Adoption anchor guard

## Problem

When a journal is deleted with the **keep** mode, its notes retain their frontmatter
(`journal: <name>`, `journal-date: <anchor>`, …) — only the in-memory index is cleared.
If a new journal is later created with the **same name**, a vault rescan re-adopts those
notes purely by name match (`FrontmatterService.parseEntry`, `src/journals/frontmatter.ts:23`).

The note's period kind (day / week / month / quarter / year / custom) is **not** recorded in
frontmatter — only the journal name and a date. So when the recreated journal's write type
differs from the original, the stored date is silently re-interpreted through the new cycle:

- A month note (`journal-date: 2024-01-01`) under a recreated **daily** journal is silently
  adopted as the Jan-1 daily note.
- A day note (`journal-date: 2024-01-15`) under a recreated **monthly** journal never matches
  the month anchor (`2024-01-01`), so it dangles in the index while navigation creates a fresh
  January note.

There is no validation, no error, and no user-visible signal. This is silent data
re-interpretation.

## Constraints

- **No new frontmatter fields.** Users have already pushed back on frontmatter bloat, so the
  guard must store nothing on notes.
- **No note mutation on adoption.** The guard decides index membership only; files on disk are
  never touched.
- **Retroactive.** The guard must protect notes already orphaned in existing vaults, not only
  notes deleted after it ships. This means it runs on every rebuild for all notes, not just in
  the delete flow.

## The rule

There is a single adoption rule:

> A note is adopted by journal _J_ only if `anchorOf(J, storedDate) === storedDate` — its
> stored `journal-date` must be the canonical anchor of the period it falls in.

This holds because **every legitimate `journal-date` is written as a canonical anchor.** All
write paths route the date through `CycleService.anchorOf` before `FrontmatterService.writeMutator`
stores `metadata.anchor` (commands via `command-registry`, `open-journal-entry.flow`, `note-path`,
`bulk-add-service`, `auto-attach`), and the v1→v2→v3 migration canonicalizes too
(`data-migration-service.ts:119`). Therefore rejecting a stored date that is **not** its journal's
canonical anchor only ever drops foreign / mis-typed notes, never legitimate ones. This invariant
is load-bearing and is pinned by a test (see Testing).

Fixed and custom cycles differ only in **when** the rule can be evaluated:

- **Fixed** — `anchorOf` is a pure `periodOfKind` computation with no index dependency. Evaluate
  it inside `parseEntry`, so an off-grid note never registers.
- **Custom** — `anchorOf` reads the index: a custom interval's start is defined by the chain of
  manually stored `endDate`s across other notes (`CycleService` `#customNext` / `#customPrevious`,
  `src/journals/cycle.ts:70`). It can only be evaluated once the index is complete, as a
  reconciliation step after the rebuild loop.

## Design

### Fixed cycles — validate in `parseEntry`

`FrontmatterService.parseEntry` gains a canonical-anchor check for fixed-write journals. After
parsing `rawDate` into an anchor, if the journal's cycle is fixed and
`anchorOf(name, parsedDate) !== anchor`, return `Option.none()` instead of the entry. Custom-write
journals pass through unchanged (validated later). The check is expressed through a
`CycleService` predicate (e.g. `isCanonicalAnchor(name, anchor)`), called from `parseEntry` **only**
when the cycle is fixed, so `parseEntry` never triggers an index read during pass 1.

Keeping the check in `parseEntry` (rather than register-then-unregister) means an off-grid fixed
note is never registered, avoiding transient `entryChanged` add/remove churn during boot rebuild.

### Custom cycles — two-pass rebuild

`VaultSubscriptionService.#rebuild` becomes two passes:

1. **Pass 1** — unchanged: `#scan` every markdown note. `parseEntry` (now with the fixed check)
   registers fixed notes that pass and all custom notes provisionally by name.
2. **Pass 2 (new reconciliation)** — for each **custom** journal:
   - Collect its registered anchors from the index. If none, skip.
   - Reconstruct the true anchor sequence once: walk from `config.anchorDate` outward via
     `nextAnchor` / `previousAnchor` (index is now complete, so stored `endDate` extensions are
     honored), bounded by the journal's min and max stored anchor, collecting anchors into a `Set`.
     The walk reuses the strict-progress guard from `intervalsInRange` (`src/journals/cycle.ts:195`)
     to stay finite.
   - `index.unregister` any note whose anchor is not in the reconstructed set.

   Set-based membership keeps pass 2 at O(intervals) rather than O(notes × distance).

### Incremental scans stay single-pass

A single `metadata-changed` event fires `#scan` while the index is already complete, so no second
pass is needed:

- Fixed journals are validated inline by `parseEntry` (as above).
- Custom journals are validated inline with the single-note predicate
  `anchorOf(name, storedDate) === storedDate` — one walk, index complete.

### Rejected notes are inert

A rejected note is dropped from the index only. The file on disk is never modified. The old bug's
_silent mis-adoption_ becomes _silent non-adoption_: the note sits inert with its stale frontmatter
until the user deliberately reconnects it. A `logger.debug("anchor off sequence", { path })` mirrors
the existing "frontmatter not parseable" debug line for diagnosability. No user-visible notice is
emitted; a visible "N notes no longer match journal X" report is a separate feature, out of scope.

## Known limitations

- **Collisions.** Two notes on one anchor already clobber each other in the per-journal anchor→path
  map (`journal-index`). Pre-existing, out of scope.
- **Reconstruction poisoning.** A foreign orphan that lands _exactly_ on a new-grid anchor _and_
  carries an `endDate` can shift the reconstructed custom chain. Requires an exact grid-hit, so it
  is second-order; noted as a residual edge, not solved here.
- **Precondition dependency.** The reject rule is only safe while every legitimate `journal-date`
  is canonical. A future write path that stores a non-canonical date would start dropping legit
  notes. Pinned by an invariant test.

## Testing

Unit:

- `parseEntry` rejects a non-canonical fixed date; accepts a canonical one.
- Reconciliation drops a foreign orphan under a recreated custom journal.
- Reconciliation keeps a legitimately extended interval (off the regular grid but on the
  reconstructed sequence).
- Reconciliation keeps a same-type recreation's notes.
- Invariant: a note written through the normal create path is always re-adoptable by its own
  journal (guards the canonical-anchor precondition).

e2e (wdio, runtime-touching):

- Fixed: delete a journal with keep → recreate with a different write type → assert the orphaned
  note is not surfaced by the new journal's navigation.
- Custom: delete a custom journal with keep → recreate with different custom parameters → assert
  off-sequence orphans are not adopted while on-grid notes are.

## Out of scope

- User-visible reporting of dropped notes.
- A reconnect / re-adopt command for inert notes.
- Solving anchor collisions.
