# v3 timeline code block — design

## Goal

Port the v2 `calendar-timeline` code block to v3. Render a notes-aware calendar centered on the host note's date (or today), in one of four modes — `week`, `month`, `quarter`, `calendar` (full year) — that drives off the v3 `notes-calendar` building blocks and existing journal services.

## Background

v2 lives in `src/_old-code/code-blocks/timeline/`. It mounts a single Vue tree per markdown block via `MarkdownRenderChild` + `createApp`, and dispatches on a `mode` source key. Each mode renders v2's `NotesWeekView` or `NotesMonthView`, with a header row of clickable month / quarter? / year badges and a grid of day / week-number cells.

v3 already has the code-block infrastructure (`defineCodeBlock`, `CodeBlockProps`, `CodeBlockDefinitionToken`) and the per-cell building blocks (`NotesCalendarCell`, `useNotesCell`, `useShelfScope`, `useCellDecorations`). Two code blocks are ported: `home` and `nav`. The notes-aware **grid** components (v2 `NotesWeekView` / `NotesMonthView`) do not yet exist in v3.

## Scope

In scope:

- Two new reusable notes-aware grids in `src/notes-calendar/ui/`: `NotesWeekView.vue`, `NotesMonthView.vue`.
- A new `timeline` sub-feature in `src/code-blocks/timeline/` with definition, schema, top-level `TimelineCodeBlock.vue` dispatcher, and four per-mode wrappers.
- Registration in `src/code-blocks/module.ts` for the key `calendar-timeline`.
- Optional `shelf` override on the schema (matches `home-block` shape) — an explicit, accepted extension over v2.

Out of scope:

- A global "week-number column visibility" setting (v2 had one; v3 doesn't, and it is not being reintroduced here — the column appears iff the shelf has a week journal).
- New decoration types; new journal-write types.
- Migrating existing v2 user blocks (the source key `calendar-timeline` and the `mode` value vocabulary are preserved, so existing blocks keep rendering).

## Architecture

### File layout

`src/notes-calendar/ui/`

- `NotesWeekView.vue` — one week row of day cells, optional leading week-number cell, and a header row of period badges.
- `NotesWeekView.test.ts`
- `NotesMonthView.vue` — full month (6×7) grid plus optional week-number column, with `hideOutsideDates` prop and the same header row.
- `NotesMonthView.test.ts`

`src/notes-calendar/index.ts` — re-export both components from the public barrel.

`src/code-blocks/timeline/`

- `timeline-config.ts` — valibot schema `{ mode?, shelf? }`; exported `TimelineBlockConfig`, `TimelineMode` types via `v.InferOutput`.
- `timeline-config.test.ts`
- `timeline-block.ts` — `defineCodeBlock({ keys: ["calendar-timeline"], schema, component: TimelineCodeBlock, cssClass: ["journal-timeline-code-block"] })`.
- `ui/TimelineCodeBlock.vue` — resolves journal, shelf, and mode; dispatches via `ts-pattern.match(mode).with(...).exhaustive()`.
- `ui/TimelineCodeBlock.test.ts`
- `ui/TimelineWeek.vue`, `ui/TimelineMonth.vue`, `ui/TimelineQuarter.vue`, `ui/TimelineCalendar.vue` — per-mode wrappers; each computes its `Period` set and renders one or more `NotesWeekView` / `NotesMonthView`.

`src/code-blocks/module.ts` — add the new definition next to `homeCodeBlock` and `navigationCodeBlock`.

No `module.ts` inside `timeline/` (no sub-feature DI to wire — per the sub-feature definition rule, the folder is a sub-feature only when it owns its own `module.ts`).

### Data flow

`TimelineCodeBlock.vue`:

1. `entryByPath(path)` (via `JournalsIndex`) → optional journal entry.
2. `journal` — from `JournalsRepository.get(entry.journalName)` if the entry exists.
3. `refDate` — the entry's `anchor` if present; otherwise `Clock.now().toAnchor()`.
4. `mode` — `config.mode` if set; else derived from the resolved journal's `write.type` (`day | week → "week"`, `month → "month"`, `quarter → "quarter"`, `year → "calendar"`); else `"week"`.
5. `shelf` — `config.shelf` if set; else the shelf that owns the resolved journal (`ShelvesRepository.find().list().find(s => s.journals.includes(journal.name)).name`); else `null`.
6. `scope = useShelfScope(shelf)` — provides reactive per-write-type journal lists for every child.
7. `ts-pattern.match(mode)` selects the per-mode wrapper, which receives `refDate` and `scope`.

Each per-mode wrapper computes its outer `Period`:

- `TimelineWeek` → one `WeekPeriod.containing(refDate)` → one `NotesWeekView`.
- `TimelineMonth` → one `MonthPeriod.containing(refDate)` → one `NotesMonthView`.
- `TimelineQuarter` → three `MonthPeriod`s from `QuarterPeriod.containing(refDate).months()` → three `NotesMonthView`s with `hideOutsideDates`, in a responsive 1/2/3-column grid.
- `TimelineCalendar` → twelve `MonthPeriod`s from `YearPeriod.containing(refDate).months()` → twelve `NotesMonthView`s with `hideOutsideDates`, same responsive grid.

`NotesWeekView` / `NotesMonthView` internals:

- Day cells render `NotesCalendarCell` with `useNotesCell({ journalNames: () => scope.day.value })`.
- Week-number cells (when shown) render `NotesCalendarCell` with `useNotesCell({ journalNames: () => scope.week.value })`.
- Header badges render `NotesCalendarCell` for `MonthPeriod` (always), `QuarterPeriod` (only when `scope.quarter.value.length > 0`), `YearPeriod` (always), each with a `useNotesCell` API scoped to that write type.
- A `#header` slot lets callers replace the default header row.
- Each view calls `useCellDecorations(() => periodsOnScreen, () => scope.all.value)` so cell decorations refresh when the visible window changes.

### Schema

```ts
const timelineModeSchema = v.picklist(["week", "month", "quarter", "calendar"] as const);

export const timelineBlockSchema = v.object({
  mode: v.optional(timelineModeSchema),
  shelf: v.optional(v.string()),
});

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
export type TimelineMode = v.InferOutput<typeof timelineModeSchema>;
```

No defaults at the schema level — both fields are absent-or-present; absence is meaningful (auto-derive). Defaults are computed in the component.

### Errors

No new error classes. Existing infrastructure covers every failure mode:

- Invalid YAML → `CodeBlockYamlError` (host).
- Schema validation failure (e.g. unknown `mode`) → `CodeBlockSchemaError` (host).
- Note not connected to any journal → mode falls back to `"week"`, shelf to `null` (= all journals via `useShelfScope`).
- `config.shelf` references a non-existent shelf → `useShelfScope` returns empty lists; every cell renders inactive via the existing `NotesCellApi.isActionable` rule.
- Shelf has no week journal → week-number column omitted.
- Shelf has no quarter journal → quarter header badge omitted.

## Testing

`src/notes-calendar/ui/NotesWeekView.test.ts`:

- renders one row of day cells for the given week
- renders the leading week-number cell when scope has a week journal
- omits the week-number cell when scope has no week journal
- shows the month header badge
- shows the year header badge
- shows the quarter header badge only when scope has a quarter journal
- omits the quarter header badge when scope has no quarter journal
- `#header` slot replaces the default header row

`src/notes-calendar/ui/NotesMonthView.test.ts`:

- renders the full month grid (6 weeks × 7 days)
- `hideOutsideDates` marks leading/trailing cells inactive
- (header behavior covered by the same describe blocks as the week view; one behavior per test)

`src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts`:

- derives `"week"` mode when the host journal is a day journal
- derives `"week"` mode when the host journal is a week journal
- derives `"month"` mode when the host journal is a month journal
- derives `"quarter"` mode when the host journal is a quarter journal
- derives `"calendar"` mode when the host journal is a year journal
- `config.mode` overrides the derived mode
- falls back to `"week"` when the host note is not connected to any journal
- derives shelf from the host journal when `config.shelf` is absent
- `config.shelf` overrides the derived shelf

`src/code-blocks/timeline/timeline-config.test.ts`:

- empty source produces `{}` after schema parse
- each valid `mode` value parses
- an unknown `mode` value produces a schema issue

No tests for the four per-mode wrappers — they are thin compositions whose behavior is covered by `NotesWeekView` / `NotesMonthView` tests plus the dispatch tests above (no-wiring-tests rule).

No test for `timeline-block.ts` — definition is plain data (no-wiring-tests rule).

Components use `@testing-library/vue` + `user-event`; type assertions use `expectTypeOf`; no `eslint-disable`; no `Co-Authored-By` trailer; commits land on the current branch.

## v2 deviations

- `shelf?` field added to the schema (matches `home-block`).
- Week-number column visibility is driven by the shelf (week journal present?) rather than a global setting — v2's global toggle does not yet exist in v3 and is out of scope here.
- Quarter header badge visibility was already shelf-driven in v2; preserved.

All four `mode` values and the source key `calendar-timeline` are unchanged, so existing v2 user blocks continue to render.
