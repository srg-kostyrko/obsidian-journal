# Weekday Selector → Generic `UiToggleGroup` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seven raw weekday checkboxes with a reusable segmented toggle-group component, and adopt it in the two other multi-select settings that share the shape.

**Architecture:** Add one generic, pure Vue component `UiToggleGroup` whose model is the array of _highlighted_ (selected) values. Three config components bind to it via inline `:model-value`/`@update:model-value` adapters that translate between the component's "selected" model and each feature's own storage shape (hidden-day complement, four booleans, min-1 level array).

**Tech Stack:** Vue 3 `<script setup>` SFCs (generic components), Valibot-inferred config types, Vitest + @testing-library/vue + user-event, Paraglide i18n (`m.*`, compiled from `messages/en.json`).

## Global Constraints

- Test commands are **npm** scripts: `npm test`, `npm run check:types`, `npm run check:lint`. No e2e change in this plan.
- After editing `messages/en.json`, run `npm run compile:i18n` to regenerate `src/i18n/paraglide` before type-checking (new keys don't exist on `m` until compiled).
- Colocate `*.test.ts` beside the implementation. Use `@testing-library/vue` + `user-event`; query by role/accessible name, never by CSS class or test-only `data-*`.
- One behavior per test; test names are subject+verb behavior descriptions.
- Vue component props are inline `defineProps<{...}>()`. Do not wrap static `m.*()` calls in `computed()`.
- Never add `eslint-disable`; fix the code. Never add a `Co-Authored-By` trailer. Commit to the current branch (`v3-ai`) — do not create a branch.

---

### Task 1: `UiToggleGroup` generic component

**Files:**

- Create: `src/ui/UiToggleGroup.vue`
- Test: `src/ui/UiToggleGroup.test.ts`

**Interfaces:**

- Produces: `UiToggleGroup` — a generic SFC. Props: `{ options: { value: T; label: string; tooltip?: string }[]; disabled?: boolean }`. Model: `defineModel<T[]>({ required: true })` (`v-model` / `:model-value` + `@update:model-value`), the array of highlighted values. A click on an option emits a **new** array with that option's `value` toggled in/out of the model. Renders one `<button type="button">` per option with `aria-pressed` reflecting membership and `is-active` class when pressed; `aria-label` set to `tooltip` when provided.

- [ ] **Step 1: Write the failing test**

Create `src/ui/UiToggleGroup.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiToggleGroup from "./UiToggleGroup.vue";

afterEach(() => cleanup());

const options = [
  { value: 1, label: "One" },
  { value: 2, label: "Two" },
  { value: 3, label: "Three" },
];

describe("UiToggleGroup", () => {
  it("renders a button for each option", () => {
    render(UiToggleGroup, { props: { modelValue: [], options } });
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks options present in the model as pressed", () => {
    render(UiToggleGroup, { props: { modelValue: [2], options } });
    expect(screen.getByRole("button", { name: "Two", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "One", pressed: false })).toBeTruthy();
  });

  it("adds an option's value to the model when an unpressed option is clicked", async () => {
    const { emitted } = render(UiToggleGroup, { props: { modelValue: [1], options } });
    await userEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(emitted("update:modelValue")).toEqual([[[1, 2]]]);
  });

  it("removes an option's value from the model when a pressed option is clicked", async () => {
    const { emitted } = render(UiToggleGroup, { props: { modelValue: [1, 2], options } });
    await userEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(emitted("update:modelValue")).toEqual([[[1]]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/UiToggleGroup.test.ts`
Expected: FAIL — cannot resolve `./UiToggleGroup.vue`.

- [ ] **Step 3: Write the component**

Create `src/ui/UiToggleGroup.vue`:

```vue
<script setup lang="ts" generic="T">
const model = defineModel<T[]>({ required: true });

defineProps<{
  options: { value: T; label: string; tooltip?: string }[];
  disabled?: boolean;
}>();

function toggle(value: T): void {
  model.value = model.value.includes(value)
    ? model.value.filter((current) => current !== value)
    : [...model.value, value];
}
</script>

<template>
  <div class="ui-toggle-group" role="group">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      class="ui-toggle-group__option"
      :class="{ 'is-active': model.includes(option.value) }"
      :aria-pressed="model.includes(option.value)"
      :aria-label="option.tooltip"
      :disabled="disabled"
      @click="toggle(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-toggle-group {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.ui-toggle-group__option {
  flex: 1 1 auto;
  padding: var(--size-4-1) var(--size-4-2);
  border: none;
  border-left: 1px solid var(--background-modifier-border);
  border-radius: 0;
  background-color: var(--background-primary);
  color: var(--text-muted);
  box-shadow: none;
  cursor: pointer;
}
.ui-toggle-group__option:first-child {
  border-left: none;
}
.ui-toggle-group__option.is-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.ui-toggle-group__option:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-toggle-group__option:focus-visible {
  box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/ui/UiToggleGroup.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiToggleGroup.vue src/ui/UiToggleGroup.test.ts
git commit -m "feat(ui): add generic UiToggleGroup segmented control"
```

---

### Task 2: Adopt in weekday selector + rename label

**Files:**

- Modify: `src/views/blocks/ui/CalendarBlockConfigFields.vue` (whole `<script setup>` + the weekday `UiSettingRow`)
- Modify: `src/views/blocks/ui/CalendarBlockConfigFields.test.ts` (two weekday tests)
- Modify: `messages/en.json` (`view_block_config_hidden_weekdays_label` value)

**Interfaces:**

- Consumes: `UiToggleGroup` (Task 1); `Calendar.weekdaysShort()` → `readonly { index: number; label: string }[]`; `props.onChange(patch: Partial<CalendarBlockFields>)` where `CalendarBlockFields.hiddenWeekdays: number[]`.

- [ ] **Step 1: Update the failing tests first**

In `src/views/blocks/ui/CalendarBlockConfigFields.test.ts`, replace the two existing tests (`"adds a weekday index to hiddenWeekdays when its checkbox is checked"` and `"removes a weekday index from hiddenWeekdays when its checkbox is unchecked"`) with:

```ts
it("hides a weekday when its shown button is clicked", async () => {
  const onChange = vi.fn();
  mountFields(baseConfig, onChange);
  await userEvent.click(screen.getByRole("button", { name: "Sat" }));
  expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [6] });
});

it("shows a hidden weekday when its dimmed button is clicked", async () => {
  const onChange = vi.fn();
  mountFields({ ...baseConfig, hiddenWeekdays: [6] }, onChange);
  await userEvent.click(screen.getByRole("button", { name: "Sat" }));
  expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/views/blocks/ui/CalendarBlockConfigFields.test.ts`
Expected: FAIL — no `button` with name "Sat" (still rendering checkboxes).

- [ ] **Step 3: Rewrite the component's `<script setup>`**

Replace the entire `<script setup lang="ts"> ... </script>` block in `src/views/blocks/ui/CalendarBlockConfigFields.vue` with:

```vue
<script setup lang="ts">
import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import type { CalendarBlockFields, CalendarBlockFieldsChange } from "./calendar-block-fields";

const props = defineProps<{
  unit: "month" | "week";
  config: CalendarBlockFields;
  onChange: CalendarBlockFieldsChange;
}>();

const orderedWeekdays = useService(Calendar).weekdaysShort();
const weekdayOptions = orderedWeekdays.map((weekday) => ({ value: weekday.index, label: weekday.label }));
const allWeekdayIndices = orderedWeekdays.map((weekday) => weekday.index);

function setShownWeekdays(shown: number[]): void {
  const hiddenWeekdays = allWeekdayIndices.filter((index) => !shown.includes(index)).toSorted((a, b) => a - b);
  props.onChange({ hiddenWeekdays });
}
</script>
```

- [ ] **Step 4: Replace the weekday `UiSettingRow`**

In the same file's `<template>`, replace the weekday row (the `UiSettingRow` containing the `<label v-for="{ index, label } in orderedWeekdays">` checkboxes) with:

```vue
<UiSettingRow>
    <template #name>{{ m.view_block_config_hidden_weekdays_label() }}</template>
    <UiToggleGroup
      :model-value="allWeekdayIndices.filter((index) => !config.hiddenWeekdays.includes(index))"
      :options="weekdayOptions"
      @update:model-value="setShownWeekdays"
    />
  </UiSettingRow>
```

Leave the `before`, `after`, and `weeks` rows unchanged.

- [ ] **Step 5: Rename the i18n label**

In `messages/en.json`, change the value:

old: `  "view_block_config_hidden_weekdays_label": "Hide days of the week",`
new: `  "view_block_config_hidden_weekdays_label": "Days of the week",`

- [ ] **Step 6: Recompile i18n**

Run: `npm run compile:i18n`
Expected: succeeds; `src/i18n/paraglide` regenerated.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/views/blocks/ui/CalendarBlockConfigFields.test.ts`
Expected: PASS — all tests including the two rewritten ones.

- [ ] **Step 8: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/views/blocks/ui/CalendarBlockConfigFields.vue \
  src/views/blocks/ui/CalendarBlockConfigFields.test.ts \
  messages/en.json src/i18n/paraglide
git commit -m "refactor(views): use UiToggleGroup for the weekday selector"
```

---

### Task 3: Adopt in period-buttons config

**Files:**

- Modify: `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItemConfig.vue` (whole file)
- Modify: `messages/en.json` (add `view_toolbar_period_buttons_config_label`)

**Interfaces:**

- Consumes: `UiToggleGroup` (Task 1); `PeriodButtonsConfig = { week: boolean; month: boolean; quarter: boolean; year: boolean }`; `props.onChange(next: PeriodButtonsConfig)`; existing messages `m.view_toolbar_button_config_level_option({ level })` and `m.view_toolbar_period_buttons_config({ period })`.

- [ ] **Step 1: Add the group-label message**

In `messages/en.json`, add a key before the `defined_navigation` label:

old:

```json
  "view_toolbar_defined_navigation_label": "Defined-note navigation",
```

new:

```json
  "view_toolbar_period_buttons_config_label": "Periods",

  "view_toolbar_defined_navigation_label": "Defined-note navigation",
```

- [ ] **Step 2: Recompile i18n**

Run: `npm run compile:i18n`
Expected: succeeds; `m.view_toolbar_period_buttons_config_label` now exists.

- [ ] **Step 3: Rewrite the config component**

Replace the entire contents of `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItemConfig.vue` with:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import type { PeriodButtonsConfig, PeriodButtonsConfigChange } from "../period-buttons-item";

type Period = "week" | "month" | "quarter" | "year";

const props = defineProps<{
  config: PeriodButtonsConfig;
  onChange: PeriodButtonsConfigChange;
}>();

const allPeriods: readonly Period[] = ["week", "month", "quarter", "year"];
const periodOptions = allPeriods.map((period) => ({
  value: period,
  label: m.view_toolbar_button_config_level_option({ level: period }),
  tooltip: m.view_toolbar_period_buttons_config({ period }),
}));

function setShownPeriods(shown: Period[]): void {
  props.onChange({
    week: shown.includes("week"),
    month: shown.includes("month"),
    quarter: shown.includes("quarter"),
    year: shown.includes("year"),
  });
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_period_buttons_config_label() }}</template>
    <UiToggleGroup
      :model-value="allPeriods.filter((period) => config[period])"
      :options="periodOptions"
      @update:model-value="setShownPeriods"
    />
  </UiSettingRow>
</template>
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass.

- [ ] **Step 5: Update the pre-existing config test**

There **is** a pre-existing test file — `src/views/toolbar-items/period-buttons/PeriodButtonsItemConfig.test.ts` (note: it sits one directory up from the SFC, not under `ui/`). Its four tests drive the old `UiToggle` via `getAllByRole("checkbox")` and will break on this change. Switch each to the new button, queried by its accessible name — which is the tooltip surfaced as `aria-label`, i.e. `screen.getByRole("button", { name: "Show week" })` (and `Show month`/`Show quarter`/`Show year`). Keep every `onChange` payload identical, and delete the now-unused `TOGGLE_INDEX` map.

- [ ] **Step 6: Run the toolbar tests**

Run: `npm test -- src/views/toolbar-items`
Expected: PASS — the updated `PeriodButtonsItemConfig` tests plus the rest of the toolbar suite.

- [ ] **Step 7: Commit**

```bash
git add src/views/toolbar-items/period-buttons/ui/PeriodButtonsItemConfig.vue \
  src/views/toolbar-items/period-buttons/PeriodButtonsItemConfig.test.ts \
  messages/en.json src/i18n/paraglide
git commit -m "refactor(views): use UiToggleGroup for period-buttons config"
```

---

### Task 4: Adopt in button-item period levels (min-1 preserved)

**Files:**

- Modify: `src/views/toolbar-items/button/ui/ButtonItemConfig.vue` (script: remove `toggleLevel`, add `levelOptions` + `setLevels`; template: replace the per-level rows)
- Modify: `messages/en.json` (add `view_toolbar_button_config_levels_label`)

**Interfaces:**

- Consumes: `UiToggleGroup` (Task 1); `allLevels: readonly ButtonLevel[]` (already declared in the file, `["day","week","month","quarter","year"]`); `periodAction.value.levels: ButtonLevel[]`; `update(patch: Partial<ButtonConfig>)`; message `m.view_toolbar_button_config_level_option({ level })`.

- [ ] **Step 1: Add the group-label message**

In `messages/en.json`, add a key after the mode label:

old:

```json
  "view_toolbar_button_config_mode_label": "Behavior",
```

new:

```json
  "view_toolbar_button_config_mode_label": "Behavior",
  "view_toolbar_button_config_levels_label": "Periods",
```

- [ ] **Step 2: Recompile i18n**

Run: `npm run compile:i18n`
Expected: succeeds; `m.view_toolbar_button_config_levels_label` now exists.

- [ ] **Step 3: Replace `toggleLevel` with `levelOptions` + `setLevels`**

In `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`, delete the whole `toggleLevel` function:

```ts
function toggleLevel(level: ButtonLevel, enabled: boolean): void {
  const action = periodAction.value;
  if (!action) return;
  const selected = new Set(action.levels);
  if (enabled) {
    selected.add(level);
  } else {
    if (selected.size === 1) return;
    selected.delete(level);
  }
  update({ action: { ...action, levels: allLevels.filter((l) => selected.has(l)) } });
}
```

and replace it with:

```ts
const levelOptions = allLevels.map((level) => ({
  value: level,
  label: m.view_toolbar_button_config_level_option({ level }),
}));

function setLevels(levels: ButtonLevel[]): void {
  const action = periodAction.value;
  if (!action || levels.length === 0) return;
  update({ action: { ...action, levels: allLevels.filter((level) => levels.includes(level)) } });
}
```

- [ ] **Step 4: Swap the `UiToggle` import for `UiToggleGroup`**

`UiToggle` is used only in the per-level rows being removed (Step 5), so it becomes unused. Replace its import line:

old: `import UiToggle from "@/ui/UiToggle.vue";`
new: `import UiToggleGroup from "@/ui/UiToggleGroup.vue";`

(Keep the alphabetical import ordering ESLint enforces — `UiToggleGroup` sorts after `UiTextInput`, same position `UiToggle` held.)

- [ ] **Step 5: Replace the per-level rows in the template**

Replace this block:

```vue
<UiSettingRow v-for="level of allLevels" :key="level">
      <template #name>{{ m.view_toolbar_button_config_level_option({ level }) }}</template>
      <UiToggle
        :model-value="periodAction.levels.includes(level)"
        :tooltip="m.view_toolbar_button_config_level_option({ level })"
        @update:model-value="(enabled: boolean | undefined) => toggleLevel(level, enabled ?? false)"
      />
    </UiSettingRow>
```

with:

```vue
<UiSettingRow>
      <template #name>{{ m.view_toolbar_button_config_levels_label() }}</template>
      <UiToggleGroup
        :model-value="periodAction.levels"
        :options="levelOptions"
        @update:model-value="setLevels"
      />
    </UiSettingRow>
```

- [ ] **Step 6: Update the pre-existing config test**

There **is** a pre-existing test file — `src/views/toolbar-items/button/ButtonItemConfig.test.ts` (one directory up from the SFC, not under `ui/`). Its `describe("action levels")` block and the `navigate-step` "renders no period-level toggles" test drive the old `UiToggle` via `getAllByRole("checkbox")` and will break. Unlike the period-buttons buttons, the level buttons carry **no tooltip**, so each button's accessible name is its **visible label** (`"Day"`, `"Week"`, `"Month"`, `"Quarter"`, `"Year"`). Button order matches `allLevels` (day, week, month, quarter, year), so:

- `"adds a period level…"`: `getAllByRole("checkbox")[1]` → `getByRole("button", { name: "Week" })`; payload stays `levels: ["day", "week"]`.
- `"orders enabled levels canonically…"`: `checkbox[0]` → `getByRole("button", { name: "Day" })`; payload stays `["day", "month"]`.
- `"removes a period level…"`: `checkbox[0]` → `getByRole("button", { name: "Day" })`; payload stays `["week"]`.
- `"keeps the last remaining level…"` (the min-1 guard): `checkbox[0]` → `getByRole("button", { name: "Day" })`; assertion stays `expect(onChange).not.toHaveBeenCalled()` (clicking the only active level makes `UiToggleGroup` emit `[]`, which `setLevels` ignores).
- `"renders no period-level toggles"`: `queryAllByRole("checkbox")` is now vacuously empty — assert on a level button instead, e.g. `expect(screen.queryByRole("button", { name: "Day" })).toBeNull()`.

Do not weaken any assertion to paper over a behavior change; if a payload or the min-1 assertion does not hold, the implementation is wrong.

- [ ] **Step 7: Type-check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both pass (no dangling `UiToggle` import).

- [ ] **Step 8: Commit**

```bash
git add src/views/toolbar-items/button/ui/ButtonItemConfig.vue \
  src/views/toolbar-items/button/ButtonItemConfig.test.ts \
  messages/en.json src/i18n/paraglide
git commit -m "refactor(views): use UiToggleGroup for button period levels"
```

---

### Final verification

- [ ] **Step 1: Run the full gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Open a calendar view's block config and confirm: all weekday buttons are highlighted by default; clicking one dims it and the day disappears from the grid; clicking again restores it. Confirm the period-buttons config and a period-select button's level row render as segmented groups, and that the level group refuses to drop below one active period.

## Notes on scope

- `hiddenWeekdays`, the Valibot schemas, and runtime calendar rendering are untouched — this is a settings-UI swap only. The existing view-blocks e2e (asserts the rendered weekday header) is unaffected, so no e2e change is included.
- `PeriodButtonsItemConfig` and `ButtonItemConfig` **already have** test files — colocated one directory up from each SFC (`toolbar-items/<item>/XxxConfig.test.ts`, not under `ui/`). Both drive the old `UiToggle` via `getAllByRole("checkbox")`, so Tasks 3 and 4 update them to the new buttons (Task 3 Step 5, Task 4 Step 6) rather than adding new suites. No new component-test harness is introduced; the `ButtonItemConfig` min-1 guard keeps its existing `keeps the last remaining level` test.
