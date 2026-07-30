# A followed note holds the view only when its period is on screen

Amends `2026-07-29-view-date-follows-active-note-design.md`. That spec's model —
one selected date plus a per-block layout rule — is kept. Two things change: the
question a block asks before holding its layout, and a new guard on the follow
itself.

## Problem

A calendar block holds its layout when the opened note's date lands anywhere in
its **rendered cells**, spillover days included. A month grid renders up to six
days of the previous month and six of the next, so a note in either neighbor
holds the window while the view's date moves into that neighbor. Every consumer
that reads the date directly then names a period the grid is not laid out around:

- The grid shows July, a day note for August 1 opens, and the toolbar's month
  button reads **August** while the month heading reads **July**. This is the
  reported confusion.
- Worse for coarse notes: viewing June, a Q3 note opens. Its anchor is July 1, a
  spillover day, so the window holds on June while the date becomes July 1. The
  quarter button names Q3 and highlights, but the grid is a quarter away from
  what it names. Note that pointing the toolbar at the held window instead —
  the other obvious way to make the two agree — is worse, not better: the
  quarter button would then name Q2, and since a period button highlights by
  comparing its own period's anchor against the active entry, nothing anywhere
  would mark the open note.
- v2 moved the display in both cases. A day note anywhere outside the current
  month moved it unconditionally; a quarter or year note moved it whenever the
  display was not already inside that period.

The cause is one predicate asking the wrong question. `monthWindowContains`
expands the displayed months to whole weeks before testing containment, so it
answers _"is this date among the pixels I painted?"_ where the honest question is
_"does my window own the period this date belongs to?"_ Spillover days belong to
a neighboring period the window does not own.

Two records need correcting alongside the code. The amended spec listed v2's
per-journal-type follow branching as a non-goal, which is right — but read its
uniform replacement as a strict improvement without checking what the branching
had been buying. And `docs/2026-06-01-v2-v3-feature-gaps.md:359` lists
"active-note follow (week/quarter/year spillover)" among the sweeps verified as
faithful. That sweep compared v3's guard against v2's week-branch guard and found
them equivalent; the day, month and custom cases, which v2 handled by having no
guard at all, never entered the comparison. Left alone, that line re-certifies
this defect.

## Goal

Every period a view names is a period the view displays. No consumer of the
view's date has to know how blocks lay themselves out to be truthful.

## Behavior

A **note's period** is the span of time a note is its journal's entry for: a day
for a daily journal, a week for a weekly one, an interval for a custom one.

A block's **displayed periods** are the periods it lays a grid out for — the
months of a month calendar, the weeks of a week calendar. Days of a neighboring
period that a grid paints in its margins are not among them.

### Scenario: opening a note you are already inside leaves the date alone

- **Given** a view is set to follow the active note
- **When** the user opens a note whose period contains the view's date
- **Then** the view's date does not change

### Scenario: opening a note you are outside moves the date to it

- **Given** a view is set to follow the active note
- **When** the user opens a note whose period does not contain the view's date
- **Then** the view's date becomes that note's date

### Scenario: a block holds its layout for a date it already displays

- **Given** a calendar block is displaying several periods
- **When** the view's date moves, because a note opened, to a date belonging to
  one of those periods
- **Then** the block keeps displaying the same periods

### Scenario: a block re-lays-out for a date it only paints in its margin

- **Given** a calendar block is displaying a single period
- **And** the grid paints some days of the neighboring period alongside it
- **When** the view's date moves, because a note opened, to one of those days
- **Then** the block lays itself out around the neighboring period

### Scenario: navigating always re-centers

- **Given** a calendar block is displaying several periods
- **When** the user changes the view's date through navigation
- **Then** the block lays its periods out around the new date, whether or not it
  was already displaying that date's period

### Scenario: narrowing a block's range brings the date back into view

- **Given** a block is displaying several periods and holding its layout
- **And** the view's date belongs to one of them
- **When** the user reduces how many periods that block displays, such that the
  date's period is no longer among them
- **Then** the block lays itself out around the view's date

### Scenario: a named period is always a displayed period

- **Given** a view whose toolbar names the periods around the view's date
- **When** the user opens notes and navigates in any order
- **Then** every period the toolbar names is one its calendar blocks display

## Design notes (implementation vocabulary)

Domain scenarios above stay in domain language; concrete names live here.

### Two rules, each local

**Follow** (`src/views/use-follow-active-note.ts`, view level). The composable
takes a new `currentDate: () => AnchorString` option. It resolves the opened
note's span with `CycleService.startOf/endOf(journalName, anchor)` — the pairing
`nav-row-context.ts:50-51` already uses — and returns without calling `onFollow`
when `spanContains(currentDate(), start, end)` **and** the note's
`representativeOf` day is the same as its `startOf` day. Otherwise it proceeds
exactly as today, through `representativeOf`. The second condition matters for
exactly one period kind: a week's representative day (the one carrying the
week-year) can differ from its start, and that difference is itself information
the view must move to carry, so a week whose span contains the current date
still follows rather than holding. When either bound is `None`, because a
journal was deleted mid-flight, it falls through to moving, which is today's
behaviour.

**Window** (`src/views/blocks/ui/use-window-anchor.ts`, block level). Unchanged
in shape. What changes is `monthWindowContains` in `follow-visibility.ts`: the
two lines expanding the displayed months to whole weeks are deleted, leaving the
displayed months' own span. `weekWindowContains` already tests period membership,
since contiguous displayed weeks make span containment and period membership the
same test, and is untouched. The follow rule writes the same containment check
inline rather than calling `spanContains`: importing `blocks/ui/follow-visibility`
into a view-level composable would invert the layering, and the alternative,
`Interval.between` in `src/calendar/interval.ts`, returns a `Result` that would
need error handling for a pathologically shrunk stored interval end, where the
inline form correctly answers `false`.

Neither rule branches on journal type, so the amended spec's non-goal stands: a
day journal's span is a day, a week's is a week, a custom interval's is the
interval, and one uniform test reproduces v2's outcomes without reconstructing
its `switch`. The branching v2 needed was an artifact of comparing dates where it
meant to compare periods.

`refDateOrigin` stays necessary. "The date moved from July to August" means
re-center when it came from a navigation and hold when it came from a follow, and
nothing else distinguishes them.

### The invariant, enforced where the anchor is read

`useWindowAnchor` returns

```ts
computed(() => (options.contains(refDate, anchor.value) ? anchor.value : refDate));
```

The watcher still remembers a held anchor; the computed guarantees no caller sees
one that has stopped containing the view's date. Blocks are updated in place on a
config edit — `view-leaf.ts` renders them with `key: block.id` — so editing
`before`/`after` downward under a held window would otherwise strand the date off
screen, the one path that could resurrect the mismatch. `contains` closes over
`props.config.before/after`, so the computed re-evaluates on the edit.

### Unchanged consumers

`PeriodButtonsItem`, `ButtonItem`, `DefinedNavigationItem`,
`CustomIntervalsBlock` and `MarkdownTemplateBlock` keep reading `refDate`
directly. That is the point: with the invariant restored, reading the view's date
raw is correct, and the fix belongs to the rules rather than to their consumers.

## Deliberate behaviour changes

Both follow from applying the follow rule uniformly, and neither drops v2
functionality.

1. **A custom-interval note you are inside no longer moves the view.** v2's
   `default:` branch moved unconditionally, so opening an interval spanning late
   June to mid-July while looking at July pulled the display back to June. The
   view now stays. This extends to custom intervals what v2 already did for
   quarters and years.
2. **A month note for the month you are in no longer snaps the date to the
   1st.** Invisible in a month grid, which displays the same month either way,
   but `CustomIntervalsBlock` resolves its own window from the view's date: with
   that block set to a `week` window, viewing July with the date on July 15 and
   opening July's month note now holds the week of the 15th where v2 swung to the
   week of the 1st. Opening a month note should not drag a day-level cursor. This
   snap is suppressed only where the note's representative day is the same as
   its period's start — true for day, month, quarter, year and custom-interval
   notes — so it leaves weeks alone: a weekly note still moves the date to its
   representative day even when the view's date already sits inside that week.

   The same applies at mount: a view opening while this month's month note is
   active starts on today rather than on the 1st, since the guard runs on the
   watcher's immediate first pass too. The amended spec's "starts on that note's
   date rather than on today" scenario still holds for every note whose period
   does not contain today, which is the case it was written for.

The amended spec's four deliberate changes all stand, including its third — with
`before`/`after` above zero, a held date followed by one navigation step can move
the window by more than one period. That cost is unchanged here.

## Non-goals

- Restoring v2's per-journal-type follow branching. Kept as a non-goal, now for a
  sharper reason: the type branching was a workaround for a point-versus-period
  comparison error, so fixing the comparison makes it unnecessary rather than
  merely unwanted.
- Marking which displayed period the toolbar is naming. A block's own period
  heading and the active note's cell highlight carry that today; a marker is a
  new visual affordance for a case that only arises with `before`/`after` above
  zero, and can follow if it still confuses.
- Any change to how the active note is detected or mapped to a journal entry.

## Testing

- Unit — `follow-visibility`: `follow-visibility.test.ts:37`, "includes a
  spillover day from an adjacent month shown in the grid", asserts the defect as
  intent and is replaced by two tests — a spillover day of a month outside the
  window is excluded, and a day of an adjacent month the window itself displays
  is included. Existing boundary and week cases stand.
- Unit — `useFollowActiveNote`: its `mount()` helper gains a `currentDate`
  option defaulting far from the fixtures, so the seven existing tests keep
  asserting the move path. Added, one behaviour each: holds the date when the
  note's period contains it; moves when it does not; holds for a quarter note
  opened from inside that quarter; moves for a quarter note opened from outside.
- Unit — `useWindowAnchor`: its three tests stand; one added for the narrowing
  path, where `contains` stops holding under an already-held anchor.
- Component — `MonthCalendarBlock`: opening a note on a spillover day moves a
  single-month window, and does not move one configured with `after: 1`. This is
  where the two rules meet.
- e2e (v3-ai wdio, runtime-touching) — one spec beside `view.e2e.ts`'s existing
  "steps a month on from the opened note's month" guard, written for this same
  class of defect. After opening a day note that renders as a spillover cell, the
  toolbar's month button and the grid's month heading name the same month. The
  spillover date is read from a rendered `[data-outside]` cell rather than
  computed, or the spec passes or fails by which weekday the 1st falls on.
- Docs — a new numbered entry in `docs/2026-06-01-v2-v3-feature-gaps.md` (163 is
  free) recording the defect, the fix and both deliberate changes, plus a
  correction to its line 359 so the false verification cannot be read as
  covering this. A line in `docs/manual-testing-checklist-v3.md` for the
  toolbar-versus-grid check.
