# v3 Calendar UI (Date Picker) — Design

**Stage:** Port v2's date-picker family to v3 as a Period-aware, locale-stable
date-picker UI living in the calendar feature.
**Date:** 2026-05-16
**Status:** Draft for review

## Purpose

v2 ships a date picker used as a form input across journal settings:
`DatePicker.vue` (trigger button) + `DatePicker.modal.vue` (granularity-aware
modal) + four grid views (`CalendarMonthView`, `CalendarQuarterView`,
`CalendarYearView`, `CalendarDecadeView`) plus a handful of leaf
components (`CalendarGrid`, `CalendarWeekdays`, `CalendarButton`,
`FormattedDate`). It v-models `string` (YYYY-MM-DD), takes optional
`min`/`max` strings, and routes all date math through global-mutating
`moment.updateLocale` + `.startOf`/`.add` chains.

The v3 calendar layer ([[2026-05-13-v3-calendar-design]]) and the calendar
settings layer ([[2026-05-14-v3-calendar-settings-design]]) replaced
mutable global moment with immutable `CalendarDate`, the `Period` union,
the `Clock`, an `OpenInterval` primitive, and a `Calendar` class that
owns a private locale. The picker UI is the last piece of v2's calendar
surface that still talks moment directly. This spec ports it.

The current v3 journal settings UI uses three placeholder
`<UiTextInput placeholder="YYYY-MM-DD">` fields with inline regex error
scaffolding for `timeline.start`, `timeline.end.date`, and
`numbering.anchorDate`, plus a fourth in `AddJournalModal` for custom
journals' `anchorDate`. This spec replaces all four with the new
`DatePicker`.

Three concrete v2 pains the v3 picker resolves by construction:

1. **Moment in UI code.** v2's picker calls `.startOf("week")`,
   `.add(1, "month")`, etc., directly. v3's picker never imports moment;
   navigation and selection go through `Period.previous()`/`.next()` /
   `containing(date)`.
2. **Cross-year week anchor.** v2 stored a week selection as
   `startOf("week")`, which produces the same Monday for the Dec-30 → Jan-5
   week regardless of which year owns it (see [[project_v2_week_anchor_bug]]).
   v3's picker emits `Period.anchor` — for `WeekPeriod` that is the
   locale's doy day (e.g. Thursday for ISO `doy=4`), the same day v3 uses
   for week-number stability. Round-tripping is locale-correct.
3. **String-coupled UI contract.** v2's picker v-models a string; format
   leakage and parsing-bug landmines follow. v3's picker v-models
   `Period | null`. Storage shape (`AnchorString`) lives behind a
   per-call-site composable, not inside the picker.

## Non-goals

- **No port of the calendar leaf view** (v2's `calendar-view/CalendarView.vue`,
  `NotesMonthView.vue`, `NotesWeekView.vue`, the `notes-calendar/decorations/`
  family). The leaf view depends on the `calendarView` settings slice and a
  journal-index decoration model that v3 has not built yet; it is its own
  spec.
- **No `FormattedDate.vue` or `CalendarButton.vue` ports.** Both are
  one-liners and are inlined.
- **No optional week-number column in `CalendarMonthView`.** v2 toggles
  this via `plugin.calendarViewSettings.weeks`, part of the not-yet-ported
  `calendarView` slice. The picker ships without the column. Adding it
  becomes a prop later if the leaf view's settings land.
- **No "click any day to pick a week" fallback** from v2. The new
  `CalendarWeekView` makes week picking explicit; days are not click
  targets when `picking="week"`.
- **No reactive `bounds` while the modal is open.** `ModalService.open`
  snapshots props on open. None of the four current callers mutate
  bounds during open. Reactive bounds become a `ModalService` follow-up
  when a real caller needs them.
- **No date arithmetic API on `CalendarDate`.** Navigation continues to
  flow through `Period.previous/next` and `XxxPeriod.containing(date)`
  factories — per [[2026-05-13-v3-calendar-design]]'s "no arithmetic on
  CalendarDate" non-goal.
- **No range-end picker variant.** Each picker call site picks one
  period; pairs of pickers compose at the consumer level (e.g.,
  `timeline.start` and `timeline.end.date` are two `DatePicker` elements
  with the second bounded by the first).
- **No v2 → v3 settings migration.** v3 is a rewrite; consumer call
  sites already use v3 `AnchorString`.
- **No tests for**: barrel exports, `calendarUiModule` registration,
  `CalendarGrid.vue` CSS, `DatePickerInvariantError instanceof Error`,
  the fake `ModalService`, or vee-validate behavior in callers.

## Architecture

### Module layout

```
src/calendar/ui/
  DatePicker.vue                    # trigger button (consumer-facing)
  DatePickerModal.vue               # modal: view state + descent + nav
  CalendarMonthView.vue             # month → days (7-col)
  CalendarWeekView.vue              # month → weeks (1-col)   ← new vs v2
  CalendarQuarterView.vue           # year → 4 quarters       (2-col)
  CalendarYearView.vue              # year → 12 months        (3-col)
  CalendarDecadeView.vue            # decade → 10 years       (4-col)
  CalendarGrid.vue                  # presentational rows/cols primitive
  use-calendar-grid.ts              # cells iterator + selection/disabling
  date-picker-modal-definition.ts   # defineModal definition
  errors.ts                         # DatePickerInvariantError
  module.ts                         # calendarUiModule (zero-arg)
  testing.ts                        # render helpers for component tests
  index.ts                          # barrel: DatePicker, calendarUiModule
```

`use-anchor-field.ts` (the `AnchorString` ↔ `Period` bridge) lives in
`src/journals/settings/ui/` — it is a journal-storage helper, not a
calendar UI primitive.

### Dependencies (via DI composables)

- `useCalendar()` → `Calendar` — locale-aware factories for `CalendarDate`
  and `Period`. Used to construct outer periods from the modal's
  `refDate`, and to read `weekdays()` for the month view header.
- `useClock()` → `Clock` — only for `today()` fallback when no
  `selected` is provided to the modal, and for the composable's
  "today" cell flag.
- `useModalService()` → `ModalService` — `DatePicker` opens the modal
  definition; the modal SFC consumes `useModal<Period>()` for
  `submit(period)` / `cancel()`.

No `moment` import in `src/calendar/ui/**`. All date math goes through
`CalendarDate` / `Period` / `OpenInterval` / `Calendar`.

### Wiring

`src/calendar/ui/module.ts` exports `calendarUiModule: Module` (zero-arg,
per [[feedback_di_module_factories]]) that registers
`datePickerModalDefinition` into the `ModalService` slot. The module is
wired in `main.ts` alongside `journalsSettingsModule` and the existing
host module.

No additions to `src/calendar/module.ts` — the picker is a consumer of
`Calendar`/`Clock`, not a service exported by the calendar domain
module.

## Components

### `DatePicker.vue` — trigger button

```ts
type Picking = "day" | "week" | "month" | "quarter" | "year";

defineProps<{
  picking: Picking;
  bounds?: OpenInterval;
  placeholder?: string;
  disabled?: boolean;
}>();
defineModel<Period | null>();
```

Renders a `<UiButton>` with a calendar icon and either a formatted
label (`modelValue.format(previewFor(picking))`) or `placeholder`.
Preview formats per picking:

| picking     | preview        |
| ----------- | -------------- |
| `"day"`     | `"YYYY-MM-DD"` |
| `"week"`    | `"YYYY-[W]w"`  |
| `"month"`   | `"YYYY-MM"`    |
| `"quarter"` | `"YYYY-[Q]Q"`  |
| `"year"`    | `"YYYY"`       |

On click, opens `datePickerModalDefinition` with `{ picking, bounds,
selected: modelValue }`. On a submitted result (`AsyncResult` Ok),
assigns to `modelValue`. On `ModalCancelled` (dismiss), no change.

The picker has no clear UI. Callers that need a "clear" gesture wrap
the picker with an adjacent icon button that assigns `null` to the
model — `JournalEditSubpage` already follows this pattern for its
current text-input fields and keeps it after the port. `disabled`
suppresses the click handler (no modal opens).

### `DatePickerModal.vue` — modal shell

Payload (from `ModalDefinition`):

```ts
interface DatePickerModalProps {
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}
```

Submits a `Period`; `useModal<Period>()` provides `submit` / `cancel`.

State:

- `currentView: View` — initially `targetView(picking)`.
- `refDate: CalendarDate` — initially `selectedForHighlight?.anchor ?? clock.today()`.
- `selectedForHighlight: Period | null` — defensive narrowing of
  `selected` to the picking-target kind; mismatched kinds become `null`
  for highlighting purposes only (the `refDate` still derives from
  `selected?.anchor`).

Three pure ts-pattern tables drive behavior:

```ts
function targetView(picking: Picking): View; // day→month, week→week,
// month→year,
// quarter→quarter,
// year→decade

function outerPeriod(view: View, refDate: CalendarDate): Period;
// month → MonthPeriod.containing(refDate)
// week  → MonthPeriod.containing(refDate)   (WeekView's outer is a month)
// year, quarter → YearPeriod.containing(refDate)
// decade → DecadePeriod.containing(refDate)

function descend(view: View, picking: Picking, cell: Period): { nextView: View; nextRef: CalendarDate };
// decade + picking=month   → { year,    cell.anchor }
// decade + picking=quarter → { quarter, cell.anchor }
// decade + picking=day|week → { year,   cell.anchor }
// year   + picking=day     → { month,   cell.anchor }
// year   + picking=week    → { week,    cell.anchor }
// (target-view clicks are handled before descend is called)
// unreachable inputs (e.g., year + quarter) throw
// DatePickerInvariantError via the exhaustive match.

function ascend(view: View): View | null;
// month → year, week → year, year → decade, quarter → decade,
// decade → null
```

Layout: `<header>` with prev / title / next + drill-up button (when
`ascend(currentView)` is non-null), then `<component :is="viewFor(currentView)" />`.
The view receives `outerPeriod(currentView, refDate)`, `selectedForHighlight`,
and `bounds`. Cell-click handler resolves target-vs-intermediate by
`currentView === targetView(picking)`.

Prev/next buttons are **hidden** when bounds exist and the step would
land entirely outside (matches v2): the next outer period must overlap
`bounds`. Same `bounds.overlapsPeriod(...)` predicate as cell disabling.

### Granularity views

Each view is a thin presentational shell over `useCalendarGrid` +
`CalendarGrid`. Shared prop shape:

```ts
defineProps<{
  outerPeriod: P; // the period this view paginates
  selected: Period | null;
  bounds?: OpenInterval;
}>();
defineEmits<{ select: [cell: P_CELL] }>();
```

| Component             | Outer `P`      | Cell `P_CELL`   | Iterator                                                               | Format                                                       |
| --------------------- | -------------- | --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `CalendarMonthView`   | `MonthPeriod`  | `DayPeriod`     | `[...m.weeks()].flatMap(w => [...w.days()].map(DayPeriod.containing))` | `"D"`                                                        |
| `CalendarWeekView`    | `MonthPeriod`  | `WeekPeriod`    | `[...m.weeks()]`                                                       | label: `"[W]w · MMM D"` + `–` + `period.end.format("MMM D")` |
| `CalendarQuarterView` | `YearPeriod`   | `QuarterPeriod` | `[...y.quarters()]`                                                    | `"[Q]Q"`                                                     |
| `CalendarYearView`    | `YearPeriod`   | `MonthPeriod`   | `[...y.months()]`                                                      | `"MMM"`                                                      |
| `CalendarDecadeView`  | `DecadePeriod` | `YearPeriod`    | `[...d.years()]`                                                       | `"YYYY"`                                                     |

`CalendarMonthView` also renders a weekday-header row via
`useCalendar().weekdays()`; `outsidePredicate` flags days from neighbor
months. None of the other views set `outsidePredicate`.

### `CalendarGrid.vue` — presentational primitive

```ts
defineProps<{ columns: number }>();
```

CSS grid container with `grid-template-columns: repeat(${columns}, 1fr)`,
a default slot for cells, and an optional `#header` slot. No state, no
date awareness. ~15 lines of SFC. Not tested directly.

### `use-calendar-grid.ts` — composable

```ts
export interface Cell {
  readonly period: Period;
  readonly label: string;
  readonly key: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isOutside: boolean;
  readonly isToday: boolean;
}

export function useCalendarGrid(opts: {
  cells: MaybeRefOrGetter<readonly Period[]>;
  formatPattern: string;
  selected: MaybeRefOrGetter<Period | null>;
  today: MaybeRefOrGetter<CalendarDate>;
  bounds?: MaybeRefOrGetter<OpenInterval | undefined>;
  outsidePredicate?: (period: Period) => boolean;
}): ComputedRef<readonly Cell[]>;
```

Pure (no DI imports — `today` is passed in by each view via
`useClock().today()`).

Rules:

- `isSelected`: `selected?.kind === cell.period.kind && cell.period.isSame(selected)`.
  Cross-kind never matches.
- `isDisabled`: `bounds ? !bounds.overlapsPeriod(cell.period) : false`.
- `isOutside`: `outsidePredicate?.(cell.period) ?? false`.
- `isToday`: `cell.period.contains(today)`.
- `label`: `cell.period.format(formatPattern)` for single-token patterns;
  `CalendarWeekView` builds its compound label in its own template since
  it needs both `period.format(...)` and `period.end.format(...)`.
- `key`: `period.kind + ":" + period.anchor.toAnchor()`.

### `date-picker-modal-definition.ts`

```ts
export const datePickerModalDefinition = defineModal<DatePickerModalProps, Period>({
  id: "calendar.date-picker",
  title: () => m.calendar_date_picker_title(),
  width: 400,
  component: DatePickerModal,
});
```

`Period` as `TResult` is the discriminated union — callers narrow at use
site if they care about the kind.

### `errors.ts`

```ts
export class DatePickerInvariantError extends Error {
  readonly currentView: View;
  readonly picking: Picking;
  readonly cellKind: PeriodKind;

  constructor(view: View, picking: Picking, cellKind: PeriodKind) {
    super(`unreachable descent: view=${view} picking=${picking} cell=${cellKind}`);
    this.name = "DatePickerInvariantError";
    this.currentView = view;
    this.picking = picking;
    this.cellKind = cellKind;
  }
}
```

Per [[feedback_errors_in_errors_ts]], even invariant errors live in
errors.ts.

### `module.ts`

```ts
export const calendarUiModule: Module = {
  // registers datePickerModalDefinition into ModalService's slot
};
```

Zero-arg per [[feedback_di_module_factories]].

### `index.ts`

Public re-exports only (per [[feedback_barrel_files]]):

```ts
export { default as DatePicker } from "./DatePicker.vue";
export { calendarUiModule } from "./module";
```

## `useAnchorField` — consumer-side bridge

Lives in `src/journals/settings/ui/use-anchor-field.ts`:

```ts
export type Picking = "day" | "week" | "month" | "quarter" | "year";

export function useAnchorField(opts: {
  anchor: Ref<AnchorString>;
  picking: MaybeRefOrGetter<Picking>;
}): WritableComputedRef<Period | null> {
  return computed({
    get: () => {
      const a = opts.anchor.value;
      if (!a) return null;
      return periodContaining(toValue(opts.picking), CalendarDate.fromAnchor(a));
    },
    set: (period) => {
      opts.anchor.value = (period ? period.anchor.toAnchor() : "") as AnchorString;
    },
  });
}

function periodContaining(picking: Picking, date: CalendarDate): Period {
  return match(picking)
    .with("day", () => DayPeriod.containing(date))
    .with("week", () => WeekPeriod.containing(date))
    .with("month", () => MonthPeriod.containing(date))
    .with("quarter", () => QuarterPeriod.containing(date))
    .with("year", () => YearPeriod.containing(date))
    .exhaustive();
}
```

The setter writes `period.anchor.toAnchor()` — for `WeekPeriod` this is
the locale's doy day, which is what makes cross-year weeks round-trip
to the same `AnchorString`.

## Consumer refactors

Four sites today; three more potentially follow when leaf-view ports
land.

| Call site                                         | `picking` derivation                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `AddJournalModal.vue` (custom anchor)             | `"day"` (custom anchors are always specific dates)                              |
| `JournalEditSubpage.vue` (`timeline.start`)       | `write.type === "custom" ? "day" : write.type`                                  |
| `JournalEditSubpage.vue` (`timeline.end.date`)    | same as above; `bounds = OpenInterval.from(start)` when `timeline.start` is set |
| `JournalEditSubpage.vue` (`numbering.anchorDate`) | same as above                                                                   |

Each site:

```ts
const startPicking = computed<Picking>(() => (config.value.write.type === "custom" ? "day" : config.value.write.type));
const startModel = useAnchorField({
  anchor: toRef(() => config.value.timeline.start),
  picking: startPicking,
});
```

```vue
<DatePicker v-model="startModel" :picking="startPicking" />
```

The existing inline `anchorRegex` checks and the
`m.journal_anchor_format_error()` error messages are deleted at each
site — the picker cannot produce an invalid `AnchorString`. The
existing range validations in `JournalConfigSchema` stay.

## Data flow

### Open

1. User clicks the trigger button.
2. `DatePicker.vue` calls `useModalService().open(datePickerModalDefinition,
{ picking, bounds, selected: modelValue })`.
3. `DatePickerModal.vue` mounts. `currentView =
targetView(picking)`; `refDate = selectedForHighlight?.anchor ??
clock.today()`.

### Cell click on target view

1. View emits `select(cellPeriod)`.
2. `currentView === targetView(picking)` — modal calls
   `useModal().submit(cellPeriod)`. The open-promise resolves Ok.
3. `DatePicker.vue` assigns to `modelValue`. Reactivity flows out to
   the consumer's `useAnchorField`-backed computed, which writes
   `period.anchor.toAnchor()` to the underlying `AnchorString` ref.

### Cell click on intermediate view (descent)

1. View emits `select(cellPeriod)`.
2. `currentView !== targetView(picking)` — modal computes
   `(nextView, nextRef) = descend(currentView, picking, cellPeriod)`,
   assigns to state. View component swaps; the same `selected` /
   `bounds` props flow into the new view.

### Header drill-up

When `ascend(currentView)` is non-null, the header title is rendered
as a button. Click sets `currentView = ascend(currentView); refDate`
stays. The same `refDate` resolves to a coarser outer period (e.g.,
the year containing the month).

### Prev / next

`previous()`: `refDate = outerPeriod(currentView, refDate).previous().anchor`.
`next()`: symmetric. Buttons are hidden when `bounds &&
!bounds.overlapsPeriod(nextOuterPeriod)`.

### Dismiss

ESC, click-outside, or programmatic cancel → `useModal().cancel()` →
the open-promise resolves with `ModalCancelled`. `DatePicker.vue`
matches Err and does not write `modelValue`.

### Round-trip

```
AnchorString "2026-01-08"           (consumer ref)
  → useAnchorField.get
  → CalendarDate.fromAnchor → WeekPeriod.containing(date)
  → DatePicker v-model: WeekPeriod (anchor = the locale's doy day)
  → user picks a different week in the modal
  → submit(WeekPeriod)
  → DatePicker assigns modelValue
  → useAnchorField.set
  → period.anchor.toAnchor() → AnchorString "2026-01-15"
  → written back to the consumer ref
```

For a Dec-30 → Jan-5 week with ISO `doy=4`, the stored string is the
Thursday (Jan 1), and reading it back returns the same `WeekPeriod`.
That is the [[project_v2_week_anchor_bug]] fix expressed at the picker
boundary.

## Error handling

Most failures are unrepresentable by construction:

- **`AnchorString` parsing.** `JournalConfig`'s valibot schema rejects
  malformed input at load. `CalendarDate.fromAnchor` is total and
  trusts the brand. No defensive parsing inside `useAnchorField`.
- **`OpenInterval` construction.** `OpenInterval.between(start, end)`
  is the only failing constructor and already returns
  `Result<OpenInterval, IntervalError>`. The picker never constructs
  intervals; callers use `from(start)` / `until(end)` which are total.
- **Descent table.** `descend` is a ts-pattern `match(...).exhaustive()`.
  Type-reachable but runtime-unreachable inputs throw
  `DatePickerInvariantError` from the exhaustive arm.
- **`selected` kind ≠ picking-target kind.** The modal narrows
  `selectedForHighlight` to `null` when kinds disagree. `refDate` still
  derives from `selected?.anchor`. `useAnchorField` cannot produce this
  mismatch by construction; the guard exists for callers that bypass
  the composable.

`DatePickerInvariantError` is the only new error this spec introduces.
No log-on-error, no fallback re-parse, no retry.

## Calendar-layer additions

This spec adds two methods to the calendar feature module:

1. **`YearPeriod.quarters(): Iterable<QuarterPeriod>`** —
   mirrors the existing `YearPeriod.months()`. Used by
   `CalendarQuarterView`. Lives in `src/calendar/period-year.ts`.
2. **`OpenInterval.overlapsPeriod(p: Period): boolean`** — first
   range-algebra method on `OpenInterval`. Returns `true` when any day
   in `p` lies inside the interval. Used by `useCalendarGrid` for cell
   disabling and by `DatePickerModal` for prev/next button visibility.
   Lives in `src/calendar/open-interval.ts`. Consistent with
   [[2026-05-13-v3-calendar-design]]'s "add range algebra when a caller
   needs it" stance — this is the first caller.

Both additions are independent of the UI and tested in their existing
test files (`period-year.test.ts`, `open-interval.test.ts`).

## Testing

Per [[feedback_one_behavior_per_test]], [[feedback_black_box_assertions]],
[[feedback_test_descriptions]], [[feedback_testing_library_for_components]],
[[feedback_nested_describes]], [[feedback_testing_dir_layout]],
[[feedback_no_wiring_tests]], [[feedback_no_trivial_tests]],
[[feedback_no_mock_fake_tests]], [[feedback_no_baked_in_error_simulation]].

### `use-calendar-grid.test.ts`

One behavior per test, each as a single observable assertion:

- selects a cell whose period matches the selection (same kind)
- does not select across period kinds
- disables a cell whose period is outside bounds
- does not disable a cell whose period overlaps bounds
- marks outside cells via the predicate
- marks today when cell period contains today
- applies the format pattern to label

### `use-anchor-field.test.ts`

- empty anchor maps to null
- non-empty anchor with picking=day yields a DayPeriod
- non-empty anchor with picking=week yields a WeekPeriod
- non-empty anchor with picking=month yields a MonthPeriod
- non-empty anchor with picking=quarter yields a QuarterPeriod
- non-empty anchor with picking=year yields a YearPeriod
- assigning null clears the underlying anchor
- assigning a period writes period.anchor.toAnchor() to the anchor ref
- changing picking recomputes the period kind
- round-trips a cross-year week without drifting the stored anchor

### `DatePicker.test.ts`

- shows the placeholder when modelValue is null
- shows a formatted label per picking when modelValue is set
- opens the modal on click (asserts via fake `ModalService.open`)
- preserves modelValue on dismiss
- updates modelValue on submit

### `DatePickerModal.test.ts`

Nested describes per [[feedback_nested_describes]]:

```
DatePickerModal
  initial view
    opens at the month view when picking is day
    opens at the week view when picking is week
    opens at the year view when picking is month
    opens at the quarter view when picking is quarter
    opens at the decade view when picking is year
  target click
    submits the clicked period when in target view
  descent
    descends from decade to year view when clicking a year for day picking
    descends from year to month view when clicking a month for day picking
    descends from decade to quarter view when clicking a year for quarter picking
    (...one per non-trivial descent case)
  drill up
    advances to the parent view when the title is clicked
  navigation
    moves to the previous outer period when prev is clicked
    moves to the next outer period when next is clicked
    hides prev when the previous outer period does not overlap bounds
    hides next when the next outer period does not overlap bounds
  invariants
    throws DatePickerInvariantError on unreachable descent input
```

### View component tests

`CalendarMonthView.test.ts`, `CalendarWeekView.test.ts`,
`CalendarQuarterView.test.ts`, `CalendarYearView.test.ts`,
`CalendarDecadeView.test.ts` — each:

- emits select with the clicked cell's period
- disables a cell when bounds do not overlap its period
- marks the selected cell
- renders the expected cell count
- (`CalendarMonthView` only) renders the first weekday matching the
  Calendar's `dow` configuration

### Calendar-layer additions

In existing test files:

- `period-year.test.ts`: `YearPeriod.quarters()` yields four quarters
  spanning Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec.
- `open-interval.test.ts`: `overlapsPeriod` returns true when any day
  is shared; false when the period is entirely before; false when
  entirely after; respects unbounded start; respects unbounded end.

### Consumer refactors

- `AddJournalModal.test.ts` and `JournalEditSubpage.test.ts` lose
  "rejects invalid YYYY-MM-DD" tests for the four migrated fields
  (the input is no longer text). Each gains one test:
  "selects an anchor via the picker and the config receives the new
  value".
- No new tests for the wiring itself.

### Test infrastructure

Shared DI render helper in `src/calendar/ui/testing.ts` — provides a
default `Calendar` + `Clock` + fake `ModalService` for component tests.
Single file, no `mocks/` or `fixtures/` directory ([[feedback_testing_dir_layout]]).

## Follow-ups

- **Reactive bounds during open** — the picker currently snapshots
  bounds at open time. If a future caller needs the modal to react to
  bound changes mid-open, `ModalService` needs a follow-up to plumb
  reactive props through `useModal`. Captured here; not done now.
- **Week-number column in `CalendarMonthView`** — adds a `showWeekNumbers`
  prop once the leaf view ports the `calendarView` settings slice.
- **Range picker** — if a caller needs to pick `[start, end]` in one
  modal (instead of two pickers), add a `pickingRange` variant of the
  modal definition. Out of scope here.
- **Leaf calendar view port** — `CalendarView.vue`, `NotesMonthView.vue`,
  `NotesWeekView.vue`, and the decorations family land in a separate
  spec when their prerequisites (journal-index decoration model,
  `calendarView` settings slice) exist.
