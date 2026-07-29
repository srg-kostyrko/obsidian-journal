# The view date follows the active note instead of being overridden by it

Supersedes `2026-07-08-follow-active-date-view-blocks-design.md`, whose central
premise — "following is per-block and local; following never mutates the shared
reference date" — is the cause of the defect described below.

## Problem

Opening a journal note takes the journal view's date away from the user and does
not give it back. Each windowed block keeps a private focus that shadows the
view's reference date, so after a note opens, what the user sees and what the
navigation controls act on are two different dates:

- The grid shows March (the opened note), the reference date is still July.
  "Next month" steps July → August, and the grid jumps from March to August
  instead of to April.
- "Today" writes today's date while the reference date is already today. Nothing
  changes, so the private focus is never cleared and the grid stays parked on the
  followed note. The button looks broken.
- The date picker opens pre-selected on a period around the reference date rather
  than around the period on screen.
- The markdown template block's `{{date}}` always prefers the active note and can
  never be moved by navigation at all.

## Goal

The active note's date **seeds** the view's date at the moment the note opens,
and is an ordinary view date from then on — navigable, pickable, and shared by
every block.

## Behavior

A view **covers** a journal when that journal is in the view's shelf scope.

### Scenario: opening a note sets the view's date

- **Given** a view is set to follow the active note
- **When** the user opens a note of a journal the view covers
- **Then** the view's date becomes that note's date

### Scenario: the seeded date can be navigated away from

- **Given** the view's date was set by opening a note
- **When** the user steps the date forward by one month
- **Then** the view moves to one month after that note's date

### Scenario: opening a note that is already on screen does not scroll the grid

- **Given** a calendar block is showing a range of periods
- **When** the user opens a note whose date is inside that range
- **Then** the view's date becomes that note's date
- **And** the block keeps showing the same range

### Scenario: opening a note that is off screen scrolls the grid

- **Given** a calendar block is showing a range of periods
- **When** the user opens a note whose date is outside that range
- **Then** the block moves so that note's period is in view

### Scenario: navigating always re-centers the grid

- **Given** a calendar block is showing a range of periods
- **When** the user changes the view's date through navigation
- **Then** the block lays its range out around the new date, whether or not the
  old range already contained it

### Scenario: following turned off

- **Given** a view is not set to follow the active note
- **When** the user switches between notes
- **Then** the view's date does not change

### Scenario: opening a note the view does not cover

- **Given** the view's date was set by opening a note
- **When** the user opens a note of a journal the view does not cover, or a note
  that is not a journal entry at all
- **Then** the view's date does not change

### Scenario: the view is opened while a journal note is active

- **Given** a view is set to follow the active note
- **And** a note of a journal the view covers is already active
- **When** the view opens
- **Then** the view starts on that note's date rather than on today

### Scenario: a week note's date renders in its own terms

- **Given** the view's date was set by opening a note of a weekly journal
- **Then** a markdown template block renders `{{date}}` as the day that journal
  uses to represent that week, not as the week's start

## Design notes (implementation vocabulary)

Domain scenarios above stay in domain language; concrete names live here.

### One date, plus a layout rule

`ViewContext.refDate` becomes the view's **selected date** and is written
unconditionally when an in-scope journal note opens. The "don't scroll for a note
that is already visible" rule moves down into each calendar block, where it
governs **window layout** rather than a second date:

> A block lays its window out around `refDate`. When `refDate` moved because the
> user navigated, the window re-centers. When it moved because a note opened, the
> window re-centers only if the new date fell outside it.

The block therefore holds one piece of local state — which periods are currently
laid out — and never a competing date. This is what removes the defect: every
navigation control reads and writes the same value the user is looking at.

### ViewContext delta

One addition, read-only:

```ts
export type RefDateOrigin = "navigate" | "follow";

readonly refDateOrigin: Readonly<Ref<RefDateOrigin>>;
```

`setRefDate(date)` keeps its exact signature and always means `"navigate"`; no
call site changes. The follow path is internal to the leaf root, which owns both
`leafState.refDate` and the origin, so no public "follow" setter is needed.

Encoding inside `buildRootComponent` (`view-leaf.ts`): a setup-local
`followedAnchor = shallowRef<AnchorString | null>(null)`. The follow writer sets
it to the date it just wrote; `setRefDate` clears it to `null` before writing.
`refDateOrigin` is then
`computed(() => leafState.refDate === followedAnchor.value ? "follow" : "navigate")`.
This stays correct for dates arriving through Obsidian's `setState` on layout
restore — they do not match `followedAnchor`, so a restored date re-centers, which
is what a restore should do.

`preview-view-context.ts` and `views/testing.ts` gain a constant `"navigate"`
origin; the preview's `setRefDate` stays a noop, and the follow watcher is not
mounted there.

### The follow watcher

`src/views/use-follow-active-note.ts`, called from `buildRootComponent`'s setup:

```ts
useFollowActiveNote(options: {
  enabled: () => boolean;                     // view.followActiveDate
  inScope: (journalName: string) => boolean;  // useShelfScope(context.shelf).all
  onFollow: (date: AnchorString) => void;
}): void
```

It watches `ActiveEntryViewModel.active` with `{ immediate: true }` so a note that
is already open when the view mounts seeds the date. On an in-scope entry it calls
`onFollow`; on `null` or an out-of-scope entry it does nothing — there is no
shadow state to clear, so the view simply stays where it is.

The date it passes is **the entry's representative day**, not its raw anchor:
`cycle.representativeOf(journalName, anchor)`, falling back to the anchor. For day,
month, quarter and year journals — and for custom intervals, which are day-kind
periods at their start — these are the same value. For a week journal the
representative is `start + (doy - 1)` days, which is inside the same week, so grid
windows, period badges and cell highlights are unaffected, while `{{date}}` in a
markdown template renders the week in the journal's own terms. `nav-row-context.ts:49`
already uses this exact mapping, so it is an established pattern rather than a new
one.

The leaf root's `onFollow` sets `followedAnchor.value` and `leafState.refDate` to
that date.

### The window-anchor composable

`src/views/blocks/ui/use-window-anchor.ts`, beside the existing
`follow-visibility.ts`:

```ts
useWindowAnchor(options: {
  refDate: MaybeRefOrGetter<AnchorString>;
  origin: MaybeRefOrGetter<RefDateOrigin>;
  contains: (date: AnchorString, windowAnchor: AnchorString) => boolean;
}): ComputedRef<AnchorString>
```

Internals: a `shallowRef` seeded from `refDate`; a watcher on `refDate` that
re-seeds it when the origin is `"navigate"` **or** `contains(next, current)` is
false. `src/notes-calendar/use-follow-active-date.ts` and its test file are
deleted.

Block wiring — each block passes its existing predicate as `contains` and feeds
the result into its existing window computation, exactly where it feeds `focus`
today:

- `MonthCalendarBlock.vue` — `monthWindowContains(date, anchor, config.before, config.after)`
- `WeekCalendarBlock.vue` — `weekWindowContains(date, anchor, config.before, config.after)`
- `CustomIntervalsBlock.vue` — `spanContains(date, …resolveWindow(config.window, anchor))`

`MarkdownTemplateBlock.vue` has no window and drops its `ActiveEntryViewModel` and
`CycleService` dependencies entirely: `rendered` binds `{{date}}` to
`CalendarDate.fromAnchor(viewContext.refDate.value)`.

`DefinedNavigationItem.vue` keeps preferring the active entry's raw anchor as its
search reference — the nearest-existing search is anchor-exact — but its fallback
changes from today to `context.refDate`, so that after navigating to August with no
note open, "next note" searches from August rather than from today.

`PeriodButtonsItem.vue` needs no change; it already reads `refDate` and simply
stops being out of sync with the grid.

### Schema and config UI

`followActiveDate` moves from four block schemas to the view:

- Add `followActiveDate: v.optional(v.boolean(), true)` to `viewSchema`
  (`views/config.ts`), beside `rememberDate`, plus the collection default,
  `defaultCalendarView()`, and the `ViewsService.update` field pick
  (`views/service.ts:114`).
- Add a `UiSettingRow` + `UiToggle` to `ViewEditSubpage.vue`, following the
  `rememberDate` row exactly.
- Remove the field from `calendarBlockBaseSchema` (month + week),
  `custom-intervals-block.ts` and `markdown-template-block.ts`, from their
  `defaultConfig`s, from `calendar-block-fields.ts`, and from
  `CalendarBlockConfigFields.vue`, `CustomIntervalsBlockConfig.vue` and
  `MarkdownTemplateBlockConfig.vue`.
- New messages `view_edit_follow_active_date_label` and
  `view_edit_follow_active_date_description`; retire
  `view_block_config_follow_active_date_label`.

### No settings migration

`CURRENT_VERSION` is 4, and version 4 _is_ the unreleased v3 format — the shipped
plugin is 2.1.10 at settings version 3 — so v4 block configs exist only in
development vaults. Valibot's `v.object` strips unknown keys, so a stale
`followActiveDate` inside a block config parses without error and is ignored;
there is no reset-to-defaults risk. Hoisting a per-block flag into a view flag has
no honest mapping in any case, since nothing decides which block would win.

## Deliberate behaviour changes

1. **No snap-back.** Today, when the followed note closes or an out-of-scope note
   opens, the private focus clears and the grid jumps back to the last navigated
   date. With a single date there is nothing to clear and the view stays put. This
   matches v2, which never reset, and is the point of "so that it can be changed
   later".
2. **Custom-interval follow scope widens.** `CustomIntervalsBlock` currently scopes
   following to its own `journals` filter; the view-level watcher scopes to the
   view's shelf scope. A shelf-mate custom journal the block does not display will
   now move the view. This is the same direction the month grid already takes
   deliberately (it follows custom-interval notes on purpose).
3. **Multi-period windows can step by more than one period.** With
   `before`/`after` greater than zero: the window is Jun–Aug centred on July, the
   user opens an August note (visible, so the window holds), then presses "next
   month" — the selection goes Aug → Sep and the window re-lays out to Aug–Oct,
   moving two months for one press. This is the honest cost of separating selection
   from layout, and `navigate-step` is explicitly v2-parity `refDate.add(±n, unit)`
   (`ButtonItem.vue:105`), so it is accepted rather than special-cased.
4. **Per-block follow granularity is gone**, by decision: a shared date makes a
   per-block toggle incoherent, since a block with the flag off would still move
   when a sibling recentres the date.

## Non-goals

- Preserving v2's per-journal-type follow branching (day recenters unconditionally,
  week/quarter/year only when off-screen). The uniform "the selection always
  follows, the window re-centers only when needed" rule supersedes it.
- Adding follow to blocks with no window beyond the markdown template block.
- Any change to how the active note is detected or mapped to a journal entry
  (`WorkspaceService`, `ActiveEntryViewModel`).

## Testing

- Unit — `useWindowAnchor`, one behaviour per test: re-centers on a `"navigate"`
  change even when the old window contained the date; holds on a `"follow"` change
  inside the window; re-centers on a `"follow"` change outside it.
- Unit — `useFollowActiveNote`: follows an in-scope entry; ignores an out-of-scope
  entry; ignores a cleared active note; stays silent when disabled; follows a note
  that is already active at mount; passes the representative day for a week journal.
- Component — the four block test files drop the removed flag;
  `MarkdownTemplateBlock.test.ts` asserts `{{date}}` tracks `refDate`.
- Delete `src/notes-calendar/use-follow-active-date.test.ts`.
- e2e (v3-ai wdio, runtime-touching) — open a journal note several months from
  today, then press "next month" and assert the grid shows the month after _that
  note's_ month. The note must be far enough from today that the assertion still
  fails if the change is reverted.
