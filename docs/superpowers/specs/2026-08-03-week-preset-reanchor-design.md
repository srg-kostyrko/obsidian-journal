# Re-anchoring Weekly Notes on a Week Preset Change — Design

**Stage:** Calendar + journals correction, pre-3.0 release
**Date:** 2026-08-03
**Status:** Draft for review

## Purpose

Changing the week preset shifts the week grid. Every weekly note's stored
`journal-date` was written as the first day of its week under the _old_
grid, so after the change it is no longer the first day of any week — and
`FrontmatterService.parseEntry` (`journals/frontmatter.ts:40-43`) rejects a
fixed-cycle note whose date is not the canonical anchor. The note drops out
of `JournalsIndex` on the next rescan or restart and its calendar cell reads
as "no note". The `journal-start-date` and `journal-end-date` fields go
stale by the same shift.

Nothing in v3 rewrites those notes. `CalendarWeekBlock.change()`
(`calendar/settings/ui/CalendarWeekBlock.vue:71-76`) writes the calendar
slice and stops:

```ts
function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    if (touchesGlobalPatch(slice.state, value)) reloadHint.request();
    slice.state = value;
  });
}
```

v2 handled this in `CalendarWeekSettings.modal.vue` → `updateWeeklyJournals`
(`_old-code/utils/journal.ts:67-89`), which rewrote each weekly note's date,
start-date and end-date frontmatter, preserving the note's week number and
recomputing its dates under the new grid. This design ports that behavior.

The user-visible symptom is severe out of proportion to the cause: the files
are untouched, but the calendar reports them as missing, which reads as data
loss.

## Rule: keep the week number

A note that was "week 23 of 2026" stays week 23 of 2026; only its dates
move. This matches v2's promise to the user ("week number of notes will be
kept but dates will be updated") and keeps a `gggg-[W]ww` filename agreeing
with the note's own frontmatter.

The identity carried across the change is the pair (week-year, week number),
read under the old grid and resolved back to a date under the new one. v2
read the _calendar_ year (`date.year()`, `_old-code/utils/journal.ts:75`),
which is wrong for a week straddling January 1 — the same class of defect as
the v2 cross-year anchor bug. This port reads the week-year.

Snapping to the week containing the old anchor — the rule
`DataMigrationService.#canonicalizeWeekAnchor` uses for boot-time repair —
was considered and rejected. It agrees with the keep-the-week-number rule
everywhere except near a year boundary, where a `doy` change can move a note
into a week whose number no longer matches its filename.

## Components

### `WeekPeriod.ofWeek(weekYear, weekOfYear)`

`calendar/period-week.ts`. A static that builds the week identified by a
(week-year, week number) pair under the current week config. The reverse
direction already exists: `WeekPeriod.containing(date)` exposes `.year`
(week-year) and `.weekOfYear` (`period-week.ts:30-31`). Exported from the
calendar barrel; these two are the pair the re-anchor reads and writes.

### `NoteConnectionService.reanchorAll(journalName, targets)`

`journals/notes/note-connection.ts`. A sibling of `reapplyAll`
(`note-connection.ts:168-180`), taking a `ReadonlyMap<VaultPath,
AnchorString>`. For each connected note whose target differs from its
current anchor, it builds metadata at the new anchor and applies
`FrontmatterService.writeMutator` (`frontmatter.ts:100-146`), so the date
field, the start/end fields (each subject to its own `add*` toggle) and any
numbering keys all come from the single place that knows the frontmatter
shape.

Best-effort per note, like the rest of the family: one unwritable note must
not strand the journal. Unlike its siblings it returns
`{ rewritten, failed }` — see [Error handling](#error-handling).

Targets are applied under a claim check. A grid change can leave a year one
week shorter, which collapses two weeks onto one anchor; the loser keeps its
old date rather than overwriting the winner's note, and counts as failed.

### `WeekPresetService`

`journals/settings/week-preset-service.ts`. Owns the ordering, which is the
part that is easy to get wrong:

```
apply(next)
  1. snapshot   for every journal with write.type === "week":
                  entriesFor(name) → { path, weekYear, weekOfYear }   ← read under the OLD grid
  2. commit     calendarSlice.state = next
  3. settle     await nextTick()                                       ← the bridge applies the new grid
  4. re-anchor  targets = WeekPeriod.ofWeek(weekYear, weekOfYear).anchor
                connection.reanchorAll(name, targets)
```

Step 3 is load-bearing. `CalendarSettingsBridge` applies the week config
from a Vue `watchEffect` (`calendar/settings/bridge.ts:18-20`), which
flushes on nextTick, so anything computing week boundaries immediately after
the slice write still sees the old grid.

The service lives on the journals side because `@/calendar` must not import
`@/journals` — the barrel cycle recorded in
`[[project_journals_barrel_import_cycle]]`.

A direct submodule import from the component was the first plan and does not
work. `@/calendar/index.ts` → `settings/module.ts` →
`ui/CalendarWeekBlock.vue`, so _any_ journals import from that component
closes a cycle back through the journals side's own `@/calendar` imports
(`journals/cycle.ts` imports the barrel for values, not just types).
`import-x/no-cycle` is an ESLint error (`eslint.config.mjs:168`), so this
fails the lint gate rather than merely being untidy.

The seam is inverted instead: `calendar/settings/week-preset-applier.ts`
declares a `WeekPresetApplier` interface and a DI token, the component
resolves the token, and the journals module registers `WeekPresetService`
against it. Calendar declares what it needs; journals supplies it; no
calendar → journals import exists.

### Changed call site

`CalendarWeekBlock.change()` calls the resolved applier with the picker's
result instead of assigning `slice.state` directly. The `touchesGlobalPatch` reload
hint stays where it is. `WeekPresetPickerModal` gains v2's heads-up line —
week numbers are kept, dates are updated — as a new `en.json` string
following the copy rules in `docs/2026-07-13-ux-text-audit.md` §A.

## Scope

**In scope:** journals whose write type is the fixed `week`.

**Out of scope, deliberately:**

- Custom intervals with `every: "week"`. They step from their own configured
  anchor date (`journals/cycle.ts` `customStep`), so the week grid never
  moves them.
- Renaming note files. v2 did not rename, and under the keep-the-week-number
  rule a week-numbered filename stays correct. A note whose filename is a
  plain date will disagree with its new frontmatter date; that is accepted,
  as it was in v2.
- Notes already orphaned by a preset change made before this fix. The note
  list comes from `JournalsIndex`, which by definition cannot see them.
  Repairing those would need a whole-vault frontmatter walk, and v3 is
  unreleased — there is no affected population to repair. Once this ships, no
  further notes fall out.

## Error handling

The slice write cannot fail. Individual `updateFrontmatter` calls can — a
deleted note, a lock, malformed frontmatter — and are swallowed per note and
logged with `logger.warn`, matching `DataMigrationService`.

`reanchorAll` returns `{ rewritten, failed }` — `failed` covering both write
failures and refused collisions — and the service raises a single notice when
`failed > 0`. This is a deliberate divergence from the silent
best-effort siblings: a note that fails to re-anchor is left in exactly the
state this change exists to prevent — dropped from the index, blank calendar
cell — and no other on-screen signal would reveal it. Successful rewrites
stay silent, per the project's minimal-notification rule.

## Testing

**`WeekPeriod.ofWeek`** — resolves the week start under a Monday-start grid;
under a Sunday-start grid; for a week 1 that straddles January 1.

**`reanchorAll`** — writes the target anchor into the date field; recomputes
the start-date field when enabled; recomputes the end-date field when
enabled; skips a note whose target equals its current anchor; keeps
rewriting after one note fails; reports the failure count; refuses a target
already held by a note that is staying put.

**`WeekPresetService`** — a Monday→Sunday change moves a weekly note's
date back one day; that move leaves the note's week number unchanged; a note
in the week straddling January 1 keeps its week-year (regression guard for
the v2 calendar-year defect); the rewritten start/end reflect the new grid
rather than the old one (this test fails if the nextTick settle is removed);
toggling only `global` rewrites nothing; a month journal is untouched; a
custom `every: "week"` interval is untouched.

**E2E (wdio)** — create a weekly note, change the preset from settings, then
assert both that the note's frontmatter date moved and that its calendar
cell still reads as connected. This is the layer where the defect actually
lived: unit tests pass even when the note falls out of `JournalsIndex`,
because that drop happens in Obsidian's metadata round-trip.

## Related

- `[[project_week_preset_change_orphans_notes]]` — the gap this closes
- `[[project_week_canonical_anchor]]` — why a non-canonical date orphans a note
- `[[project_v2_week_anchor_bug]]` — the week-year dependency v2 got wrong
- `docs/superpowers/specs/2026-07-26-week-anchor-split-design.md`
