# Configurable Navigation Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a `navigate-step` toolbar button fully editable — expose Direction (Previous/Next) and Granularity (Week/Month/Quarter/Year) as config dropdowns, and collapse the two month presets into one "Navigate" preset.

**Architecture:** The `button` toolbar item already carries `direction`/`unit`/`amount` on its `navigate-step` action but renders no config UI for them. We narrow the step-unit picklist (drop `day`), add two `UiDropdown`s to `ButtonItemConfig.vue` gated on a new `stepAction` computed, consolidate the presets, and add/remove the matching i18n keys. Runtime click behavior and the default Calendar view are untouched.

**Tech Stack:** TypeScript, Vue 3 `<script setup>` SFCs, valibot schemas, ts-pattern (`resolveButtonAppearance`), paraglide (inlang) i18n, Vitest + @testing-library/vue.

## Global Constraints

- Package manager is **npm** (not pnpm). Quality gates: `npm run test`, `npm run check:types`, `npm run check:lint`. Run all three before each commit; all must pass.
- After editing `messages/en.json`, regenerate the committed paraglide output: `npx paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`. Commit the regenerated `src/i18n/paraglide/**` alongside the message change (`check:types` reads the generated files; it does not regenerate them).
- **No `eslint-disable` comments** — fix the code instead.
- **No `Co-Authored-By`** trailer in commit messages.
- Commit to the **current branch** (`v3-ai`). Do **not** create a new branch.
- Component tests use **@testing-library/vue + user-event**; assert observable outcomes (emitted `onChange` payloads, rendered controls) — no CSS-class queries, no test-only `data-*` attrs.
- **One behavior per test**; test names describe subject + behavior.
- **Do not touch** `src/views/default-view.ts` or the e2e fixture `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`. Its `month`/`year` nav buttons stay valid.
- The `amount` field stays in the schema at its default of `1`. **No UI** is added for it; every code path preserves the existing `amount` by spreading `...action`.
- `day` is dropped from the **navigate-step** step unit only. The `pick-date`/`current` `levels` field keeps `day`.

---

## File Structure

- `src/views/toolbar-items/button/button-config.ts` — schema + `resolveButtonAppearance`. Add `stepUnitField`, `ButtonStepUnit` type; narrow `navigate-step.unit`; drop `day` from the appearance match arms.
- `src/views/toolbar-items/button/button-config.test.ts` — remove the two `unit: "day"` navigate-step cases (they no longer typecheck).
- `messages/en.json` — remove two preset keys; add one preset key + three config keys.
- `src/i18n/paraglide/**` — regenerated (committed) output; not hand-edited.
- `src/views/toolbar-items/button/button-item.ts` — replace two presets with one.
- `src/views/toolbar-items/button/ui/ButtonItemConfig.vue` — add `stepAction` computed + Direction/Granularity dropdowns.
- `src/views/toolbar-items/button/ButtonItemConfig.test.ts` — rewrite the `navigate-step action` describe to cover the two new dropdowns.

---

## Task 1: Narrow the navigate-step step unit and appearance

**Files:**

- Modify: `src/views/toolbar-items/button/button-config.ts`
- Test: `src/views/toolbar-items/button/button-config.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `ButtonStepUnit = "week" | "month" | "quarter" | "year"` (exported); `navigate-step` action's `unit` is now typed `ButtonStepUnit`. Task 3 imports `ButtonStepUnit`.

- [ ] **Step 1: Narrow the schema unit field**

In `button-config.ts`, replace the `unitField` declaration (line 10):

```ts
const unitField = v.picklist(["day", "week", "month", "quarter", "year"] as const);
```

with:

```ts
const stepUnitField = v.picklist(["week", "month", "quarter", "year"] as const);
```

Then in `buttonActionSchema`, change the navigate-step `unit` (line 18) from `unit: unitField,` to `unit: stepUnitField,`.

- [ ] **Step 2: Export the step-unit type**

In `button-config.ts`, after `export type ButtonLevel = ...` (line 33), add:

```ts
export type ButtonStepUnit = "week" | "month" | "quarter" | "year";
```

- [ ] **Step 3: Drop `day` from the appearance match arms**

In `resolveButtonAppearance`, update the two navigate-step "day/week/month" arms (lines 75 and 83) to drop `"day"`:

```ts
    .with({ type: "navigate-step", direction: "prev", unit: P.union("week", "month") }, ({ unit }) => ({
      icon: icons.nav.prev,
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "prev", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: icons.nav.prevLeap,
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("week", "month") }, ({ unit }) => ({
      icon: icons.nav.next,
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: icons.nav.nextLeap,
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit }),
    }))
```

(Only `"day"` is removed from the two `P.union(...)` lists; the `quarter`/`year` arms are unchanged. The match stays exhaustive over the four remaining units.)

- [ ] **Step 4: Remove the `unit: "day"` test cases**

In `button-config.test.ts`, delete the two tests that use `unit: "day"` — they no longer typecheck. Delete the `describe("navigate-step prev")` block's first test (lines 65-69):

```ts
it("uses chevron-left + prev tooltip for day", () => {
  const a = resolveButtonAppearance({ type: "navigate-step", direction: "prev", unit: "day", amount: 1 });
  expect(a.icon).toBe("chevron-left");
  expect(a.tooltip).toBe(m.view_toolbar_button_default_tooltip_prev_unit({ unit: "day" }));
});
```

and the `describe("navigate-step next")` block's first test (lines 97-101):

```ts
it("uses chevron-right for day", () => {
  expect(resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "day", amount: 1 }).icon).toBe(
    "chevron-right",
  );
});
```

Leave every other test in the file unchanged (week/month/quarter/year for both directions, and the next-year tooltip test, all still cover the mapping).

- [ ] **Step 5: Run type check to verify the narrowing compiles**

Run: `npm run check:types`
Expected: PASS. (If it fails with a `day` error, a stray `unit: "day"` navigate-step reference remains — find and remove it.)

- [ ] **Step 6: Run the appearance tests**

Run: `npm run test -- button-config`
Expected: PASS — the remaining prev/next × week/month/quarter/year cases resolve to the same icons as before.

- [ ] **Step 7: Lint**

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/toolbar-items/button/button-config.ts src/views/toolbar-items/button/button-config.test.ts
git commit -m "refactor(views): drop day from navigate-step step unit"
```

---

## Task 2: Consolidate presets and update i18n

**Files:**

- Modify: `messages/en.json`
- Modify (regenerated): `src/i18n/paraglide/**`
- Modify: `src/views/toolbar-items/button/button-item.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: i18n message functions used by Task 3 — `m.view_toolbar_button_config_direction_label()`, `m.view_toolbar_button_config_direction_option({ direction })` (`direction` = `"prev" | "next"`), `m.view_toolbar_button_config_granularity_label()`; and `m.view_toolbar_button_preset_navigate()` used here.

- [ ] **Step 1: Confirm the preset keys are referenced only where expected**

Run: `grep -rn "view_toolbar_button_preset_prev_month\|view_toolbar_button_preset_next_month" src messages`
Expected: matches only in `messages/en.json` and `src/views/toolbar-items/button/button-item.ts`. (If anything else references them, that file must be updated too — none is expected.)

- [ ] **Step 2: Edit the messages**

In `messages/en.json`, remove these two lines (824-825):

```json
  "view_toolbar_button_preset_prev_month": "Navigate previous month",
  "view_toolbar_button_preset_next_month": "Navigate next month",
```

In their place add the single preset key:

```json
  "view_toolbar_button_preset_navigate": "Navigate by step",
```

Then, immediately after the `view_toolbar_button_config_level_option` block (ends at line 862, the `]` before `"view_block_config_before"`), add three config keys:

```json
  "view_toolbar_button_config_direction_label": "Direction",
  "view_toolbar_button_config_direction_option": [
    {
      "declarations": ["input direction"],
      "selectors": ["direction"],
      "match": {
        "direction=prev": "Previous",
        "direction=next": "Next"
      }
    }
  ],
  "view_toolbar_button_config_granularity_label": "Granularity",
```

Ensure the surrounding commas remain valid JSON (the key before your insertion needs a trailing comma; the file must still parse).

- [ ] **Step 3: Regenerate the paraglide output**

Run: `npx paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`
Expected: `✔ Successfully compiled inlang project.` This rewrites `src/i18n/paraglide/**` with the new/removed message functions.

- [ ] **Step 4: Replace the two presets with one**

In `button-item.ts`, replace the two preset object literals (lines 29-40, the `prev_month` and `next_month` entries) with one:

```ts
    {
      label: m.view_toolbar_button_preset_navigate(),
      defaultConfig: {
        action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
      },
    },
```

Leave the `pick_date` and `today` presets (lines 21-28) unchanged.

- [ ] **Step 5: Type check (old keys gone, new key wired)**

Run: `npm run check:types`
Expected: PASS. A failure referencing `view_toolbar_button_preset_prev_month`/`next_month` means a reference to a removed key remains, or the paraglide compile (Step 3) was skipped.

- [ ] **Step 6: Run the full test suite and lint**

Run: `npm run test && npm run check:lint`
Expected: PASS (nothing references the removed presets at runtime).

- [ ] **Step 7: Commit**

```bash
git add messages/en.json src/i18n/paraglide src/views/toolbar-items/button/button-item.ts
git commit -m "feat(views): consolidate navigate presets into one Navigate preset"
```

---

## Task 3: Add Direction and Granularity config dropdowns

**Files:**

- Modify: `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`
- Test: `src/views/toolbar-items/button/ButtonItemConfig.test.ts`

**Interfaces:**

- Consumes: `ButtonStepUnit` from Task 1 (`button-config.ts`); the i18n functions from Task 2.
- Produces: for a `navigate-step` config, the config panel renders exactly two `combobox`es — index 0 Direction (`prev`/`next`), index 1 Granularity (`week`/`month`/`quarter`/`year`) — and no `checkbox`es. Each selection calls `onChange` with the updated action, preserving `type` and `amount`.

- [ ] **Step 1: Write the failing component tests**

In `ButtonItemConfig.test.ts`, replace the entire existing `describe("navigate-step action", ...)` block (lines 129-135) with:

```ts
describe("navigate-step action", () => {
  const stepConfig: ButtonConfig = {
    action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
  };

  it("renders no period-level toggles", () => {
    mountConfig(stepConfig, vi.fn());
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("emits onChange with the selected direction when the direction dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig(stepConfig, onChange);
    const [directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "prev");
    expect(onChange).toHaveBeenLastCalledWith({
      action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 },
    });
  });

  it("emits onChange with the selected granularity when the granularity dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig(stepConfig, onChange);
    const [, granularityDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(granularityDropdown, "quarter");
    expect(onChange).toHaveBeenLastCalledWith({
      action: { type: "navigate-step", direction: "next", unit: "quarter", amount: 1 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- ButtonItemConfig`
Expected: FAIL — the two dropdown tests fail because no `combobox` renders for a navigate-step config yet (`getAllByRole("combobox")` returns an empty array, destructuring yields `undefined`).

- [ ] **Step 3: Add the `stepAction` computed and setters**

In `ButtonItemConfig.vue` `<script setup>`, import the step-unit type by adding `type ButtonStepUnit` to the existing import from `../button-config`:

```ts
import {
  resolveButtonAppearance,
  type ButtonConfig,
  type ButtonConfigChange,
  type ButtonLevel,
  type ButtonStepUnit,
} from "../button-config";
```

Then, after the existing `periodAction` computed (line 31-34), add:

```ts
const stepAction = computed(() => {
  const action = props.config.action;
  return action.type === "navigate-step" ? action : null;
});

const stepUnits: readonly ButtonStepUnit[] = ["week", "month", "quarter", "year"];

function setDirection(direction: "prev" | "next"): void {
  const action = stepAction.value;
  if (!action) return;
  update({ action: { ...action, direction } });
}

function setUnit(unit: ButtonStepUnit): void {
  const action = stepAction.value;
  if (!action) return;
  update({ action: { ...action, unit } });
}
```

- [ ] **Step 4: Add the dropdowns to the template**

In `ButtonItemConfig.vue`, after the closing `</template>` of the `v-if="periodAction"` block (line 103), add a sibling block:

```vue
<template v-if="stepAction">
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_direction_label() }}</template>
    <UiDropdown
      :model-value="stepAction.direction"
      @update:model-value="(value: string | undefined) => value && setDirection(value as 'prev' | 'next')"
    >
      <option value="prev">{{ m.view_toolbar_button_config_direction_option({ direction: "prev" }) }}</option>
      <option value="next">{{ m.view_toolbar_button_config_direction_option({ direction: "next" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_button_config_granularity_label() }}</template>
    <UiDropdown
      :model-value="stepAction.unit"
      @update:model-value="
          (value: string | undefined) => value && setUnit(value as 'week' | 'month' | 'quarter' | 'year')
        "
    >
      <option v-for="unit of stepUnits" :key="unit" :value="unit">
        {{ m.view_toolbar_button_config_level_option({ level: unit }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
</template>
```

(`UiDropdown` and `UiSettingRow` are already imported. The Direction block must come first so it is `combobox` index 0, matching the tests.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- ButtonItemConfig`
Expected: PASS — direction and granularity selections emit the updated action with `type` and `amount: 1` preserved; no checkboxes render for navigate-step.

- [ ] **Step 6: Type check and lint**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Full suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/toolbar-items/button/ui/ButtonItemConfig.vue src/views/toolbar-items/button/ButtonItemConfig.test.ts
git commit -m "feat(views): add direction and granularity controls to navigation button"
```

---

## Manual verification (after all tasks)

In a running vault: open the view editor, add a toolbar **Button** item and pick the **Navigate by step** preset. Confirm the config panel shows **Direction** (Previous/Next) and **Granularity** (Week/Month/Quarter/Year) dropdowns, that changing them updates the button's chevron icon/tooltip live, and that clicking the button in the live toolbar steps the calendar by the chosen unit. Confirm the default Calendar view's existing nav buttons still work unchanged.
