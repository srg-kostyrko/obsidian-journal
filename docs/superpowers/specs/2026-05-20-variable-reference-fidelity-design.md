# Variable Reference Fidelity — Design

**Stage:** v3 template engine + journal settings UI
**Date:** 2026-05-20
**Status:** Draft for review

## Purpose

v2 exposed ten template variables (`date`, `start_date`, `end_date`,
`journal_name`, `index`, `note_name`, `title`, `current_date`, `time`,
`current_time`) and documented the full date-modification grammar
(`:FORMAT`, `±Nunit`, `<startOf=…>`, `<endOf=…>`) in a click-to-copy
modal with a linked sub-modal for modifications.

v3 currently ships four variables (`date`, `journal_name`, `start_date`,
`end_date`) plus the per-journal numbering variable. `note_name`,
`title`, `current_date`, `time`, `current_time` were listed as goals in
the [v3 template engine spec][engine-spec] but the implementation
stopped at the path-render path. The `VariableReferenceModal` ships as a
flat `<code>`-tag list with no copy interaction and no documentation of
any modification grammar — even though the engine already supports it.

This spec restores full v2 fidelity at both the engine layer and the
modal layer, with two v3 extensions: an `h` (hour) shift unit and a
`clock` variable kind that makes time-of-day modifications honest.

[engine-spec]: ./2026-05-19-v3-template-engine-design.md

## Goals

- Reach v2 parity on the variable surface: `note_name`, `title`,
  `current_date`, `time`, `current_time` available, with `title`
  aliasing `note_name` and `current_time` aliasing `time` exactly as v2
  did.
- Document the full modification grammar the engine already supports
  (`:FORMAT`, `±Nunit` for `y`/`q`/`m`/`w`/`d`/`h`, `<startOf=…>`,
  `<endOf=…>`) in a sub-modal reachable from every date/clock variable
  row.
- Make `time` / `current_time` honor `:FORMAT` and modifiers honestly
  (today they couldn't, because v3 had no wall-clock variable kind).
- Restore click-to-copy on every variable token rendered in the docs.
- Make the modal context-aware so users don't see `note_name` /
  `title` (circular by definition) in path-render fields, and see a
  non-invertibility warning on render-time clock variables in fields
  where the date-from-filename round-trip matters.

## Non-goals

- No engine support for the `note_name` / `title` round-trip in the
  parse path. They are body-render-only, so they never enter
  `engine.parse`.
- No settings-preview UI for template-body templates. Preview continues
  to operate on the three path-render fields only.
- No migration of existing user templates. New variables become
  available; old templates render identically.

## Engine & types

### `templates/types.ts`

Extend the variable-spec discriminated union with a fourth `clock`
kind and an invertibility flag on `date`:

```ts
export type VariableSpec =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate; defaultFormat: string; invertible?: boolean }
  | { kind: "clock"; value: Clock; defaultFormat: string };
```

`BoundValue` is unchanged: clock variables are never produced by the
parser, so there is no `BoundValue` of `clock` kind.

- `date.invertible` defaults to `true`. Set to `false` for
  `current_date`, so the parser treats it as a wildcard (`.+?`).
- `clock` is non-invertible by construction.

The `ValidationProblem.problem` union stays as-is. `:FORMAT` and
modifiers are valid on both `date` and `clock`.

### `calendar/clock.ts`

Grow `Clock` to mirror `CalendarDate`'s modifier surface:

```ts
class Clock {
  format(pattern: string): string;
  shift(amount: number, unit: "y" | "q" | "m" | "w" | "d" | "h"): Clock;
  startOf(unit: "year" | "quarter" | "month" | "week" | "day" | "hour"): Clock;
  endOf(unit: "year" | "quarter" | "month" | "week" | "day" | "hour"): Clock;
}
```

No `decade` boundary on Clock — symmetry with `CalendarDate` isn't
worth a dead code path on a wall-clock value. The `hour` boundary is a
v3 extension (v2 had no `h` unit at all).

### `templates/modifiers.ts`

Generalize `applyModifier` / `applyModifiers` over a `Shiftable`
interface:

```ts
interface Shiftable<U extends string, B extends string> {
  shift(amount: number, unit: U): this;
  startOf(unit: B): this;
  endOf(unit: B): this;
}

function applyModifiers<T extends Shiftable<Unit, BoundaryUnit>>(value: T, modifiers: readonly Modifier[]): T;
```

`BoundaryUnit` widens to include `hour` so Clock instantiates cleanly.
`CalendarDate.shift` already accepts and silently ignores `h`
(`calendar-date.ts:71`), so the CalendarDate instantiation is
behavior-preserving.

`unapplyModifier` / `unapplyModifiers` stay CalendarDate-typed: the
parse path is the only caller, clock variables are never invertible
(they're wildcards in `#compileMatcher`), so a clock-typed inverse
would be dead code.

### `templates/engine.ts`

Three touchpoints:

1. **`#renderVariable`** adds a fourth `match.with({ kind: "clock" })`
   arm that renders via `Clock.format(format ?? defaultFormat)` after
   applying modifiers.
2. **`validate`** treats `clock` like `date`: `:FORMAT` and modifiers
   are valid; no `format-on-non-date` / `modifiers-on-non-date`
   problems raised.
3. **`#compileMatcher`** replaces the hardcoded
   `wildcardNames = new Set(["current_date", "current_time", "time"])`
   at line 158 with a spec-driven check:

   ```ts
   const isWildcard = (spec: VariableSpec | undefined) =>
     spec?.kind === "clock" || (spec?.kind === "date" && spec.invertible === false);
   ```

   This deletes the hardcoded set entirely.

### `templates/kinds.ts`

Add `renderClock(spec, modifiers, format)` mirroring `renderDate`. No
parse counterpart (clock is never invertible).

## Context assembly

### Two builders on `NotePathService`

```ts
class NotePathService {
  contextFor(config, metadata): TemplateContext;
  bodyContextFor(config, metadata, noteName: string): TemplateContext;
}
```

`contextFor` (existing — extended) registers:

| Name                                | Source                                        | Spec                          |
| ----------------------------------- | --------------------------------------------- | ----------------------------- |
| `date`                              | `metadata.date`                               | `date`, invertible: true      |
| `journal_name`                      | `config.name`                                 | `string`                      |
| `start_date`                        | cycle.start (when applicable)                 | `date`, invertible: true      |
| `end_date`                          | cycle.end (when applicable)                   | `date`, invertible: true      |
| each `numbering.sources[].variable` | numbering value (when enabled)                | `number`                      |
| `current_date`                      | `CalendarDate.today()`                        | `date`, **invertible: false** |
| `time`                              | `Clock.now()`                                 | `clock`                       |
| `current_time`                      | _same `Clock` and same spec object as_ `time` | `clock`                       |

Aliasing-by-data: the map entries for `time` and `current_time` point
at the same `VariableSpec` instance with the same captured `Clock`,
guaranteeing byte-identical output for both names in a single render.

`bodyContextFor` (new) composes the path context and adds:

| Name        | Source                                   | Spec     |
| ----------- | ---------------------------------------- | -------- |
| `note_name` | `noteName` arg                           | `string` |
| `title`     | _same string spec object as_ `note_name` | `string` |

`bodyContextFor` MUST call `contextFor` once and add the two extra
entries, not reconstruct the context from scratch. This keeps the
clock snapshot consistent: a body template that references both
`{{current_date}}` and `{{time}}` together with the filename observes
the same instant the path was rendered against.

### Caller updates

- `template-content.ts` — change `renderFor` signature:

  ```ts
  renderFor(
    journalName: string,
    metadata: JournalMetadata,
    noteName: string,
  ): AsyncResult<string, JournalNotFoundError | NoteReadError>
  ```

  Build path context; render the templatePath with it; build body
  context (path context composed with `noteName`); render the body
  with the body context.

- `note-creation.ts` (lines 73, 94) — pass
  `this.#basename(path)` as the new `noteName` arg.

- `render-for-preview.ts` — no change; settings preview operates on
  path-render fields, where path context is correct.

## Modal restructure

### `VariableChip.vue` (new)

Small shared component. Renders a variable token as a clickable code
chip; clicking copies `{{name}}` to the clipboard via
`useClipboard` from `@vueuse/core`. Shows a brief "copied" flash
(`copiedDuring: 1500`).

Used by both `VariableReferenceModal` and `DateModificationsModal`.

### `VariableReferenceModal.vue` (rewrite)

Context-aware. New props:

```ts
defineProps<{
  context: "name-template" | "folder-path" | "template-path";
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
}>();
```

Internal rules table is the single source of truth for which variable
appears in which context and whether it carries a warning:

| Variable                         | name-template   | folder-path     | template-path   | Warning                                |
| -------------------------------- | --------------- | --------------- | --------------- | -------------------------------------- |
| `date`                           | ✓               | ✓               | ✓               | —                                      |
| `journal_name`                   | ✓               | ✓               | ✓               | —                                      |
| `start_date`                     | ✓ if `hasCycle` | ✓ if `hasCycle` | ✓ if `hasCycle` | —                                      |
| `end_date`                       | ✓ if `hasCycle` | ✓ if `hasCycle` | ✓ if `hasCycle` | —                                      |
| each `numberingVariableNames[i]` | ✓               | ✓               | ✓               | —                                      |
| `note_name`                      | ✗               | ✗               | ✗               | (body-only)                            |
| `title`                          | ✗               | ✗               | ✗               | (body-only)                            |
| `current_date`                   | ✓               | ✓               | ✓               | warning in name-template + folder-path |
| `time`                           | ✓               | ✓               | ✓               | warning in name-template + folder-path |
| `current_time`                   | ✓               | ✓               | ✓               | warning in name-template + folder-path |

Warning text: i18n key
`journal_edit_variable_non_invertible_warning`, concise — "Using this
here prevents the journal from recovering the date from the
filename." Rendered as a small inline caveat on the row, not a
separate banner.

Numbering rows are a dynamic group rendered from
`numberingVariableNames`, one row per name, all identical (number
kind, no modifications link, no warning). Placed after `end_date`,
before `current_date`. Absent when the list is empty.

Every date/clock row carries an "additional modifications" link
(i18n key `journal_edit_variable_additional_modifications_link`) that
opens `DateModificationsModal`.

### `DateModificationsModal.vue` (new)

A separate Obsidian modal opened via the existing modal-host
plumbing. The parent modal stays open behind it. Content sections:

1. **Format override (`:FORMAT`)** — moment.js format string, example
   chip `{{date:YYYY}}`.
2. **Arithmetic shifts (`±Nunit`)** — units `y`/`q`/`m`/`w`/`d`/`h`;
   example chip `{{date+1w}}`. The unit list per-row labels reuse
   moment locale data where possible; surrounding prose lives in
   paraglide.
3. **Boundary shifts (`<startOf=unit>` / `<endOf=unit>`)** —
   CalendarDate units `year`/`quarter`/`month`/`week`/`day`/`decade`;
   Clock units `year`/`quarter`/`month`/`week`/`day`/`hour`. Example
   chip `{{date<startOf=year>}}`.
4. **Stacking** — shifts → boundaries → format; example chip
   `{{date+1w<startOf=week>:MMM DD, YYYY}}`.

Every example token in the sub-modal is a `<VariableChip>` and is
copy-on-click.

### Caller updates

`JournalEditSubpage.vue` — the three sites that open this modal each
pass their own `context` value. `hasCycle` comes from the same
journal-config branch the form already inspects.
`numberingVariableNames` is `config.numbering?.sources.map(s =>
s.variable) ?? []`.

## i18n

New keys (alphabetic per existing convention) in `messages/en/*.json`:

Main modal:

- `journal_edit_variable_current_date_description`
- `journal_edit_variable_time_description`
- `journal_edit_variable_current_time_description` (worded to note
  alias-of-`time`)
- `journal_edit_variable_non_invertible_warning`
- `journal_edit_variable_additional_modifications_link`

Sub-modal:

- `variable_modifications_intro`
- `variable_modifications_format_heading` / `_body` /
  `_example_caption`
- `variable_modifications_shift_heading` / `_body` / `_units_intro`
  - per-unit labels
- `variable_modifications_boundary_heading` / `_body` /
  `_units_intro` + boundary-unit labels
- `variable_modifications_combined_heading` / `_body` /
  `_example_caption`

Chip:

- `variable_chip_copied`

`note_name` / `title` get no main-modal keys (body-only; modal never
shows them).

## Testing

Per [test hygiene memory][test-hygiene]: colocate `*.test.ts` with
implementation; use `@testing-library/vue` + `user-event` for Vue
component tests; one behavior per test; no DI-wiring tests, no shape
tests, no tests on framework behavior.

[test-hygiene]: ../../memory/feedback_test_hygiene.md

### Engine + calendar

- `calendar/clock.test.ts` — `shift` per unit including `h`;
  `startOf` / `endOf` per boundary unit including `hour`; combined
  modifier-stack ordering.
- `templates/engine.test.ts` — `clock` arm in `#renderVariable`
  (default format, `:FORMAT` override, modifier stacking);
  `current_date` with `invertible: false` becomes a wildcard in
  `#compileMatcher`; clock variables are never invertible; behavior
  unchanged after replacing the hardcoded `wildcardNames` set with the
  spec-driven check.
- `templates/modifiers.test.ts` — generic `applyModifiers<T>`
  instantiated on both `CalendarDate` and `Clock`; the
  CalendarDate-typed behavior is byte-identical to today's.

### Context layer

- `journals/notes/note-path.test.ts` — `contextFor` exposes
  `current_date` / `time` / `current_time`; the `time` and
  `current_time` map entries reference the same spec object;
  `bodyContextFor(config, metadata, noteName)` exposes `note_name`
  and `title` (same spec object) and inherits the path context's
  clock snapshot.

### Modal layer

- `VariableReferenceModal.test.ts` — for each of the three contexts,
  the rendered row set matches the rules table; clock-var warning
  appears in `name-template` and `folder-path` only; "additional
  modifications" link opens the sub-modal via the modal-host plumbing
  spy.
- `VariableChip.test.ts` — click copies `{{name}}` and shows the
  copied flash.
- `DateModificationsModal.test.ts` — each documented mechanism's
  example chip renders the correct token text and copies on click.

### Integration

- `template-content.test.ts` — body-render context exposes
  `note_name` matching the rendered basename; templatePath render
  still uses path context (no `note_name` available there).
- `note-creation.test.ts` — `renderFor` is called with the resolved
  basename.

## Rollout

No feature flag. No migration. The new variables and the modal
restructure ship together. Existing user templates render
identically (no variable name is renamed or removed). The path-render
fields gain three new available variables; users who add them in
nameTemplate or folderPath see the inline warning before saving.

## Open questions

None at the time of writing. All decisions reached during
brainstorming are reflected above.
