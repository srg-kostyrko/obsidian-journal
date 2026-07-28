# Bounded plugin date picker for connect-note

## Problem

`ConnectNoteModal.vue` picks the target date with a raw `<input type="date">`. Two consequences:

- The field is a browser date input, not the plugin's own picker, so it always picks a _day_ even
  when the journal writes weeks, months, quarters or years. The chosen day is silently resolved to
  the journal's anchor by `CycleService.anchorOf`, which the user never sees.
- The journal timeline is not enforced while picking. Any date is selectable; an out-of-timeline
  choice is only reported after the fact by a warning row, with Connect disabled.

`InsertJournalLinkFlow` already opens the plugin picker but passes no bounds, so it can link to a
date outside the journal's timeline.

## Goal

Both journal-date pickers use the plugin's `DatePicker`, pick at the journal's own granularity, and
offer only dates the journal will actually accept.

## Design

### Calendar layer

**`OpenInterval.unbounded()`** — new static returning an interval with neither end set. Lets a bounds
provider always return an `OpenInterval` rather than `OpenInterval | undefined`, so callers never
branch on "is there a bound at all".

**Move `use-anchor-field.ts`** (and its test) from `journals/settings/ui/` to `calendar/ui/`, exported
from the `@/calendar/ui` barrel. It is the generic adapter between an `AnchorString` field and a
`DatePicker`'s `Period | null` model, so it belongs beside `DatePicker.vue`. Leaving it under
`settings/ui` would force `notes/ui` to import across sub-features.

While moving, drop its private `periodContaining` helper in favour of `periodOfKind` from
`@/calendar` — the same function, already public.

### `pickingForWrite(write: JournalWrite): Picking`

New `src/journals/picking.ts`, exported from the journals barrel: a custom write maps to `"day"`,
every other write type maps to its own name. Pure function, type-only import of `Picking`.

Replaces the inline mapping duplicated in `insert-journal-link.flow.ts` and `TimelineSection.vue`,
and serves the new call site in `ConnectNoteModal.vue`.

### `TimelineService.boundsOf(name): OpenInterval`

Derives the picker's bounds from the same facts `contains()` uses, snapped to whole periods so that
**every clickable cell is connectable**.

- **Start** — `startOf(name)` → `cycle.anchorOf` → `cycle.startOf`. A timeline starting mid-week
  yields that whole week's start, matching `contains()`, which admits a period straddling the start.
- **End** — `endOf(name)` (which already resolves `never` / `date` / `repeats`), then snapped
  outward: take `anchorOf(endDate)` and bound at that period's `cycle.endOf`. For a `repeats` end
  the snap is a no-op, since `endOf` already returns a period end.
- An unset start, a `never` end, or an unknown journal leaves that side open. Both open gives
  `OpenInterval.unbounded()`.

Since `e4bf4ebc` ("anchor a week to its first day") every period's anchor **is** its first day, and
`representative` carries the formatting role that the anchor used to. So for a **fixed** cycle
`contains()`'s anchor rule and the grid's overlap rule already coincide, and the snapping is an
identity. It stays because it is what makes them agree, rather than leaving the agreement to a
coincidence that a future change to either rule would silently break.

The snapping is load-bearing for a **custom-interval** journal, where the picker shows _day_ cells
while `contains()` judges the _interval_ each day resolves to.

Worked example — custom journal, 7-day intervals from 2026-06-01, timeline end `2026-06-03`:

```
snapped bounds -> end = 2026-06-07 (the interval's own end)
  Jun 1-3   clickable   interval anchor Jun 1 <= Jun 3   accepted by contains()
  Jun 4-7   clickable   same interval, same anchor       accepted by contains()
  Jun 8+    disabled    next interval, anchor Jun 8      rejected by contains()
```

With a raw bound at Jun 3, the Jun 4–7 day cells would be greyed out even though connecting on any
of them resolves to an in-timeline interval. The lower bound is symmetric.

This also fixes `startOf()`, which currently builds a `CalendarDate` from `""` when the timeline has
no start, unlike `endOf()` which guards that case. There is no production caller today, so this is a
latent bug rather than a regression.

Contradictory hand-edited config (start after end) makes `OpenInterval.between` fail; fall back to
`OpenInterval.from(start)`. Unreachable through the settings UI, which already bounds the end picker
to the start.

### `ConnectNoteModal.vue`

- `dateString`, the raw input value defaulted to today, becomes `dateAnchor = ref<AnchorString>("")`
  bound through `useAnchorField`. The field starts empty: the trigger reads "Pick a date" and Connect
  stays disabled until a date is chosen. `canConnect` already requires a resolved anchor, so its
  logic is unchanged.
- `<input type="date">` becomes `<DatePicker v-model="dateModel" :picking="picking" :bounds="bounds" />`,
  with `picking` derived from the selected journal's write type via `pickingForWrite`, and `bounds`
  from `boundsOf(selected)`.
- Switching journals re-projects the held anchor into the new journal's period kind — a picked week
  becomes its containing month for a monthly journal — rather than clearing it. The existing watch
  that resets the override/rename/move toggles stays.
- The `outOfBounds` warning row stays. Snapping makes it unreachable through the picker, but it still
  fires when a date picked for one journal survives a switch to a journal whose timeline excludes it.

### `InsertJournalLinkFlow`

Passes `bounds: boundsOf(journalName)` to `datePickerModal` and uses the shared `pickingForWrite`.
Its local `pickingFor` is deleted.

### `TimelineSection.vue`

Uses `pickingForWrite` in place of its inline ternary. Its own `endBounds` is unrelated and unchanged —
it bounds the timeline editor to its own start date, and must not consume `boundsOf`.

## Testing

- `open-interval.test.ts` — `unbounded()` admits any period.
- `timeline.test.ts` — `boundsOf`: unset start leaves the lower side open; a mid-week start snaps to
  the week's start; a `never` end leaves the upper side open; a mid-period end date extends to that
  period's end; a `repeats` end bounds at the nth period; an unknown journal is unbounded; and the
  bounds agree with `contains()` at the upper edge.
- `ConnectNoteModal.test.ts` — the two `fireEvent.update` date tests are rewritten to drive
  `FakeModalService.lastOpen().submit(...)`, mirroring `TimelineSection.test.ts`. Added: the picker
  opens with the journal's picking kind; the picker opens with the journal's timeline bounds; Connect
  is disabled before any date is picked.
- `insert-journal-link.flow.test.ts` — the bounds reach the modal props.
- No test for `pickingForWrite`: it is an identity mapping, covered at its call sites.

Quality gates: `npm run test`, `npm run check:types`, `npm run check:lint`. No e2e — the change is
confined to modal internals already covered by component tests, and no connect-note e2e exists.

## Accepted trade-off

The native date input allowed typing a date directly. The plugin picker is click-only, so a distant
date costs a few navigation clicks — roughly three, using the modal's title-click ascent through
month → year → decade. This is inherent to replacing the native control.

## No new copy

The picker's existing "Pick a date" placeholder covers the empty state; no new `en.json` strings.
