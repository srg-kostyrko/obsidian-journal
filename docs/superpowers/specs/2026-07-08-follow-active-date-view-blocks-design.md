# Follow the active note in journal view blocks

## Problem

In v2 the calendar view **followed the active note**: when the user opened or
switched to a journal note in the editor, the calendar moved so that note's
period was in view. v3 dropped this. The infrastructure that tracks the active
entry still exists and is used to _highlight_ the matching cell, but nothing
moves the view — the displayed period only changes via toolbar buttons or
persisted state, defaulting to today. Switching notes no longer brings the
calendar along. This is a regression.

## Goal

Restore following as an **opt-in-per-block** setting on the four windowed
blocks — month calendar, week calendar, custom intervals, and markdown template.
It defaults **on**, so existing users regain v2's behavior without action, and
the setting is the extension that lets them turn it off per block.

Following is **per-block and local**: a following block keeps its own focus and
does not move the shared reference date. Manual navigation (toolbar buttons)
still drives the reference date and stays the source of truth; following never
mutates it, so a "current month" button target is never yanked around by
opening a note. Blocks may therefore sit on different periods within one view.

## Behavior

Throughout, a block **displays** a journal when its own scope would render that
journal's notes (see Design notes for the exact scope per block).

### Scenario: following a note that is off-screen

- **Given** a block is set to follow the active note
- **And** the user opens a note of a journal the block displays
- **And** that note's date is not within the block's currently shown range
- **Then** the block moves so the note's period is in view

### Scenario: opening a note that is already visible

- **Given** a block is set to follow the active note
- **And** the user opens a note of a journal the block displays
- **And** that note's date is already within the block's currently shown range
- **Then** the block does not move

### Scenario: opening a note the block does not display

- **Given** a block is set to follow the active note
- **And** the block has already moved to track an earlier note
- **When** the user opens a note whose journal the block does not display
- **Then** the block returns to the shared reference date

### Scenario: following turned off

- **Given** a block is not set to follow the active note
- **When** the user switches between notes
- **Then** the block stays on the shared reference date and does not move

### Scenario: manual navigation wins

- **Given** a block is following and has moved to track a note
- **When** the reference date changes through manual navigation
- **Then** the block returns to the reference date

### Scenario: the view is opened while a journal note is active

- **Given** a block is set to follow the active note
- **And** a note of a journal the block displays is already active
- **When** the view opens
- **Then** the block starts focused on that note's period rather than today

### Scenario: no active journal note

- **Given** a block is set to follow the active note
- **And** the active note is not a journal entry (or there is none)
- **Then** the block returns to the shared reference date

## Design notes (implementation vocabulary)

Domain scenarios above stay in domain language; concrete names live here.

### Shared focus composable

- **`useFollowActiveDate`** — new composable beside `active-entry.ts` in
  `src/notes-calendar/`. Owns the local-focus logic so every block shares one
  implementation. Signature:

  ```ts
  useFollowActiveDate(opts: {
    refDate: Ref<AnchorString>;
    enabled: () => boolean;                        // config.followActiveDate
    inScope: (journalName: string) => boolean;     // does this block display it?
    isVisible: (anchor: AnchorString) => boolean;  // already inside my window?
  }): ComputedRef<AnchorString>                     // the block's focus
  ```

  Internals:
  - `localFocus = shallowRef<AnchorString | null>(null)`
  - `focus = computed(() => (enabled() ? localFocus.value : null) ?? refDate.value)`
    — disabling immediately drops the local override.
  - `watch(refDate, () => { localFocus.value = null })` — manual navigation wins
    and re-syncs the block to the reference date.
  - `watch(activeEntry.active, …, { immediate: true })` — on active-note change
    and at mount, when `enabled()`:
    - `a === null || !inScope(a.journalName)` → `localFocus.value = null`
      (return to the reference date);
    - else `isVisible(a.anchor)` → return (already visible, do not move);
    - else → `localFocus.value = a.anchor` (follow).

  `activeEntry` is the existing `ActiveEntryViewModel` (`{ journalName, anchor }`).
  Each block feeds the returned `focus` into its existing window computation in
  place of `context.refDate`.

### Per-block wiring

- **month-calendar / week-calendar** (`MonthCalendarBlock.vue`,
  `WeekCalendarBlock.vue`): `usePeriodWindow(kind, focus, before, after)` where
  `focus` comes from the composable.
  - `inScope = (name) => scope.fixed.value.includes(name)` — the non-custom
    journals, i.e. exactly the kinds the grid renders as cells (day, week number,
    month/quarter/year headers). `scope.fixed` already excludes custom-interval
    journals, which the grid does not draw; opening a custom-interval note
    therefore resets a calendar block to the reference date.
  - `isVisible(anchor)`: the anchor's `CalendarDate` lies within the block's
    rendered span. For **month**, expand to full weeks so the check matches the
    grid's spillover exactly (v2's week-case fidelity):
    `periodOfKind("week", months[0].start).start …
periodOfKind("week", months.at(-1).end).end`. For **week**, the span is
    `weeks[0].start … weeks.at(-1).end`. Compare with
    `CalendarDate.isBefore`/`isAfter`.

- **custom-intervals** (`CustomIntervalsBlock.vue`): the window becomes
  `resolveWindow(config.window, focus)`.
  - `inScope` = the block's displayed custom journals — the same
    `scope.custom` filtered by `config.journals` it already computes for
    `sections`.
  - `isVisible(anchor)` = anchor within `[window.start, window.end]`.

- **markdown-template** (`MarkdownTemplateBlock.vue`): degenerate — no window and
  no manual navigation of its own. It already focuses `active ?? refDate`
  (the `rendered` computed). The only change is to gate that on the flag:
  `focus = enabled() ? (active?.anchor ?? refDate) : refDate`. It follows any
  active entry (no journal scope), preserving today's behavior when the flag is
  on. The `?? refDate` already yields the reset-to-reference-date behavior when
  there is no active journal entry, so no window/visibility logic is needed and
  it does not use `useFollowActiveDate`.

### Schema and config UI

- Add `followActiveDate: v.optional(v.boolean(), true)` to
  `calendarBlockBaseSchema` (covers month + week), to the `customIntervalsBlock`
  schema, and to the `markdownTemplateBlock` schema. Add `followActiveDate: true`
  to each block's `defaultConfig` for explicitness.
- Add a `UiSettingRow` + `UiToggle` "Follow active note" row in the shared
  `CalendarBlockConfigFields.vue` (month + week inherit it), and in
  `CustomIntervalsBlockConfig.vue` and `MarkdownTemplateBlockConfig.vue`.
- One new paraglide message: `view_block_config_follow_active_date_label`.

### Persistence

Local focus is not persisted. On reopen, a following block snaps to the active
journal note it displays (immediate follow at mount); non-following blocks
restore the persisted reference date. This is the intended follow contract —
following blocks track the note, not their last manual position.

### Deliberate divergence from v2

v2 left the calendar where it was when the active note became a non-journal note
(its watch returned early on no active journal note). Here a following block
instead **returns to the reference date** whenever the active note is not a
journal entry the block displays. In a mixed-block view this means opening a note
only one block displays returns the other blocks to the reference date — an
accepted consequence of per-block local focus.

## Non-goals

- Moving the shared reference date from following, or any cross-block
  coordination. Following is strictly local to each block.
- Adding follow to non-windowed blocks (toolbar buttons, nav blocks). They have
  no focus to move.
- Preserving v2's "a day note always recenters even within the shown month"
  jitter. Under windowed blocks the uniform "recenter only when off-screen" rule
  supersedes v2's per-journal-type branching, which no longer maps coherently
  when a block renders one period kind and the active note is another.

## Testing

- Unit: `useFollowActiveDate` — one behavior per test — recenters when the
  active anchor is off-window; stays put when it is already visible; ignores
  off-scope journals; ignores changes while disabled; resets to the reference
  date when the reference date changes.
- Component: a calendar block recenters on an active-note change while following;
  stays put when the setting is off.
- e2e (v3-ai wdio, runtime-touching): open a view with a calendar block, open a
  journal note far from today → the block recenters to show it; with the setting
  off → it does not move.
