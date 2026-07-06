# Weekday selector → generic `UiToggleGroup`

## Problem

The calendar block config renders the "Hide days of the week" control as seven raw
`<input type="checkbox">` rows. Bare checkboxes look out of place next to the rest of
the Obsidian-styled settings. The fix is a segmented **toggle group** — a connected row
of day buttons — extracted as a reusable UI primitive, since other multi-select settings
share the same shape.

## Decisions

- **Polarity: active = shown.** A highlighted/pressed day button means the day is shown;
  dimmed means hidden. All days highlighted by default. The data model still stores the
  complement (`hiddenWeekdays`), so the consumer adapts between shown and hidden.
- **Generic component**, not inline markup — three real callers benefit.
- **Label rename:** `view_block_config_hidden_weekdays_label` value changes
  "Hide days of the week" → "Days of the week" (key unchanged).
- **Migrate all three multi-select consumers** now: weekday selector, period-buttons
  config, and button-item period levels.

## New component: `src/ui/UiToggleGroup.vue`

Generic multi-select segmented control.

- `<script setup lang="ts" generic="T">`
- `const model = defineModel<T[]>({ required: true })` — the highlighted (selected) values.
- Props: `defineProps<{ options: { value: T; label: string; tooltip?: string }[]; disabled?: boolean }>()`
- Markup: `role="group"` container wrapping one `<button type="button">` per option, with
  `:aria-pressed="model.includes(value)"`, `:aria-label="tooltip"`, and an `is-active`
  class when pressed. Clicking flips that value's set membership and assigns a **new**
  array (add if absent, remove if present). `disabled` disables all buttons.
- The component is **pure**: it can reach an empty selection. Any minimum-selection rule
  lives in the consumer's update handler, not here (no `min` prop).
- Scoped CSS renders a connected segmented row using Obsidian theme vars: active buttons
  use `--interactive-accent` / `--text-on-accent`; inactive use a muted background and
  `--text-muted`; buttons are keyboard-focusable with a visible focus ring.

### Test: `src/ui/UiToggleGroup.test.ts`

testing-library + user-event, one behavior per test, query by `getByRole("button", { name, pressed })`:

1. renders a button for each option
2. marks options present in the model as pressed
3. adds an option's value to the model when an unpressed option is clicked
4. removes an option's value from the model when a pressed option is clicked

## Consumer 1: `CalendarBlockConfigFields.vue`

Replace the checkbox `v-for` and `toggleWeekday` with a single `UiToggleGroup`. Because the
component's model is _shown_ days but config stores _hidden_ days, bind with an inline
adapter (not `v-model`):

- `options` = `orderedWeekdays.map((w) => ({ value: w.index, label: w.label }))`
- let `allIndices = orderedWeekdays.map((w) => w.index)`
- `:model-value` = `allIndices.filter((i) => !config.hiddenWeekdays.includes(i))`
- `@update:model-value="(shown) => onChange({ hiddenWeekdays: allIndices.filter((i) => !shown.includes(i)).toSorted((a, b) => a - b) })"`

### Test updates: `CalendarBlockConfigFields.test.ts`

The two weekday tests keep their `onChange` payloads; queries switch to
`getByRole("button", { name: "Sat" })` and names become behaviour-first:

- "hides a weekday when its shown button is clicked" — base config (nothing hidden), click
  Sat → `onChange({ hiddenWeekdays: [6] })`
- "shows a hidden weekday when its dimmed button is clicked" — `hiddenWeekdays: [6]`, click
  Sat → `onChange({ hiddenWeekdays: [] })`

## Consumer 2: `PeriodButtonsItemConfig.vue`

Replace the four stacked `UiToggle` rows with one `UiToggleGroup` row. Config is four
booleans (`week`/`month`/`quarter`/`year`), so adapt between booleans and the selected array:

- one `UiSettingRow`, `#name` = new message `view_toolbar_period_buttons_config_label` ("Periods")
- `options` = `["week", "month", "quarter", "year"].map((p) => ({ value: p, label: m.view_toolbar_button_config_level_option({ level: p }), tooltip: m.view_toolbar_period_buttons_config({ period: p }) }))`
- `:model-value` = the periods whose boolean is `true`
- `@update:model-value` = set each of the four booleans by membership in the emitted array

No minimum-selection rule (schema permits all-false). The `view_toolbar_period_buttons_config`
message is retained (now used for tooltips).

## Consumer 3: `ButtonItemConfig.vue` (period levels)

Replace the per-level `UiToggle` `v-for` with one `UiToggleGroup`, preserving the **≥1 level**
invariant in the update handler:

- `options` = `allLevels.map((l) => ({ value: l, label: m.view_toolbar_button_config_level_option({ level: l }) }))`
- `:model-value` = `periodAction.levels`
- `@update:model-value="(levels) => levels.length && update({ action: { ...periodAction, levels: allLevels.filter((l) => levels.includes(l)) } })"`
  — the `levels.length &&` guard rejects an empty selection, matching today's behaviour where
  clicking the last active toggle does nothing.
- Remove the now-unused `toggleLevel` function.

## i18n

- Change `view_block_config_hidden_weekdays_label` value → "Days of the week".
- Add `view_toolbar_period_buttons_config_label` → "Periods".

## Out of scope

- Single-select segmented controls (the `weeks`, `window`, `mode`, `direction` dropdowns
  are a different, radio-like shape). Not fused into this component.
- Data model, schemas, and runtime calendar rendering are unchanged.

## Verification

`npm test`, `npm run check:types`, `npm run check:lint`. No e2e change — the settings-UI
swap leaves `hiddenWeekdays` and runtime rendering untouched (existing e2e only asserts the
rendered weekday header).
