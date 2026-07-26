# Week Anchor / Representative Day Split — Design

**Stage:** Calendar + journals correction, pre-3.0 release
**Date:** 2026-07-26
**Status:** Draft for review

## Purpose

`Period.anchor` currently does two unrelated jobs, and weeks are the one
period type where the two disagree.

1. **Identity.** The value stamped into `journal-date`, the key in
   `JournalsIndex`, and what `parseEntry` validates as canonical
   (`journals/frontmatter.ts:36-43`).
2. **Formatting.** What `{{date:fmt}}` renders, because
   `WeekPeriod.format` delegates to `this.anchor.format`
   (`calendar/period-week.ts:58-60`) and `contextFor` binds `{{date}}` from
   the anchor (`journals/notes/note-path.ts:129`).

Only job 2 needs the representative day. It is the mechanism that makes
`{{date:YYYY}}` resolve to the week-year without rewriting anyone's format
strings — the fix for the v2 cross-year bug (see
[[project_v2_week_anchor_bug]], `2026-05-13-v3-calendar-design.md:20`).
Job 1 was fused to it for free, and that fusion is what produces a weekly
note whose frontmatter reads:

```yaml
journal-date: 2026-01-01 # Thursday
journal-start-date: 2025-12-29 # Monday
journal-end-date: 2026-01-04 # Sunday
```

The stored identity sits mid-period, disagreeing with the note's own start
field, with Dataview queries, and with what a reader expects. The fusion
has also produced two live defects:

- **The week picker shows a wrong range for every week.**
  `CalendarWeekView.vue:46` renders
  `period.format("MMM D") – period.end.format("MMM D")`, and `format()`
  routes through the anchor. Under ISO, the week of Mon Jun 8 – Sun Jun 14
  displays as `Jun 11 – Jun 14`; the cross-year week Dec 29 – Jan 4
  displays as `Jan 1 – Jan 4`. Every week renders as a four-day span
  beginning on the representative day. The covering test asserts
  `/Mar \d+/` (`CalendarWeekView.test.ts:95-102`), loose enough to pass
  while wrong.
- **Weekly filenames do not round-trip to a canonical anchor.**
  `parseDate` is a bare `CalendarDate.parse(capture, format)`
  (`templates/kinds.ts:67-79`) with no period normalization, and
  `candidateFor` uses the parsed value directly as the anchor
  (`journals/notes/note-path.ts:98-102`). With the default weekly format
  `YYYY-[W]w`, the anchor Thu 2026-01-01 renders `2026-W1`, which parses
  back to Mon 2025-12-29. `AutoAttachService` (`auto-attach.ts:35-43`)
  then stamps that non-canonical value and `parseEntry` rejects it, so the
  note attaches and immediately fails to index. `candidateFor`'s tests
  cover `daily`, `sprints`, and `issues` — no weekly journal — which is why
  this is green today.

This design separates the two jobs: `anchor` returns to the week start
(matching every other period type, matching v2's common case, matching
reader intuition), and a new `representative` field carries the formatting
role. Every template variable renders exactly what it renders today.

## Non-goals

- **No change to what any template variable outputs.** `{{date}}`,
  `{{start_date}}`, `{{end_date}}`, and every filename render byte-identically
  before and after, for all six period kinds and for custom intervals. If a
  _template-rendered_ string changes, the change is wrong. The one
  deliberate visible change is the week-picker range label, which is the
  defect fix described above.
- **No new template variable.** The representative day is not exposed to
  users as its own `{{...}}` token.
- **No format-string rewriting.** `YYYY` is not migrated to `gggg`, and no
  year-token substitution happens in the format layer. Those were options C
  and D; both were rejected — D specifically because v2's `week() === 1`
  patch already anchored cross-year weeks into the new year, so reverting
  `{{date}}` to the week start would regress v2 on exactly the weeks the
  mechanism exists for.
- **No calendar-layer refactoring** beyond the call sites the audit
  identifies.

## Architecture

### The model change

`PeriodBase` gains one field, and `format` moves to it:

```ts
export interface PeriodBase<Self> {
  readonly kind: PeriodKind;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate; // identity: stored, indexed, validated
  readonly representative: CalendarDate; // formatting: what {{date}} renders

  next(): Self;
  previous(): Self;
  contains(d: CalendarDate): boolean;
  isSame(other: Self): boolean;
  days(): Iterable<CalendarDate>;
  format(pattern: string): string; // -> representative.format(pattern)
}
```

`DayPeriod`, `MonthPeriod`, `QuarterPeriod`, `YearPeriod`, and
`DecadePeriod` set `representative = anchor`. Each gains one line and
changes no behavior.

`WeekPeriod` becomes:

```ts
this.anchor = CalendarDate._fromMoment(start);
this.representative = CalendarDate._fromMoment(start.clone().add(doy - 1, "day"));
```

Routing `format()` through `representative` is what preserves every
rendered string: existing `period.format(...)` callers keep producing
today's output without being touched.

### Call-site audit

`anchor` changes meaning for weeks, so every existing read must be
classified. Three categories:

**Identity — follows `anchor`, moves to the week start, correct by
construction.** `JournalsIndex` keys, `CycleService.anchorOf` /
`isCanonicalAnchor` / `nextAnchor` / `previousAnchor`,
`use-calendar-grid.ts:33` cell keys, `CalendarWeekView.vue:38`
`data-anchor`, `NumberingService.countRepeats` bases.

**Range — must read `.start` explicitly.** `CalendarWeekView.vue:46`, the
week-picker range label. This is the defect above; the fix is
`period.start.format("MMM D")`.

**Representative — must be repointed, or it silently regresses.**
`NotesWeekView.vue:43-45` derives the week's owning month/quarter/year via
`MonthPeriod.containing(week.anchor)`. For the Dec 29 – Jan 4 week, today's
anchor yields January 2026; following the anchor to Monday would yield
December 2025. A week belongs to the year that owns it, so this call site
moves to `representative` and its rendered output does not change.

`descend.ts:8` and `DatePickerModal.vue:64,106,110` use the anchor as a
navigation reference. They stay on `anchor`.

> **Correction (post-implementation).** The original text here claimed "any
> day inside the period locates the same next-view window, so both are
> unaffected either way". That is false at a month boundary: `outerPeriod`
> for a week is `MonthPeriod.containing(refDate)`, so opening the picker on
> the cross-year week Mon 2025-12-29 – Sun 2026-01-04 now titles "December
> 2025" rather than "January 2026", and `use-follow-active-date.ts:39`
> scrolls the notes calendar likewise. Both are benign — the week appears in
> both months' grids — but the reasoning that dismissed them was wrong.

### Journals layer

`CycleService` gains one method:

```ts
representativeOf(name: string, anchor: AnchorString): Option<CalendarDate>
```

Fixed cycles resolve it as
`periodOfKind(kind, CalendarDate.fromAnchor(anchor)).representative`. Custom
cycles return `CalendarDate.fromAnchor(anchor)` unchanged — an interval's
render date is its start — so custom journals are byte-identical. It
returns `Option.none()` for an unknown journal name, matching the other
`CycleService` lookups.

> **Correction (post-implementation).** There are **three** such sites, not
> two. The third — `MarkdownTemplateBlock.vue:50`, which binds `{{date}}`
> from the active entry's anchor — was missed here and regressed until the
> final review caught it. The root error was auditing the wrong axis:
> enumerating `.anchor` reads on `Period` objects rather than `{{date}}`
> _bindings_. The correct audit is `TemplateContext.empty()` call sites —
> five in `src/`, of which two (`note-path.ts:33`,
> `use-invertibility-check.ts:32`) are synthetic probes and three take real
> journal data. One grep would have enumerated them exactly.

Three sites bind `{{date}}` from real journal data, and all repoint to it:

- `note-path.ts:129` (`contextFor`) — filenames, folders, note bodies
- `nav-row-context.ts:58` (`buildNavRowContext`) — nav code blocks
- `MarkdownTemplateBlock.vue:50` — the markdown-template view block, bound
  from the active entry's anchor

`{{start_date}}` / `{{end_date}}` need no change at the first two sites: they come
from `cycle.startOf` / `cycle.endOf`, which take the anchor as _input_, and
under the new model `startOf(weekStart)` is the anchor itself.

The probe contexts — `note-path.ts:32-39` (`#parseContext`) and
`use-invertibility-check.ts:34-36` — bind synthetic dates where only the
format matters. They stay as they are.

`{{relative_date}}` is unaffected: `relative-date.ts:24` normalizes both
sides with `.startOf(period)` before diffing, so a week anchor moving from
Thursday to Monday lands on the same Monday.

### Round-trip normalization

`candidateFor` (`note-path.ts:98-102`) must resolve the parsed date through
`cycle.anchorOf(name, dateBinding.value)` rather than using
`dateBinding.value.toAnchor()` directly, returning `Option.none()` when the
cycle cannot resolve it.

This is required by the split and fixes the auto-attach defect above
independently of it. The two defects mask each other in opposite
directions, which is why the test plan below pins both: with the coarse
default format the parsed value happens to _become_ canonical once the
anchor moves to the week start, so the split alone would make a
coarse-format test pass while leaving the normalization missing.

### Migration

No migration code changes. The `week-anchor` marker
(`settings/legacy/v3-to-v4.ts:178-186`) re-canonicalizes each weekly note
through `anchorOf`, so it retargets to the week start on its own. Its
scope shrinks to v2's cross-year notes — which v2 stored at `endOf("week")`
via its `week() === 1` patch (`_old-code/journals/fixed-interval.ts:110-116`)
— plus any representative-day-anchored notes in existing v3 test vaults.
The plugin is unreleased (`manifest.json` is 2.1.10), so no installed base
is affected. Existing migration tests keep their structure and flip their
expected values.

### Discoverability

Weekly journals get a hint near the name-template / date-format fields:
`{{date}}` lands mid-week so year tokens resolve to the week-year, and
`{{start_date}}` is the week's first day. One new `en.json` string,
sentence case, following `docs/2026-07-13-ux-text-audit.md` §A.

## Testing

Each of these must be watched red before the corresponding change:

1. **`candidateFor` on a weekly journal returns the canonical anchor.** Two
   cases, and both are needed because they fail for opposite reasons:
   - **Coarse format** (`YYYY-[W]w`, the default). Red today: `2026-W1`
     parses to the week start while the canonical anchor is the
     representative day, so the note orphans. Goes green from the model
     change alone — it does _not_ guard the normalization.
   - **Day-precision format** (`YYYY-MM-DD`). This is the one that guards
     `anchorOf`: after the split, `{{date}}` renders the representative day,
     so the filename parses back to a mid-week date that is no longer the
     canonical anchor. Stays red until `candidateFor` normalizes.
2. **`CalendarWeekView` cell label** shows the full Monday–Sunday span.
   Replaces the `/Mar \d+/` assertion, which passes while wrong.
3. **`WeekPeriod`** — `anchor` is the week start and `representative` is
   the doy day, asserted under both ISO (dow 1 / doy 4) and Sunday-start
   (dow 0 / doy 6) locales.
4. **`contextFor` on a weekly journal** — `{{date:YYYY-[W]w}}` still
   renders the week-year while the built metadata's anchor is the week
   start. This is the regression guard for the whole design.
5. **Migration** — a v2 cross-year weekly note stored at the week's Sunday
   re-canonicalizes to the week start.

The change touches runtime, so the wdio suite runs: `data-anchor` values in
the week-picker journeys move to Mondays.

## Open follow-ups

- None. The `NotesWeekView` owning-period question is resolved inside this
  design (repoint to `representative`, no visible change).

## Cross-references

- `2026-05-13-v3-calendar-design.md` — introduces `anchor` as "the
  representative day Layer B formats" (:267-278); this design splits that
  sentence's two halves into two fields.
- [[project_week_canonical_anchor]] — records the current rule; needs
  updating once this ships.
- [[project_v2_week_anchor_bug]] — the cross-year bug the representative
  day exists to fix, and which this design preserves the fix for.
- `docs/2026-06-01-v2-v3-feature-gaps.md:377-378` — gap #87, the weekly-note
  migration bridge whose marker this design reuses unchanged.
