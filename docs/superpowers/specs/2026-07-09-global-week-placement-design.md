# Global week-number placement default

## Summary

Add a global default for **week-number column placement** (`none` / `left` / `right`) that
individual calendar blocks inherit unless they override it. Placement controls where the
week-number column renders in a calendar grid: hidden, before the weekdays, or after them.

Today placement is per-block only, with a hard-coded default of `left`:

- **View blocks** (month/week calendar) store `weeks` in their config and expose a dropdown in
  `CalendarBlockConfigFields.vue`.
- **Timeline code block** reads `weeks` from its YAML config (no config UI); when omitted the
  renderer falls back to `left`.

There is no global default and no way to say "follow the global setting."

## Goals

- A single global default for week-number placement, editable in the Calendar settings section.
- View blocks and the timeline code block inherit that default unless they pin an explicit value.
- Live inheritance: a block set to "inherit" tracks the global value as it changes.
- No behavior change out of the box (global default is `left`, matching today).

## Non-goals

- No new configuration dialog for the timeline code block. Timeline override stays YAML-only:
  omit `weeks` to inherit, or write `weeks: left|right|none` to pin.
- No migration of existing stored blocks. Blocks that already persisted an explicit `weeks`
  value keep it and do not retroactively follow the global default.
- No change to week-**start** configuration (the locale/custom `dow`/`doy` calendar slice). This
  is a separate display concern.

## Behavior notes (expectation-setting)

- Existing view blocks persisted an explicit `weeks: "left"` (the old schema default was baked
  into saved config), so they stay pinned to `left` and are unaffected by the global default.
- The global default therefore visibly affects: newly created view blocks, any block explicitly
  switched to "Use global default", and timeline code blocks that omit `weeks`.

## Design

### 1. Global setting: a new `calendarDisplay` slice

Add a new settings slice, separate from the existing week-start `calendarSlice` (which is a
`v.variant("mode", …)` bridged into moment). Week-number placement is a display concern and does
not belong in that variant.

- New file: `src/calendar/settings/display-slice.ts`
  - `WeekPlacement = "none" | "left" | "right"`
  - `calendarDisplaySlice = defineSlice("calendarDisplay", schema, { weekPlacement: "left" })`
  - Schema: `v.object({ weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left") })`
- Register it in the existing `calendarSettingsModule`
  (`src/calendar/settings/module.ts`) via `c.register(SliceDefinitionToken).useValue(calendarDisplaySlice)`.

### 2. Inherit sentinel: `"default"`

Block configs gain a `"default"` value on their `weeks` picklist meaning "inherit the global
default." New blocks default to `"default"`.

- `src/views/blocks/calendar-block-schema.ts`: change
  `weeks: v.optional(v.picklist(["none", "left", "right"]), "left")` to
  `weeks: v.optional(v.picklist(["default", "none", "left", "right"]), "default")`.
- `src/views/blocks/ui/calendar-block-fields.ts`: `weeks` type becomes
  `"default" | "none" | "left" | "right"`.
- Month/week block `defaultConfig`
  (`src/views/blocks/{month,week}-calendar/*-calendar-block.ts`): `weeks: "default"`.
- `src/code-blocks/timeline/timeline-config.ts`: add `"default"` to the picklist:
  `weeks: v.optional(v.picklist(["default", "none", "left", "right"] as const))`. A missing
  value (`undefined`) also means inherit.
- `src/views/default-view.ts`: change the built-in calendar block from `weeks: "left"` to
  `weeks: "default"` so the shipped view demonstrates inheritance. Global default is `left`, so
  appearance is unchanged; existing installs keep their already-seeded config.

### 3. Resolution: pure helper + composable in `@/calendar`

- `resolveWeekPlacement(configWeeks, globalDefault): WeekPlacement` — maps `"default"` and
  `undefined` to `globalDefault`, otherwise returns `configWeeks`. Pure, unit-tested.
- `useResolvedWeekPlacement(getConfigWeeks: () => "default" | WeekPlacement | undefined): ComputedRef<WeekPlacement>`
  — reads `calendarDisplaySlice` via `SettingsService` and returns
  `computed(() => resolveWeekPlacement(getConfigWeeks(), slice.state.weekPlacement))`.
- Export both from the `@/calendar` barrel (the slice lives in `calendar/settings`; consumers in
  `views` and `code-blocks` already sit above `calendar`).

Block wrappers resolve once and pass the concrete value down; the renderers stay dumb:

- `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`:
  `const weeks = useResolvedWeekPlacement(() => config.weeks)` → `:weeks="weeks"`.
- `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`: same.
- `src/code-blocks/timeline/ui/TimelineCodeBlock.vue`: resolve once, pass `:weeks="weeks"` to all
  four mode components (currently `:weeks="config.weeks"` in four places).
- `NotesMonthView.vue` / `NotesWeekView.vue` are unchanged; they keep receiving a concrete
  `"none" | "left" | "right"` and their existing `?? "left"` fallback stays as a safety net.

### 4. Config UI

- **View blocks** — `src/views/blocks/ui/CalendarBlockConfigFields.vue`: add a first dropdown
  option `<option value="default">{{ m.view_block_config_weeks_default() }}</option>` above the
  existing none/left/right options. The `config.weeks` model already carries the value.
- **Global** — new dashboard block `src/calendar/settings/ui/CalendarDisplayBlock.vue`: one
  `UiDropdown` (none/left/right) bound to `calendarDisplaySlice` state, registered as a
  `DashboardBlockToken` with an `order` just after the existing week-start block. (Alternative
  considered: fold the dropdown into `CalendarWeekBlock.vue`; kept separate for testability.)

### 5. i18n

Add to `messages/en.json` and run `npm run compile:i18n` (never stage `src/i18n/paraglide`):

- `view_block_config_weeks_default` — "Use global default"
- `calendar_week_placement_label` — label for the global setting row
- (optional) `calendar_week_placement_description`

Reuse existing `view_block_config_weeks_{none,left,right}` for the global dropdown options.

## Testing

- **Unit** — `resolveWeekPlacement`: `"default"` and `undefined` resolve to the global default;
  an explicit `none`/`left`/`right` is returned unchanged. Slice default is `left`.
  One behavior per test; assert observable return values.
- **e2e (wdio)** — set the global default to `right`; a block configured `"default"` renders the
  week-number column on the right; then pin the block to `left` and assert the column flips. The
  pinned target (`left`) diverges from the fallback so the test fails if resolution is deleted.

## Quality gates

`npm run test`, `npm run check:types`, `npm run check:lint`, `npm run compile:i18n`, and the wdio
e2e suite (runtime-touching change).
