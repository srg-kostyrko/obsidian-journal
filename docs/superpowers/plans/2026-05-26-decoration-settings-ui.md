# Decoration Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v2 calendar-decoration editor UI into v3 as a new sub-feature `src/decorations/settings/`, plugged into `JournalEditSubpage` via `JournalEditSectionToken`.

**Architecture:** A `DecorationsSection` SFC renders the per-journal "Calendar decorations" block in the journal edit page. An `EditDecorationFlow` (handles add + edit) and `DeleteDecorationFlow` open modals via `ModalService` and write back through `JournalsRepository.update`. The `EditDecorationModal` owns a vee-validate `useForm` over the existing `decorationSchema`, with leaf editors binding to field paths like `conditions.3.value` and `styles.2.color`. Per-variant dispatch (`ConditionItem` / `StyleItem`) uses `ts-pattern`.

**Tech Stack:** Vue 3 SFCs with `<script setup>`, `defineModel`, vee-validate + `@vee-validate/valibot`, valibot, ts-pattern, `@testing-library/vue` + `user-event`, vitest, the existing `infrastructure/host/modals` system, `infrastructure/di`, `infrastructure/flows`, `infrastructure/result` (`AsyncResult` + `attempt.in` + `Option.fromNullable`).

**Reference spec:** `docs/superpowers/specs/2026-05-26-decoration-settings-ui-design.md`.

---

## File Structure

**New files:**

- `src/decorations/errors.ts` — `UnknownDecorationError`, `DecorationLifecycleFlowError`, `toDecorationFlowError`.
- `src/ui/UiColorSettingsPicker.vue` + `src/ui/UiColorSettingsPicker.test.ts` — shared `ColorSettings` picker.
- `src/decorations/ui/DecorationPreview.vue` + `src/decorations/ui/DecorationPreview.test.ts` — preview SFC that renders the same DOM as `CellDecoration` from a passed-in styles array (no injection / no `Period` required).
- `src/decorations/settings/module.ts` — `decorationsSettingsModule`.
- `src/decorations/settings/ui/describe-condition.ts` + test — pure localization helper.
- `src/decorations/settings/ui/modals.ts` — `defineModal` registrations.
- `src/decorations/settings/ui/DecorationsSection.vue` + test.
- `src/decorations/settings/ui/EditDecorationModal.vue` + test.
- `src/decorations/settings/ui/DeleteDecorationModal.vue` + test.
- `src/decorations/settings/ui/ConditionItem.vue` + test.
- `src/decorations/settings/ui/ConditionTitle.vue` + test.
- `src/decorations/settings/ui/ConditionTag.vue` + test.
- `src/decorations/settings/ui/ConditionProperty.vue` + test.
- `src/decorations/settings/ui/ConditionDate.vue` + test.
- `src/decorations/settings/ui/ConditionWeekday.vue` + test.
- `src/decorations/settings/ui/ConditionOffset.vue` + test.
- `src/decorations/settings/ui/ConditionTypeOnly.vue` + test.
- `src/decorations/settings/ui/StyleItem.vue` + test.
- `src/decorations/settings/ui/StyleBackground.vue` + test.
- `src/decorations/settings/ui/StyleColor.vue` + test.
- `src/decorations/settings/ui/StyleCorner.vue` + test.
- `src/decorations/settings/ui/StyleShape.vue` + test.
- `src/decorations/settings/ui/StyleIcon.vue` + test.
- `src/decorations/settings/ui/StyleBorderSide.vue` + test.
- `src/decorations/settings/ui/StyleBorder.vue` + test.
- `src/decorations/settings/flows/edit-decoration.flow.ts` + test.
- `src/decorations/settings/flows/delete-decoration.flow.ts` + test.

**Modified files:**

- `messages/en.json` — add `decoration_*` and `ui_color_*` keys.
- `src/decorations/index.ts` — export the new `DecorationPreview` and error types.
- `src/main.ts` — register `decorationsSettingsModule`.

---

## Conventions

- Quality gates after every commit: `npm test`, `npm run check:types`, `npm run check:lint` (per `feedback_quality_gates`).
- Tests are colocated and use `@testing-library/vue` + `user-event` for components (`feedback_test_hygiene`, `feedback_testing_library_for_components`).
- Test names: subject + verb, behavior-focused; one behavior per test; nested `describe` for scope (`feedback_test_descriptions`, `feedback_one_behavior_per_test`, `feedback_nested_describes`).
- Black-box assertions; don't introspect internals (`feedback_black_box_assertions`).
- `m.*()` inlined in templates, not wrapped in `computed` (`feedback_no_computed_around_i18n`).
- Discriminated-union dispatch uses `ts-pattern.match(...).with(...).exhaustive()` (`feedback_ts_pattern_over_switch`).
- DI: no `.lifetime(Lifetime.Container)` — Container is the default (`feedback_di_omit_default_lifetime`).
- All Error subclasses live in `errors.ts` (`feedback_errors_in_errors_ts`).
- Form errors render inside `UiSettingRow` `#description` slot (`feedback_form_errors_in_description_slot`).
- Modal definitions consolidated into `modals.ts` (`feedback_modals_consolidation`).
- Skip tests for: barrels, module wiring, defineJournalEditSection pass-through, `instanceof Error` trivia, framework re-tests (`feedback_no_wiring_tests`, `feedback_no_trivial_tests`).
- Commits never include the `Co-Authored-By` trailer (`feedback_no_coauthored_by`).
- Stay on the current `v3-ai` branch; do not create new branches (`feedback_no_separate_branches`).
- No `eslint-disable` comments (`feedback_no_lint_silence`); no spec/requirement reference comments (`feedback_no_spec_refs_in_source`); no narrative file-header JSDoc (`feedback_no_what_comments`).

---

## Task 1: Decoration error types

**Files:**

- Create: `src/decorations/errors.ts`
- Modify: `src/decorations/index.ts`

- [ ] **Step 1: Add the file**

Write `src/decorations/errors.ts`:

```ts
import { FlowError } from "@/infrastructure/flows";

export class UnknownDecorationError extends Error {
  readonly kind = "unknown-decoration" as const;
  constructor(
    public readonly journalName: string,
    public readonly index: number,
  ) {
    super(`Decoration not found: journal=${journalName} index=${index}`);
    this.name = "UnknownDecorationError";
  }
}

export type DecorationLifecycleError = UnknownDecorationError;

export class DecorationLifecycleFlowError extends FlowError {
  readonly kind = "decoration-lifecycle" as const;
  constructor(public override readonly cause: DecorationLifecycleError) {
    super(cause.message);
    this.name = "DecorationLifecycleFlowError";
  }
}

export function toDecorationFlowError(cause: DecorationLifecycleError): DecorationLifecycleFlowError {
  return new DecorationLifecycleFlowError(cause);
}
```

- [ ] **Step 2: Re-export from the decorations barrel**

Add to the bottom of `src/decorations/index.ts`:

```ts
export {
  DecorationLifecycleFlowError,
  toDecorationFlowError,
  UnknownDecorationError,
  type DecorationLifecycleError,
} from "./errors";
```

- [ ] **Step 3: Quality gates**

```bash
npm run check:types
npm run check:lint
```

Expected: both pass. No tests yet because trivial error classes don't get tests per `feedback_no_trivial_tests`.

- [ ] **Step 4: Commit**

```bash
git add src/decorations/errors.ts src/decorations/index.ts
git commit -m "feat(decorations): add lifecycle error types"
```

---

## Task 2: i18n messages

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the new keys**

Append the following keys to `messages/en.json`. Place them alphabetically among the existing entries. The file is a flat JSON object — `key: "value"`.

```json
"decoration_add_button": "Add decoration",
"decoration_add_modal_title": "Add decoration",
"decoration_border_mode_label": "{mode, select, uniform {Uniform} different {Different per side} other {{mode}}}",
"decoration_border_side_label": "{side, select, top {Top} bottom {Bottom} left {Left} right {Right} other {{side}}}",
"decoration_border_style_label": "{style, select, solid {Solid} dashed {Dashed} dotted {Dotted} double {Double} other {{style}}}",
"decoration_condition_all_tasks_completed_describe": "all tasks are completed",
"decoration_condition_date_describe": "date is {day}/{month}{year, select, null {} other { /{year}}}",
"decoration_condition_date_day_label": "Day",
"decoration_condition_date_month_label": "Month",
"decoration_condition_date_year_label": "Year",
"decoration_condition_has_note_describe": "a note exists",
"decoration_condition_has_open_task_describe": "the note has an open task",
"decoration_condition_offset_describe": "offset from start is {offset}",
"decoration_condition_offset_label": "Offset",
"decoration_condition_property_condition_label": "Condition",
"decoration_condition_property_describe": "property {name} {op} {value}",
"decoration_condition_property_name_label": "Name",
"decoration_condition_property_value_label": "Value",
"decoration_condition_property_value_type_label": "Type",
"decoration_condition_tag_describe": "tag {op} {value}",
"decoration_condition_tag_value_label": "Tag value",
"decoration_condition_title_describe": "title {op} {value}",
"decoration_condition_title_value_label": "Title value",
"decoration_condition_type_label": "{type, select, title {Title} tag {Tag} property {Property} date {Date} weekday {Weekday} offset {Offset} has-note {Has note} has-open-task {Has open task} all-tasks-completed {All tasks completed} other {{type}}}",
"decoration_condition_weekday_describe": "weekday is {weekdays}",
"decoration_condition_weekday_label": "Weekdays",
"decoration_corner_placement_label": "{placement, select, top-left {Top-left} top-right {Top-right} bottom-left {Bottom-left} bottom-right {Bottom-right} other {{placement}}}",
"decoration_delete_modal_title": "Delete decoration",
"decoration_delete_modal_warning": "This will permanently remove the decoration.",
"decoration_delete_tooltip": "Delete decoration",
"decoration_describe_mode": "{kind, select, and {and} or {or} other {{kind}}}",
"decoration_describe_when": "when",
"decoration_edit_modal_title": "Edit decoration",
"decoration_edit_tooltip": "Edit decoration",
"decoration_modal_add_condition": "Add condition",
"decoration_modal_add_style": "Add style",
"decoration_modal_mode_option": "{kind, select, and {all conditions are} or {any condition is} other {{kind}}}",
"decoration_modal_mode_prefix": "Decorate elements in calendar when",
"decoration_modal_mode_suffix": "fulfilled",
"decoration_modal_no_conditions": "No conditions defined yet",
"decoration_modal_no_styles": "No styles defined yet",
"decoration_no_conditions_error": "At least one condition is required",
"decoration_no_styles_error": "At least one style is required",
"decoration_placement_x_label": "{value, select, left {Left} center {Center} right {Right} other {{value}}}",
"decoration_placement_y_label": "{value, select, top {Top} middle {Middle} bottom {Bottom} other {{value}}}",
"decoration_section_description": "Use decorations to highlight dates in calendar that meet certain conditions.",
"decoration_section_empty": "No calendar decorations configured yet.",
"decoration_section_title": "Calendar decorations",
"decoration_shape_label": "{shape, select, square {Square} circle {Circle} triangle-up {Triangle up} triangle-down {Triangle down} triangle-left {Triangle left} triangle-right {Triangle right} other {{shape}}}",
"decoration_string_op_label": "{op, select, contains {contains} starts-with {starts with} ends-with {ends with} exists {exists} does-not-exist {does not exist} eq {equals} neq {not equals} lt {<} lte {<=} gt {>} gte {>=} is-true {is true} is-false {is false} does-not-contain {does not contain} other {{op}}}",
"decoration_style_background_color_label": "Background color",
"decoration_style_border_color_label": "Color",
"decoration_style_border_mode_label": "Border mode",
"decoration_style_border_show_label": "Show",
"decoration_style_border_style_label": "Style",
"decoration_style_border_width_label": "Width",
"decoration_style_color_label": "Text color",
"decoration_style_corner_color_label": "Color",
"decoration_style_corner_placement_label": "Placement",
"decoration_style_header": "Decorating {type}",
"decoration_style_icon_color_label": "Color",
"decoration_style_icon_icon_label": "Icon",
"decoration_style_icon_placement_x_label": "Horizontal placement",
"decoration_style_icon_placement_y_label": "Vertical placement",
"decoration_style_icon_size_label": "Size",
"decoration_style_shape_color_label": "Color",
"decoration_style_shape_placement_x_label": "Horizontal placement",
"decoration_style_shape_placement_y_label": "Vertical placement",
"decoration_style_shape_shape_label": "Shape",
"decoration_style_shape_size_label": "Size",
"decoration_style_type_label": "{type, select, background {Background} color {Color} shape {Shape} corner {Corner} icon {Icon} border {Border} other {{type}}}",
"ui_color_custom_label": "Color",
"ui_color_kind_label": "{kind, select, transparent {Transparent} theme {Theme variable} custom {Custom} other {{kind}}}",
"ui_color_theme_variable_label": "CSS variable",
```

- [ ] **Step 2: Verify the message types compile**

```bash
npm run check:types
```

Paraglide auto-generates `m.*` typings from `messages/en.json`. If it requires a regen step, run `npm run build` once first or invoke whichever script the repo uses (check `package.json` for an `inlang` / `paraglide` task). Expected: no type errors. Tests stay green because no source changes yet.

- [ ] **Step 3: Quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json
# include any generated paraglide output that lives in version control
git commit -m "feat(i18n): add decoration settings strings"
```

---

## Task 3: Shared `UiColorSettingsPicker`

**Files:**

- Create: `src/ui/UiColorSettingsPicker.vue`
- Create: `src/ui/UiColorSettingsPicker.test.ts`

The picker takes a single `defineModel<ColorSettings>()` and renders a kind dropdown plus the conditional sub-input.

- [ ] **Step 1: Failing test**

Write `src/ui/UiColorSettingsPicker.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import type { ColorSettings } from "@/decorations";

import UiColorSettingsPicker from "./UiColorSettingsPicker.vue";

afterEach(() => cleanup());

function mount(initial: ColorSettings) {
  const model = ref<ColorSettings>(initial);
  render(UiColorSettingsPicker, {
    props: { modelValue: model.value, "onUpdate:modelValue": (v: ColorSettings) => (model.value = v) },
  });
  return model;
}

describe("UiColorSettingsPicker", () => {
  describe("kind selection", () => {
    it("emits a transparent value when switched to transparent", async () => {
      const model = mount({ type: "custom", color: "#ff0000" });
      const select = screen.getByRole("combobox");
      await userEvent.selectOptions(select, "transparent");
      expect(model.value).toEqual({ type: "transparent" });
    });

    it("emits a theme value with an empty name when switched to theme", async () => {
      const model = mount({ type: "transparent" });
      const select = screen.getByRole("combobox");
      await userEvent.selectOptions(select, "theme");
      expect(model.value).toEqual({ type: "theme", name: "" });
    });

    it("emits a custom value with a default color when switched to custom", async () => {
      const model = mount({ type: "transparent" });
      const select = screen.getByRole("combobox");
      await userEvent.selectOptions(select, "custom");
      expect(model.value).toEqual({ type: "custom", color: "#000000" });
    });
  });

  describe("theme variant", () => {
    it("updates the theme variable name as the user types", async () => {
      const model = mount({ type: "theme", name: "" });
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "--text-accent");
      expect(model.value).toEqual({ type: "theme", name: "--text-accent" });
    });
  });

  describe("custom variant", () => {
    it("updates the color as the user picks one", async () => {
      const model = mount({ type: "custom", color: "#000000" });
      const input = document.querySelector('input[type="color"]') as HTMLInputElement;
      await userEvent.click(input);
      // jsdom does not implement the native picker; simulate value change
      input.value = "#abcdef";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(model.value).toEqual({ type: "custom", color: "#abcdef" });
    });
  });
});
```

Run: `npm test -- src/ui/UiColorSettingsPicker.test.ts`
Expected: FAIL (file does not exist).

- [ ] **Step 2: Implement**

Write `src/ui/UiColorSettingsPicker.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import UiColorPicker from "./UiColorPicker.vue";
import UiDropdown from "./UiDropdown.vue";
import UiTextInput from "./UiTextInput.vue";

const model = defineModel<ColorSettings>({ required: true });

const kind = computed<ColorSettings["type"]>({
  get: () => model.value.type,
  set: (next) => {
    if (next === "transparent") model.value = { type: "transparent" };
    else if (next === "theme") model.value = { type: "theme", name: "" };
    else model.value = { type: "custom", color: "#000000" };
  },
});

const themeName = computed<string>({
  get: () => (model.value.type === "theme" ? model.value.name : ""),
  set: (next) => {
    if (model.value.type === "theme") model.value = { type: "theme", name: next };
  },
});

const customColor = computed<string>({
  get: () => (model.value.type === "custom" ? model.value.color : "#000000"),
  set: (next) => {
    if (model.value.type === "custom") model.value = { type: "custom", color: next };
  },
});
</script>

<template>
  <span class="ui-color-settings-picker">
    <UiDropdown v-model="kind">
      <option value="transparent">{{ m.ui_color_kind_label({ kind: "transparent" }) }}</option>
      <option value="theme">{{ m.ui_color_kind_label({ kind: "theme" }) }}</option>
      <option value="custom">{{ m.ui_color_kind_label({ kind: "custom" }) }}</option>
    </UiDropdown>
    <UiTextInput v-if="model.type === 'theme'" v-model="themeName" :placeholder="m.ui_color_theme_variable_label()" />
    <UiColorPicker v-if="model.type === 'custom'" v-model="customColor" />
  </span>
</template>

<style scoped>
.ui-color-settings-picker {
  display: inline-flex;
  gap: var(--size-2-2);
  align-items: center;
}
</style>
```

- [ ] **Step 3: Run tests**

```bash
npm test -- src/ui/UiColorSettingsPicker.test.ts
```

Expected: all pass.

- [ ] **Step 4: Quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/UiColorSettingsPicker.vue src/ui/UiColorSettingsPicker.test.ts
git commit -m "feat(ui): add UiColorSettingsPicker for tagged ColorSettings"
```

---

## Task 4: `describe-condition` helper

**Files:**

- Create: `src/decorations/settings/ui/describe-condition.ts`
- Create: `src/decorations/settings/ui/describe-condition.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/describe-condition.test.ts
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { describeCondition } from "./describe-condition";

describe("describeCondition", () => {
  describe("title", () => {
    it("renders the localized title clause", () => {
      const out = describeCondition({ type: "title", condition: "contains", value: "log" });
      expect(out).toBe(
        m.decoration_condition_title_describe({ op: m.decoration_string_op_label({ op: "contains" }), value: "log" }),
      );
    });
  });

  describe("tag", () => {
    it("renders the localized tag clause", () => {
      const out = describeCondition({ type: "tag", condition: "starts-with", value: "#work" });
      expect(out).toBe(
        m.decoration_condition_tag_describe({
          op: m.decoration_string_op_label({ op: "starts-with" }),
          value: "#work",
        }),
      );
    });
  });

  describe("property", () => {
    it("renders text property clause", () => {
      const out = describeCondition({
        type: "property",
        name: "mood",
        valueType: "text",
        condition: "contains",
        value: "good",
      });
      expect(out).toBe(
        m.decoration_condition_property_describe({
          name: "mood",
          op: m.decoration_string_op_label({ op: "contains" }),
          value: "good",
        }),
      );
    });
  });

  describe("date", () => {
    it("renders without year when year is null", () => {
      const out = describeCondition({ type: "date", day: 14, month: 2, year: null });
      expect(out).toBe(m.decoration_condition_date_describe({ day: 14, month: 2, year: "null" }));
    });
  });

  describe("weekday", () => {
    it("includes moment-derived weekday names", () => {
      const out = describeCondition({ type: "weekday", weekdays: [1, 3] });
      expect(out).toContain("Monday");
      expect(out).toContain("Wednesday");
    });
  });

  describe("offset", () => {
    it("renders the localized offset clause", () => {
      const out = describeCondition({ type: "offset", offset: 5 });
      expect(out).toBe(m.decoration_condition_offset_describe({ offset: 5 }));
    });
  });

  describe("has-note", () => {
    it("renders the localized has-note clause", () => {
      expect(describeCondition({ type: "has-note" })).toBe(m.decoration_condition_has_note_describe());
    });
  });

  describe("has-open-task", () => {
    it("renders the localized has-open-task clause", () => {
      expect(describeCondition({ type: "has-open-task" })).toBe(m.decoration_condition_has_open_task_describe());
    });
  });

  describe("all-tasks-completed", () => {
    it("renders the localized all-tasks-completed clause", () => {
      expect(describeCondition({ type: "all-tasks-completed" })).toBe(
        m.decoration_condition_all_tasks_completed_describe(),
      );
    });
  });
});
```

Run: `npm test -- src/decorations/settings/ui/describe-condition.test.ts`
Expected: FAIL (file does not exist).

- [ ] **Step 2: Implement**

```ts
// src/decorations/settings/ui/describe-condition.ts
import moment from "moment";
import { match } from "ts-pattern";

import type { JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

export function describeCondition(condition: JournalDecorationCondition): string {
  return match(condition)
    .with({ type: "title" }, (c) =>
      m.decoration_condition_title_describe({
        op: m.decoration_string_op_label({ op: c.condition }),
        value: c.value,
      }),
    )
    .with({ type: "tag" }, (c) =>
      m.decoration_condition_tag_describe({
        op: m.decoration_string_op_label({ op: c.condition }),
        value: c.value,
      }),
    )
    .with({ type: "property" }, (c) =>
      m.decoration_condition_property_describe({
        name: c.name,
        op: m.decoration_string_op_label({ op: c.condition }),
        value: "value" in c ? String(c.value) : "",
      }),
    )
    .with({ type: "date" }, (c) =>
      m.decoration_condition_date_describe({
        day: c.day,
        month: c.month,
        year: c.year === null ? "null" : String(c.year),
      }),
    )
    .with({ type: "weekday" }, (c) => {
      const names = moment.localeData().weekdays();
      const list = c.weekdays
        .map((i) => names[i])
        .filter((n): n is string => Boolean(n))
        .join(", ");
      return m.decoration_condition_weekday_describe({ weekdays: list });
    })
    .with({ type: "offset" }, (c) => m.decoration_condition_offset_describe({ offset: c.offset }))
    .with({ type: "has-note" }, () => m.decoration_condition_has_note_describe())
    .with({ type: "has-open-task" }, () => m.decoration_condition_has_open_task_describe())
    .with({ type: "all-tasks-completed" }, () => m.decoration_condition_all_tasks_completed_describe())
    .exhaustive();
}
```

If the `m.decoration_condition_date_describe` paraglide signature rejects `year: "null"`, adjust to the appropriate "no year" representation the i18n message accepts (the message uses `{year, select, null {} other { /{year}}}` from Task 2, so the string `"null"` is fine).

- [ ] **Step 3: Run tests**

```bash
npm test -- src/decorations/settings/ui/describe-condition.test.ts
```

Expected: all pass.

- [ ] **Step 4: Quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/decorations/settings/ui/describe-condition.ts src/decorations/settings/ui/describe-condition.test.ts
git commit -m "feat(decorations): add describeCondition i18n helper"
```

---

## Task 5: `DecorationPreview` SFC

**Why:** The existing `CellDecoration` reads styles from an injected `CellDecorationMapKey` and requires a `Period`. The settings UI needs to render a preview from a raw styles array (today's day-of-month as text). Adding a tiny preview SFC is cleaner than synthesizing injection plumbing per preview site.

**Files:**

- Create: `src/decorations/ui/DecorationPreview.vue`
- Create: `src/decorations/ui/DecorationPreview.test.ts`
- Modify: `src/decorations/index.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/ui/DecorationPreview.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { JournalDecorationStyle } from "../config";

import DecorationPreview from "./DecorationPreview.vue";

afterEach(() => cleanup());

describe("DecorationPreview", () => {
  it("renders the slot content", () => {
    render(DecorationPreview, { props: { styles: [] as JournalDecorationStyle[] }, slots: { default: "14" } });
    expect(screen.getByText("14")).toBeTruthy();
  });

  it("applies a background color when a background style is present", () => {
    const styles: JournalDecorationStyle[] = [{ type: "background", color: { type: "custom", color: "#ff0000" } }];
    render(DecorationPreview, { props: { styles }, slots: { default: "1" } });
    const root = screen.getByTestId("decoration-preview");
    expect(root.getAttribute("style")).toContain("background-color");
  });
});
```

Run: `npm test -- src/decorations/ui/DecorationPreview.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

Copy the structure of `CellDecoration.vue` but accept a `styles` prop directly:

```vue
<!-- src/decorations/ui/DecorationPreview.vue -->
<script setup lang="ts">
import { computed } from "vue";

import {
  backgroundFrom,
  borderStylesFrom,
  cornersFrom,
  paddingFrom,
  placedFrom,
  textColorFrom,
} from "../derive-styles";

import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

import type { JournalDecorationStyle } from "../config";

const props = defineProps<{ styles: readonly JournalDecorationStyle[] }>();

const background = computed(() => backgroundFrom(props.styles));
const textColor = computed(() => textColorFrom(props.styles));
const border = computed(() => borderStylesFrom(props.styles));
const padding = computed(() => paddingFrom(props.styles));
const corners = computed(() => cornersFrom(props.styles));
const placed = computed(() => placedFrom(props.styles));
</script>

<template>
  <span class="decoration-preview" data-testid="decoration-preview">
    <span class="decoration-preview__border" :style="border" />
    <DecorationCorner v-for="(corner, i) in corners" :key="i" :decoration="corner" />
    <span class="decoration-preview__placed">
      <template v-for="(group, key) in placed" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
    <span class="decoration-preview__content"><slot /></span>
  </span>
</template>

<style scoped>
.decoration-preview {
  width: 100%;
  height: 100%;
  padding: v-bind(padding);
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background-color: v-bind(background) !important;
  color: v-bind(textColor) !important;
  line-height: 1;
  position: relative;
  box-sizing: border-box;
  min-width: 2em;
  min-height: 2em;
}
.decoration-preview__border {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.decoration-preview__placed {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}
.decoration-preview__content {
  display: inline-block;
}
.place {
  display: flex;
  gap: 2px;
}
.place-left_top {
  grid-area: 1/1;
  justify-content: flex-start;
  align-items: flex-start;
}
.place-left_middle {
  grid-area: 2/1;
  justify-content: flex-start;
  align-items: center;
}
.place-left_bottom {
  grid-area: 3/1;
  justify-content: flex-start;
  align-items: flex-end;
}
.place-center_top {
  grid-area: 1/2;
  justify-content: center;
  align-items: flex-start;
}
.place-center_middle {
  grid-area: 2/2;
  justify-content: center;
  align-items: center;
}
.place-center_bottom {
  grid-area: 3/2;
  justify-content: center;
  align-items: flex-end;
}
.place-right_top {
  grid-area: 1/3;
  justify-content: flex-end;
  align-items: flex-start;
}
.place-right_middle {
  grid-area: 2/3;
  justify-content: flex-end;
  align-items: center;
}
.place-right_bottom {
  grid-area: 3/3;
  justify-content: flex-end;
  align-items: flex-end;
}
</style>
```

- [ ] **Step 3: Re-export from barrel**

Add to `src/decorations/index.ts`:

```ts
export { default as DecorationPreview } from "./ui/DecorationPreview.vue";
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/decorations/ui/DecorationPreview.test.ts
```

Expected: pass.

- [ ] **Step 5: Quality gates + commit**

```bash
npm test
npm run check:types
npm run check:lint
git add src/decorations/ui/DecorationPreview.vue src/decorations/ui/DecorationPreview.test.ts src/decorations/index.ts
git commit -m "feat(decorations): add DecorationPreview SFC for settings previews"
```

---

## Task 6: `ConditionTypeOnly` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionTypeOnly.vue`
- Create: `src/decorations/settings/ui/ConditionTypeOnly.test.ts`

This leaf renders nothing interactive — just a localized description of the type. It satisfies `has-note`, `has-open-task`, `all-tasks-completed`.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionTypeOnly.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";

import ConditionTypeOnly from "./ConditionTypeOnly.vue";

afterEach(() => cleanup());

describe("ConditionTypeOnly", () => {
  it.each([
    ["has-note", m.decoration_condition_has_note_describe()],
    ["has-open-task", m.decoration_condition_has_open_task_describe()],
    ["all-tasks-completed", m.decoration_condition_all_tasks_completed_describe()],
  ] as const)("renders the description for %s", (type, expected) => {
    render(ConditionTypeOnly, { props: { type } });
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionTypeOnly.vue -->
<script setup lang="ts">
import type { JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import { describeCondition } from "./describe-condition";

const { type } = defineProps<{
  type: Extract<JournalDecorationCondition["type"], "has-note" | "has-open-task" | "all-tasks-completed">;
}>();
</script>

<template>
  <span>{{ describeCondition({ type }) }}</span>
</template>
```

(Don't wrap with `computed` per `feedback_no_computed_around_i18n`; this is a pure render.)

- [ ] **Step 3: Run tests + quality gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionTypeOnly.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionTypeOnly.vue src/decorations/settings/ui/ConditionTypeOnly.test.ts
git commit -m "feat(decorations): add ConditionTypeOnly leaf editor"
```

---

## Task 7: `ConditionTitle` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionTitle.vue`
- Create: `src/decorations/settings/ui/ConditionTitle.test.ts`

The leaf takes `name: string` (a field path prefix, e.g. `"conditions.2"`) and binds two sub-fields: `.condition` (string-op dropdown) and `.value` (text input).

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionTitle.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import ConditionTitle from "./ConditionTitle.vue";

afterEach(() => cleanup());

function mount(initial: { condition: "contains" | "starts-with" | "ends-with"; value: string }) {
  const exposed: { values: { c: typeof initial } } = { values: { c: initial } };
  const Host = defineComponent({
    components: { ConditionTitle },
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ condition: v.string(), value: v.string() }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionTitle, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionTitle", () => {
  it("updates value as the user types", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.type(screen.getByRole("textbox"), "log");
    expect(host.values.c.value).toBe("log");
  });

  it("updates op when a different operator is selected", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "starts-with");
    expect(host.values.c.condition).toBe("starts-with");
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionTitle.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { name } = defineProps<{ name: string }>();

const { value: op } = useField<"contains" | "starts-with" | "ends-with">(`${name}.condition`);
const { value: text } = useField<string>(`${name}.value`);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_title_value_label()">
    <UiDropdown v-model="op">
      <option value="contains">{{ m.decoration_string_op_label({ op: "contains" }) }}</option>
      <option value="starts-with">{{ m.decoration_string_op_label({ op: "starts-with" }) }}</option>
      <option value="ends-with">{{ m.decoration_string_op_label({ op: "ends-with" }) }}</option>
    </UiDropdown>
    <UiTextInput v-model="text" />
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionTitle.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionTitle.vue src/decorations/settings/ui/ConditionTitle.test.ts
git commit -m "feat(decorations): add ConditionTitle leaf editor"
```

---

## Task 8: `ConditionTag` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionTag.vue`
- Create: `src/decorations/settings/ui/ConditionTag.test.ts`

Identical shape to `ConditionTitle` but uses the tag-flavored label key.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionTag.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import ConditionTag from "./ConditionTag.vue";

afterEach(() => cleanup());

function mount(initial: { condition: "contains" | "starts-with" | "ends-with"; value: string }) {
  const exposed: { values: { c: typeof initial } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: v.object({ condition: v.string(), value: v.string() }) })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionTag, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionTag", () => {
  it("updates tag value as the user types", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.type(screen.getByRole("textbox"), "#work");
    expect(host.values.c.value).toBe("#work");
  });

  it("updates op when a different operator is selected", async () => {
    const host = mount({ condition: "contains", value: "" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "ends-with");
    expect(host.values.c.condition).toBe("ends-with");
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionTag.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { name } = defineProps<{ name: string }>();

const { value: op } = useField<"contains" | "starts-with" | "ends-with">(`${name}.condition`);
const { value: text } = useField<string>(`${name}.value`);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_tag_value_label()">
    <UiDropdown v-model="op">
      <option value="contains">{{ m.decoration_string_op_label({ op: "contains" }) }}</option>
      <option value="starts-with">{{ m.decoration_string_op_label({ op: "starts-with" }) }}</option>
      <option value="ends-with">{{ m.decoration_string_op_label({ op: "ends-with" }) }}</option>
    </UiDropdown>
    <UiTextInput v-model="text" />
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionTag.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionTag.vue src/decorations/settings/ui/ConditionTag.test.ts
git commit -m "feat(decorations): add ConditionTag leaf editor"
```

---

## Task 9: `ConditionProperty` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionProperty.vue`
- Create: `src/decorations/settings/ui/ConditionProperty.test.ts`

The property condition is the most complex: `name`, `valueType` (text/number/checkbox), `condition` (operator — set depends on `valueType`), and `value` (text input for text, number input for number, no input for checkbox). Switching `valueType` resets `condition` and `value` to the defaults for the new variant.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionProperty.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionProperty from "./ConditionProperty.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationCondition, { type: "property" }>) {
  const exposed: { values: { c: Extract<JournalDecorationCondition, { type: "property" }> } } = {
    values: { c: initial },
  };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionProperty, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionProperty", () => {
  it("updates the property name as the user types", async () => {
    const host = mount({ type: "property", name: "", valueType: "text", condition: "exists", value: "" });
    const nameInput = screen.getByLabelText("Name");
    await userEvent.type(nameInput, "mood");
    expect(host.values.c.name).toBe("mood");
  });

  it("resets condition and value when switching value type to number", async () => {
    const host = mount({ type: "property", name: "mood", valueType: "text", condition: "contains", value: "good" });
    const typeSelect = screen.getByLabelText("Type");
    await userEvent.selectOptions(typeSelect, "number");
    expect(host.values.c.valueType).toBe("number");
    expect(host.values.c.condition).toBe("exists");
    if (host.values.c.valueType === "number") expect(host.values.c.value).toBe(0);
  });

  it("renders a number input when the value type is number", async () => {
    mount({ type: "property", name: "x", valueType: "number", condition: "eq", value: 0 });
    expect(within(screen.getByLabelText("Value").closest(".setting-item")!).getByRole("spinbutton")).toBeTruthy();
  });

  it("renders no value input for checkbox type", async () => {
    mount({ type: "property", name: "x", valueType: "checkbox", condition: "is-true" });
    expect(screen.queryByLabelText("Value")).toBeNull();
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionProperty.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import type { JournalDecorationPropertyCondition } from "@/decorations";
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

type ValueType = JournalDecorationPropertyCondition["valueType"];
type Op = JournalDecorationPropertyCondition["condition"];

const { name } = defineProps<{ name: string }>();

const { value: propName } = useField<string>(`${name}.name`);
const { value: valueType, setValue: setValueType } = useField<ValueType>(`${name}.valueType`);
const { value: op, setValue: setOp } = useField<Op>(`${name}.condition`);
const { value: text } = useField<string>(`${name}.value`);
const { value: numberValue } = useField<number>(`${name}.value`);

const opsForType = computed<readonly Op[]>(() => {
  if (valueType.value === "text") {
    return ["exists", "does-not-exist", "eq", "neq", "contains", "does-not-contain", "starts-with", "ends-with"];
  }
  if (valueType.value === "number") {
    return ["exists", "does-not-exist", "eq", "neq", "lt", "lte", "gt", "gte"];
  }
  return ["exists", "does-not-exist", "is-true", "is-false"];
});

function onValueTypeChange(next: ValueType): void {
  setValueType(next);
  setOp("exists");
  if (next === "number") numberValue.value = 0;
  else if (next === "text") text.value = "";
}
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_property_name_label()">
    <UiTextInput v-model="propName" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_property_value_type_label()">
    <UiDropdown :model-value="valueType" @update:model-value="onValueTypeChange($event as ValueType)">
      <option value="text">text</option>
      <option value="number">number</option>
      <option value="checkbox">checkbox</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_property_condition_label()">
    <UiDropdown v-model="op">
      <option v-for="o of opsForType" :key="o" :value="o">{{ m.decoration_string_op_label({ op: o }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow v-if="valueType !== 'checkbox'" :name="m.decoration_condition_property_value_label()">
    <UiTextInput v-if="valueType === 'text'" v-model="text" />
    <UiNumberInput v-else v-model="numberValue" />
  </UiSettingRow>
</template>
```

Note: `UiSettingRow` renders its `name` slot inside a `.setting-item-name` div; the test relies on `getByLabelText` matching that — verify; if not, the test should use `screen.getByText("Name")` to scope a section.

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionProperty.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionProperty.vue src/decorations/settings/ui/ConditionProperty.test.ts
git commit -m "feat(decorations): add ConditionProperty leaf editor"
```

---

## Task 10: `ConditionDate` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionDate.vue`
- Create: `src/decorations/settings/ui/ConditionDate.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionDate.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionDate from "./ConditionDate.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationCondition, { type: "date" }>) {
  const exposed: { values: { c: Extract<JournalDecorationCondition, { type: "date" }> } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionDate, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionDate", () => {
  it("updates day, month, and year as the user types", async () => {
    const host = mount({ type: "date", day: -1, month: -1, year: null });
    const inputs = screen.getAllByRole("spinbutton");
    await userEvent.clear(inputs[0]!);
    await userEvent.type(inputs[0]!, "14");
    await userEvent.clear(inputs[1]!);
    await userEvent.type(inputs[1]!, "2");
    await userEvent.clear(inputs[2]!);
    await userEvent.type(inputs[2]!, "2026");
    expect(host.values.c.day).toBe(14);
    expect(host.values.c.month).toBe(2);
    expect(host.values.c.year).toBe(2026);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionDate.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: day } = useField<number>(`${name}.day`);
const { value: month } = useField<number>(`${name}.month`);
const { value: year } = useField<number | null>(`${name}.year`);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_date_day_label()">
    <UiNumberInput v-model="day" :min="1" :max="31" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_month_label()">
    <UiNumberInput v-model="month" :min="1" :max="12" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_date_year_label()">
    <UiNumberInput v-model="year" />
  </UiSettingRow>
</template>
```

If `UiNumberInput` doesn't accept `number | null`, wrap year in a `computed` that maps `null → undefined` for the input and back. Check `src/ui/UiNumberInput.vue` first; if its `defineModel<number>()` is strict, add a wrapper `computed` here in the leaf.

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionDate.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionDate.vue src/decorations/settings/ui/ConditionDate.test.ts
git commit -m "feat(decorations): add ConditionDate leaf editor"
```

---

## Task 11: `ConditionWeekday` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionWeekday.vue`
- Create: `src/decorations/settings/ui/ConditionWeekday.test.ts`

Renders a checkbox per weekday. Names come from `moment.localeData().weekdays()` per `feedback_date_strings_from_moment`.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionWeekday.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionWeekday from "./ConditionWeekday.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationCondition, { type: "weekday" }>) {
  const exposed: { values: { c: typeof initial } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionWeekday, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionWeekday", () => {
  it("adds a weekday index when its checkbox is clicked", async () => {
    const host = mount({ type: "weekday", weekdays: [] });
    await userEvent.click(screen.getByLabelText("Monday"));
    expect(host.values.c.weekdays).toEqual([1]);
  });

  it("removes a weekday index when its checkbox is unchecked", async () => {
    const host = mount({ type: "weekday", weekdays: [1] });
    await userEvent.click(screen.getByLabelText("Monday"));
    expect(host.values.c.weekdays).toEqual([]);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionWeekday.vue -->
<script setup lang="ts">
import moment from "moment";
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: weekdays } = useField<number[]>(`${name}.weekdays`);

const allNames = moment.localeData().weekdays();

function toggle(index: number, checked: boolean): void {
  const next = new Set(weekdays.value);
  if (checked) next.add(index);
  else next.delete(index);
  weekdays.value = [...next].sort((a, b) => a - b);
}

function isChecked(index: number): boolean {
  return weekdays.value.includes(index);
}
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_weekday_label()">
    <label v-for="(label, index) in allNames" :key="index">
      <input
        type="checkbox"
        :checked="isChecked(index)"
        @change="toggle(index, ($event.target as HTMLInputElement).checked)"
      />
      {{ label }}
    </label>
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionWeekday.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionWeekday.vue src/decorations/settings/ui/ConditionWeekday.test.ts
git commit -m "feat(decorations): add ConditionWeekday leaf editor"
```

---

## Task 12: `ConditionOffset` leaf

**Files:**

- Create: `src/decorations/settings/ui/ConditionOffset.vue`
- Create: `src/decorations/settings/ui/ConditionOffset.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionOffset.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";

import ConditionOffset from "./ConditionOffset.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationCondition, { type: "offset" }>) {
  const exposed: { values: { c: typeof initial } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(ConditionOffset, { name: "c" });
    },
  });
  render(Host);
  return exposed;
}

describe("ConditionOffset", () => {
  it("updates the offset as the user types", async () => {
    const host = mount({ type: "offset", offset: 0 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    expect(host.values.c.offset).toBe(5);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionOffset.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_offset_label()">
    <UiNumberInput v-model="offset" />
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionOffset.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionOffset.vue src/decorations/settings/ui/ConditionOffset.test.ts
git commit -m "feat(decorations): add ConditionOffset leaf editor"
```

---

## Task 13: `ConditionItem` dispatcher

**Files:**

- Create: `src/decorations/settings/ui/ConditionItem.vue`
- Create: `src/decorations/settings/ui/ConditionItem.test.ts`

Picks the right leaf via `ts-pattern.match(condition.type)`. The parent passes the current condition value (read from the form's `values`) plus the field-path `name`.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/ConditionItem.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import ConditionItem from "./ConditionItem.vue";

afterEach(() => cleanup());

function mount(initial: JournalDecorationCondition) {
  const Host = defineComponent({
    setup() {
      useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      return () => h(ConditionItem, { name: "c", condition: initial });
    },
  });
  render(Host);
}

describe("ConditionItem", () => {
  it("renders ConditionTitle for a title condition", () => {
    mount({ type: "title", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_condition_title_value_label())).toBeTruthy();
  });

  it("renders ConditionTag for a tag condition", () => {
    mount({ type: "tag", condition: "contains", value: "" });
    expect(screen.getByText(m.decoration_condition_tag_value_label())).toBeTruthy();
  });

  it("renders ConditionProperty for a property condition", () => {
    mount({ type: "property", name: "x", valueType: "text", condition: "exists", value: "" });
    expect(screen.getByText(m.decoration_condition_property_name_label())).toBeTruthy();
  });

  it("renders ConditionDate for a date condition", () => {
    mount({ type: "date", day: -1, month: -1, year: null });
    expect(screen.getByText(m.decoration_condition_date_day_label())).toBeTruthy();
  });

  it("renders ConditionWeekday for a weekday condition", () => {
    mount({ type: "weekday", weekdays: [] });
    expect(screen.getByText(m.decoration_condition_weekday_label())).toBeTruthy();
  });

  it("renders ConditionOffset for an offset condition", () => {
    mount({ type: "offset", offset: 0 });
    expect(screen.getByText(m.decoration_condition_offset_label())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-note", () => {
    mount({ type: "has-note" });
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for has-open-task", () => {
    mount({ type: "has-open-task" });
    expect(screen.getByText(m.decoration_condition_has_open_task_describe())).toBeTruthy();
  });

  it("renders ConditionTypeOnly for all-tasks-completed", () => {
    mount({ type: "all-tasks-completed" });
    expect(screen.getByText(m.decoration_condition_all_tasks_completed_describe())).toBeTruthy();
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/ConditionItem.vue -->
<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, type Component } from "vue";

import type { JournalDecorationCondition } from "@/decorations";

import ConditionDate from "./ConditionDate.vue";
import ConditionOffset from "./ConditionOffset.vue";
import ConditionProperty from "./ConditionProperty.vue";
import ConditionTag from "./ConditionTag.vue";
import ConditionTitle from "./ConditionTitle.vue";
import ConditionTypeOnly from "./ConditionTypeOnly.vue";
import ConditionWeekday from "./ConditionWeekday.vue";

const props = defineProps<{ name: string; condition: JournalDecorationCondition }>();

const leaf = computed<Component>(() =>
  match(props.condition.type)
    .with("title", () => ConditionTitle)
    .with("tag", () => ConditionTag)
    .with("property", () => ConditionProperty)
    .with("date", () => ConditionDate)
    .with("weekday", () => ConditionWeekday)
    .with("offset", () => ConditionOffset)
    .with("has-note", "has-open-task", "all-tasks-completed", () => ConditionTypeOnly)
    .exhaustive(),
);

const leafProps = computed<Record<string, unknown>>(() =>
  props.condition.type === "has-note" ||
  props.condition.type === "has-open-task" ||
  props.condition.type === "all-tasks-completed"
    ? { type: props.condition.type }
    : { name: props.name },
);
</script>

<template>
  <component :is="leaf" v-bind="leafProps" />
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/ConditionItem.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/ConditionItem.vue src/decorations/settings/ui/ConditionItem.test.ts
git commit -m "feat(decorations): add ConditionItem dispatcher"
```

---

## Task 14: `StyleBackground` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleBackground.vue`
- Create: `src/decorations/settings/ui/StyleBackground.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleBackground.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleBackground from "./StyleBackground.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "background" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleBackground, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleBackground", () => {
  it("updates color when the user picks a different kind", async () => {
    const host = mount({ type: "background", color: { type: "transparent" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
    expect(host.values.s.color).toEqual({ type: "theme", name: "" });
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleBackground.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: color } = useField<ColorSettings>(`${name}.color`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_background_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleBackground.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleBackground.vue src/decorations/settings/ui/StyleBackground.test.ts
git commit -m "feat(decorations): add StyleBackground leaf editor"
```

---

## Task 15: `StyleColor` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleColor.vue`
- Create: `src/decorations/settings/ui/StyleColor.test.ts`

Same shape as `StyleBackground` but uses the `decoration_style_color_label` key.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleColor.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleColor from "./StyleColor.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "color" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleColor, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleColor", () => {
  it("updates color when the user picks a different kind", async () => {
    const host = mount({ type: "color", color: { type: "transparent" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    expect(host.values.s.color).toEqual({ type: "custom", color: "#000000" });
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleColor.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: color } = useField<ColorSettings>(`${name}.color`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleColor.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleColor.vue src/decorations/settings/ui/StyleColor.test.ts
git commit -m "feat(decorations): add StyleColor leaf editor"
```

---

## Task 16: `StyleCorner` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleCorner.vue`
- Create: `src/decorations/settings/ui/StyleCorner.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleCorner.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";

import StyleCorner from "./StyleCorner.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "corner" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleCorner, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleCorner", () => {
  it("updates placement when a different corner is chosen", async () => {
    const host = mount({ type: "corner", placement: "top-left", color: { type: "transparent" } });
    const select = screen.getByLabelText(m.decoration_style_corner_placement_label());
    await userEvent.selectOptions(select, "bottom-right");
    expect(host.values.s.placement).toBe("bottom-right");
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleCorner.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationCorner } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: placement } = useField<JournalDecorationCorner["placement"]>(`${name}.placement`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_corner_placement_label()">
    <UiDropdown v-model="placement">
      <option value="top-left">{{ m.decoration_corner_placement_label({ placement: "top-left" }) }}</option>
      <option value="top-right">{{ m.decoration_corner_placement_label({ placement: "top-right" }) }}</option>
      <option value="bottom-left">{{ m.decoration_corner_placement_label({ placement: "bottom-left" }) }}</option>
      <option value="bottom-right">{{ m.decoration_corner_placement_label({ placement: "bottom-right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_corner_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
</template>
```

If `getByLabelText` doesn't bind to UiSettingRow's name slot, swap the test to query by combobox count plus initial selected option.

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleCorner.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleCorner.vue src/decorations/settings/ui/StyleCorner.test.ts
git commit -m "feat(decorations): add StyleCorner leaf editor"
```

---

## Task 17: `StyleShape` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleShape.vue`
- Create: `src/decorations/settings/ui/StyleShape.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleShape.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleShape from "./StyleShape.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "shape" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleShape, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleShape", () => {
  it("updates shape when a new shape is selected", async () => {
    const host = mount({
      type: "shape",
      size: 0.4,
      shape: "square",
      color: { type: "transparent" },
      placement_x: "center",
      placement_y: "middle",
    });
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0]!, "circle");
    expect(host.values.s.shape).toBe("circle");
  });

  it("updates size as the user changes the number", async () => {
    const host = mount({
      type: "shape",
      size: 0.4,
      shape: "square",
      color: { type: "transparent" },
      placement_x: "center",
      placement_y: "middle",
    });
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "0.8");
    expect(host.values.s.size).toBeCloseTo(0.8);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleShape.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationShape } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: shape } = useField<JournalDecorationShape["shape"]>(`${name}.shape`);
const { value: size } = useField<number>(`${name}.size`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: placementX } = useField<JournalDecorationShape["placement_x"]>(`${name}.placement_x`);
const { value: placementY } = useField<JournalDecorationShape["placement_y"]>(`${name}.placement_y`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_shape_shape_label()">
    <UiDropdown v-model="shape">
      <option value="square">{{ m.decoration_shape_label({ shape: "square" }) }}</option>
      <option value="circle">{{ m.decoration_shape_label({ shape: "circle" }) }}</option>
      <option value="triangle-up">{{ m.decoration_shape_label({ shape: "triangle-up" }) }}</option>
      <option value="triangle-down">{{ m.decoration_shape_label({ shape: "triangle-down" }) }}</option>
      <option value="triangle-left">{{ m.decoration_shape_label({ shape: "triangle-left" }) }}</option>
      <option value="triangle-right">{{ m.decoration_shape_label({ shape: "triangle-right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_size_label()">
    <UiNumberInput v-model="size" :min="0" :step="0.1" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_placement_x_label()">
    <UiDropdown v-model="placementX">
      <option value="left">{{ m.decoration_placement_x_label({ value: "left" }) }}</option>
      <option value="center">{{ m.decoration_placement_x_label({ value: "center" }) }}</option>
      <option value="right">{{ m.decoration_placement_x_label({ value: "right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_shape_placement_y_label()">
    <UiDropdown v-model="placementY">
      <option value="top">{{ m.decoration_placement_y_label({ value: "top" }) }}</option>
      <option value="middle">{{ m.decoration_placement_y_label({ value: "middle" }) }}</option>
      <option value="bottom">{{ m.decoration_placement_y_label({ value: "bottom" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleShape.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleShape.vue src/decorations/settings/ui/StyleShape.test.ts
git commit -m "feat(decorations): add StyleShape leaf editor"
```

---

## Task 18: `StyleIcon` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleIcon.vue`
- Create: `src/decorations/settings/ui/StyleIcon.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleIcon.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";

import StyleIcon from "./StyleIcon.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "icon" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleIcon, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleIcon", () => {
  it("updates the size as the user changes the number", async () => {
    const host = mount({
      type: "icon",
      icon: "",
      placement_x: "center",
      placement_y: "middle",
      color: { type: "transparent" },
      size: 0.5,
    });
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "0.9");
    expect(host.values.s.size).toBeCloseTo(0.9);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleIcon.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings, JournalDecorationIcon } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const { name } = defineProps<{ name: string }>();
const { value: icon } = useField<string>(`${name}.icon`);
const { value: size } = useField<number>(`${name}.size`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: placementX } = useField<JournalDecorationIcon["placement_x"]>(`${name}.placement_x`);
const { value: placementY } = useField<JournalDecorationIcon["placement_y"]>(`${name}.placement_y`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_icon_icon_label()">
    <UiIconSuggest v-model="icon" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_icon_size_label()">
    <UiNumberInput v-model="size" :min="0" :step="0.1" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_icon_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_icon_placement_x_label()">
    <UiDropdown v-model="placementX">
      <option value="left">{{ m.decoration_placement_x_label({ value: "left" }) }}</option>
      <option value="center">{{ m.decoration_placement_x_label({ value: "center" }) }}</option>
      <option value="right">{{ m.decoration_placement_x_label({ value: "right" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_icon_placement_y_label()">
    <UiDropdown v-model="placementY">
      <option value="top">{{ m.decoration_placement_y_label({ value: "top" }) }}</option>
      <option value="middle">{{ m.decoration_placement_y_label({ value: "middle" }) }}</option>
      <option value="bottom">{{ m.decoration_placement_y_label({ value: "bottom" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleIcon.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleIcon.vue src/decorations/settings/ui/StyleIcon.test.ts
git commit -m "feat(decorations): add StyleIcon leaf editor"
```

---

## Task 19: `StyleBorderSide` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleBorderSide.vue`
- Create: `src/decorations/settings/ui/StyleBorderSide.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleBorderSide.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { borderSideSchema, type BorderSide } from "@/decorations";

import StyleBorderSide from "./StyleBorderSide.vue";

afterEach(() => cleanup());

function mount(initial: BorderSide) {
  const exposed: { values: { s: BorderSide } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: borderSideSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleBorderSide, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

describe("StyleBorderSide", () => {
  it("toggles show", async () => {
    const host = mount({ show: false, width: 1, color: { type: "transparent" }, style: "solid" });
    await userEvent.click(screen.getByRole("checkbox"));
    expect(host.values.s.show).toBe(true);
  });

  it("updates width", async () => {
    const host = mount({ show: true, width: 1, color: { type: "transparent" }, style: "solid" });
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "3");
    expect(host.values.s.width).toBe(3);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleBorderSide.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

const { name } = defineProps<{ name: string }>();
const { value: show } = useField<boolean>(`${name}.show`);
const { value: width } = useField<number>(`${name}.width`);
const { value: color } = useField<ColorSettings>(`${name}.color`);
const { value: borderStyle } = useField<string>(`${name}.style`);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_show_label()">
    <UiToggle v-model="show" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_width_label()">
    <UiNumberInput v-model="width" :min="0" :step="1" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_color_label()">
    <UiColorSettingsPicker v-model="color" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_style_border_style_label()">
    <UiDropdown v-model="borderStyle">
      <option value="solid">{{ m.decoration_border_style_label({ style: "solid" }) }}</option>
      <option value="dashed">{{ m.decoration_border_style_label({ style: "dashed" }) }}</option>
      <option value="dotted">{{ m.decoration_border_style_label({ style: "dotted" }) }}</option>
      <option value="double">{{ m.decoration_border_style_label({ style: "double" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
```

If `UiToggle` exposes its checkbox without `role="checkbox"`, query by label text instead.

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleBorderSide.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleBorderSide.vue src/decorations/settings/ui/StyleBorderSide.test.ts
git commit -m "feat(decorations): add StyleBorderSide leaf editor"
```

---

## Task 20: `StyleBorder` leaf

**Files:**

- Create: `src/decorations/settings/ui/StyleBorder.vue`
- Create: `src/decorations/settings/ui/StyleBorder.test.ts`

When `border: "uniform"`, edit only one `StyleBorderSide` (`top`); on submit the modal flattens uniform → all four sides copied from `top`. Actually simpler: bind a single `StyleBorderSide` to `name + ".top"` and on submit we'll copy. To keep dispatch local, copy on every change to `top` via a `watch` when mode is uniform. Pseudocode below.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleBorder.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";

import StyleBorder from "./StyleBorder.vue";

afterEach(() => cleanup());

function mount(initial: Extract<JournalDecorationStyle, { type: "border" }>) {
  const exposed: { values: { s: typeof initial } } = { values: { s: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return () => h(StyleBorder, { name: "s" });
    },
  });
  render(Host);
  return exposed;
}

const blankSide = () => ({ show: false, width: 1, color: { type: "transparent" as const }, style: "solid" });

const uniform: Extract<JournalDecorationStyle, { type: "border" }> = {
  type: "border",
  border: "uniform",
  top: blankSide(),
  bottom: blankSide(),
  left: blankSide(),
  right: blankSide(),
};

describe("StyleBorder", () => {
  it("shows only one side editor in uniform mode", () => {
    mount(uniform);
    expect(screen.getAllByText(m.decoration_style_border_show_label())).toHaveLength(1);
  });

  it("shows four side editors in different mode", async () => {
    mount({ ...uniform, border: "different" });
    expect(screen.getAllByText(m.decoration_style_border_show_label())).toHaveLength(4);
  });

  it("mirrors changes to top across the other sides when in uniform mode", async () => {
    const host = mount(uniform);
    const number = screen.getByRole("spinbutton");
    await userEvent.clear(number);
    await userEvent.type(number, "5");
    expect(host.values.s.top.width).toBe(5);
    expect(host.values.s.bottom.width).toBe(5);
    expect(host.values.s.left.width).toBe(5);
    expect(host.values.s.right.width).toBe(5);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleBorder.vue -->
<script setup lang="ts">
import { useField } from "vee-validate";
import { watch } from "vue";

import type { BorderSide, JournalDecorationBorder } from "@/decorations";
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import StyleBorderSide from "./StyleBorderSide.vue";

const { name } = defineProps<{ name: string }>();
const { value: mode } = useField<JournalDecorationBorder["border"]>(`${name}.border`);
const { value: top } = useField<BorderSide>(`${name}.top`);
const { value: bottom } = useField<BorderSide>(`${name}.bottom`);
const { value: left } = useField<BorderSide>(`${name}.left`);
const { value: right } = useField<BorderSide>(`${name}.right`);

watch(
  [top, mode],
  () => {
    if (mode.value !== "uniform") return;
    bottom.value = { ...top.value };
    left.value = { ...top.value };
    right.value = { ...top.value };
  },
  { deep: true },
);
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_mode_label()">
    <UiDropdown v-model="mode">
      <option value="uniform">{{ m.decoration_border_mode_label({ mode: "uniform" }) }}</option>
      <option value="different">{{ m.decoration_border_mode_label({ mode: "different" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <template v-if="mode === 'uniform'">
    <StyleBorderSide :name="`${name}.top`" />
  </template>
  <template v-else>
    <UiSettingRow heading>
      <template #name>{{ m.decoration_style_border_side_label({ side: "top" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.top`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_style_border_side_label({ side: "bottom" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.bottom`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_style_border_side_label({ side: "left" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.left`" />
    <UiSettingRow heading>
      <template #name>{{ m.decoration_style_border_side_label({ side: "right" }) }}</template>
    </UiSettingRow>
    <StyleBorderSide :name="`${name}.right`" />
  </template>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleBorder.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleBorder.vue src/decorations/settings/ui/StyleBorder.test.ts
git commit -m "feat(decorations): add StyleBorder leaf editor"
```

---

## Task 21: `StyleItem` dispatcher

**Files:**

- Create: `src/decorations/settings/ui/StyleItem.vue`
- Create: `src/decorations/settings/ui/StyleItem.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/StyleItem.test.ts
import { toTypedSchema } from "@vee-validate/valibot";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";

import StyleItem from "./StyleItem.vue";

afterEach(() => cleanup());

function mount(initial: JournalDecorationStyle) {
  const Host = defineComponent({
    setup() {
      useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      return () => h(StyleItem, { name: "s", style: initial });
    },
  });
  render(Host);
}

const transparent = { type: "transparent" as const };

describe("StyleItem", () => {
  it("renders StyleBackground for a background style", () => {
    mount({ type: "background", color: transparent });
    expect(screen.getByText(m.decoration_style_background_color_label())).toBeTruthy();
  });

  it("renders StyleColor for a color style", () => {
    mount({ type: "color", color: transparent });
    expect(screen.getByText(m.decoration_style_color_label())).toBeTruthy();
  });

  it("renders StyleCorner for a corner style", () => {
    mount({ type: "corner", placement: "top-left", color: transparent });
    expect(screen.getByText(m.decoration_style_corner_placement_label())).toBeTruthy();
  });

  it("renders StyleShape for a shape style", () => {
    mount({
      type: "shape",
      size: 0.4,
      shape: "square",
      color: transparent,
      placement_x: "center",
      placement_y: "middle",
    });
    expect(screen.getByText(m.decoration_style_shape_shape_label())).toBeTruthy();
  });

  it("renders StyleIcon for an icon style", () => {
    mount({
      type: "icon",
      icon: "",
      placement_x: "center",
      placement_y: "middle",
      color: transparent,
      size: 0.5,
    });
    expect(screen.getByText(m.decoration_style_icon_icon_label())).toBeTruthy();
  });

  it("renders StyleBorder for a border style", () => {
    const blank = () => ({ show: false, width: 1, color: transparent, style: "solid" });
    mount({ type: "border", border: "uniform", top: blank(), bottom: blank(), left: blank(), right: blank() });
    expect(screen.getByText(m.decoration_style_border_mode_label())).toBeTruthy();
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/StyleItem.vue -->
<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, type Component } from "vue";

import type { JournalDecorationStyle } from "@/decorations";

import StyleBackground from "./StyleBackground.vue";
import StyleBorder from "./StyleBorder.vue";
import StyleColor from "./StyleColor.vue";
import StyleCorner from "./StyleCorner.vue";
import StyleIcon from "./StyleIcon.vue";
import StyleShape from "./StyleShape.vue";

const props = defineProps<{ name: string; style: JournalDecorationStyle }>();

const leaf = computed<Component>(() =>
  match(props.style.type)
    .with("background", () => StyleBackground)
    .with("color", () => StyleColor)
    .with("corner", () => StyleCorner)
    .with("shape", () => StyleShape)
    .with("icon", () => StyleIcon)
    .with("border", () => StyleBorder)
    .exhaustive(),
);
</script>

<template>
  <component :is="leaf" :name="name" />
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/StyleItem.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/StyleItem.vue src/decorations/settings/ui/StyleItem.test.ts
git commit -m "feat(decorations): add StyleItem dispatcher"
```

---

## Task 22: `DeleteDecorationModal` SFC

**Files:**

- Create: `src/decorations/settings/ui/DeleteDecorationModal.vue`
- Create: `src/decorations/settings/ui/DeleteDecorationModal.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/DeleteDecorationModal.test.ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";

afterEach(() => cleanup());

function mount() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ confirmed: true }> = { submit, cancel };
  render(DeleteDecorationModal, {
    props: { journalName: "daily" },
    global: {
      plugins: [
        {
          install(app) {
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("DeleteDecorationModal", () => {
  it("renders the warning text", () => {
    mount();
    expect(screen.getByText(m.decoration_delete_modal_warning())).toBeTruthy();
  });

  it("submits confirmed:true when Delete is clicked", async () => {
    const { submit } = mount();
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith({ confirmed: true });
  });

  it("cancels when Cancel is clicked", async () => {
    const { cancel } = mount();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/DeleteDecorationModal.vue -->
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{ journalName: string }>();
const api = useModal<{ confirmed: true }>();
</script>

<template>
  <div>
    <UiSettingRow no-controls>
      <template #description>{{ m.decoration_delete_modal_warning() }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit({ confirmed: true })">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/DeleteDecorationModal.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/DeleteDecorationModal.vue src/decorations/settings/ui/DeleteDecorationModal.test.ts
git commit -m "feat(decorations): add DeleteDecorationModal SFC"
```

---

## Task 23: `modals.ts`

**Files:**

- Create: `src/decorations/settings/ui/modals.ts`

- [ ] **Step 1: Implement**

```ts
// src/decorations/settings/ui/modals.ts
import type { JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";
import EditDecorationModal from "./EditDecorationModal.vue";

import type { JournalConfig } from "@/journals/config";

export interface EditDecorationModalProps {
  journalName: string;
  decoration?: JournalDecoration;
  writeType: JournalConfig["write"]["type"];
}

export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({ decoration }: EditDecorationModalProps) =>
    decoration ? m.decoration_edit_modal_title() : m.decoration_add_modal_title(),
  width: 800,
});

export const deleteDecorationModal = defineModal<{ confirmed: true }>()({
  component: DeleteDecorationModal,
  title: (_: { journalName: string }) => m.decoration_delete_modal_title(),
});
```

`EditDecorationModal` does not exist yet — TypeScript will complain. Continue to Task 24 to create it, then return for type checks. Do NOT commit until the next task lands.

(No commit on this step; commit happens alongside Task 24.)

---

## Task 24: `EditDecorationModal` SFC

**Files:**

- Create: `src/decorations/settings/ui/EditDecorationModal.vue`
- Create: `src/decorations/settings/ui/EditDecorationModal.test.ts`

This is the biggest SFC. It owns the `useForm`, the two `useFieldArray`s, the AND/OR mode selector, the per-row dispatchers, and the preview.

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/EditDecorationModal.test.ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import EditDecorationModal from "./EditDecorationModal.vue";

afterEach(() => cleanup());

function mount(opts: { writeType: "day" | "week" | "custom"; decoration?: JournalDecoration } = { writeType: "day" }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ decoration: JournalDecoration }> = { submit, cancel };
  render(EditDecorationModal, {
    props: { journalName: "daily", writeType: opts.writeType, decoration: opts.decoration },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, undefined as never);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

const transparent = { type: "transparent" as const };
const minimalDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent }],
};

describe("EditDecorationModal", () => {
  describe("submit gating", () => {
    it("does not submit when no conditions are defined", async () => {
      const { submit } = mount({
        writeType: "day",
        decoration: { mode: "and", conditions: [], styles: [{ type: "background", color: transparent }] },
      });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(screen.getByText(m.decoration_no_conditions_error())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("does not submit when no styles are defined", async () => {
      const { submit } = mount({
        writeType: "day",
        decoration: { mode: "and", conditions: [{ type: "has-note" }], styles: [] },
      });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(screen.getByText(m.decoration_no_styles_error())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("submits when both arrays are populated", async () => {
      const { submit } = mount({ writeType: "day", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ decoration: expect.objectContaining({ mode: "and" }) });
      });
    });
  });

  describe("add-condition options", () => {
    it("shows date and weekday for day write type", async () => {
      mount({ writeType: "day", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "date" }))).toBeTruthy();
      expect(screen.getByText(m.decoration_condition_type_label({ type: "weekday" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });

    it("shows offset for custom write type but not date or weekday", async () => {
      mount({ writeType: "custom", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "offset" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
    });

    it("shows only common types for week write type", async () => {
      mount({ writeType: "week", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });
  });

  describe("mode change", () => {
    it("reflects the chosen mode in the submitted decoration", async () => {
      const { submit } = mount({ writeType: "day", decoration: { ...minimalDecoration, mode: "and" } });
      await userEvent.selectOptions(screen.getByDisplayValue(m.decoration_modal_mode_option({ kind: "and" })), [
        m.decoration_modal_mode_option({ kind: "or" }),
      ]);
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ decoration: expect.objectContaining({ mode: "or" }) });
      });
    });
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/EditDecorationModal.vue -->
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useFieldArray, useForm } from "vee-validate";
import { computed } from "vue";

import {
  decorationSchema,
  defaultCondition,
  defaultStyle,
  type JournalDecoration,
  type JournalDecorationCondition,
  type JournalDecorationStyle,
} from "@/decorations";
import DecorationPreview from "@/decorations/ui/DecorationPreview.vue";
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiButtonDropdown from "@/ui/UiButtonDropdown.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import ConditionItem from "./ConditionItem.vue";
import StyleItem from "./StyleItem.vue";

import type { JournalConfig } from "@/journals/config";

const props = defineProps<{
  journalName: string;
  decoration?: JournalDecoration;
  writeType: JournalConfig["write"]["type"];
}>();
const api = useModal<{ decoration: JournalDecoration }>();

const initial: JournalDecoration = props.decoration ?? { mode: "and", conditions: [], styles: [] };

const { values, errorBag, handleSubmit } = useForm<JournalDecoration>({
  initialValues: structuredClone(initial),
  validationSchema: toTypedSchema(
    v.pipe(
      decorationSchema,
      v.check((d) => d.conditions.length > 0, m.decoration_no_conditions_error()),
      v.check((d) => d.styles.length > 0, m.decoration_no_styles_error()),
    ),
  ),
});

const conditions = useFieldArray<JournalDecorationCondition>("conditions");
const styles = useFieldArray<JournalDecorationStyle>("styles");

const conditionTypeOptions = computed<{ value: string; label: string }[]>(() => {
  const common = ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"] as const;
  const extras: readonly JournalDecorationCondition["type"][] =
    props.writeType === "day" ? ["date", "weekday"] : props.writeType === "custom" ? ["offset"] : [];
  const used = new Set(values.conditions.map((c) => c.type));
  return [...common, ...extras]
    .filter((t) => !used.has(t))
    .map((t) => ({ value: t, label: m.decoration_condition_type_label({ type: t }) }));
});

const styleTypeOptions = computed<{ value: string; label: string }[]>(() => {
  const all = ["background", "color", "shape", "corner", "icon", "border"] as const;
  const used = new Set(values.styles.map((s) => s.type));
  return all.filter((t) => !used.has(t)).map((t) => ({ value: t, label: m.decoration_style_type_label({ type: t }) }));
});

const previewDay = new Date().getDate();

function addCondition(type: string): void {
  conditions.push(defaultCondition(type as JournalDecorationCondition["type"]));
}
function addStyle(type: string): void {
  styles.push(defaultStyle(type as JournalDecorationStyle["type"]));
}

const onSubmit = handleSubmit((decoration) => api.submit({ decoration }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow>
      <template #description>
        <span v-for="error of errorBag['conditions']" :key="error" class="form-error">{{ error }}</span>
        <span v-for="error of errorBag['styles']" :key="error" class="form-error">{{ error }}</span>
      </template>
      <span>{{ m.decoration_modal_mode_prefix() }}</span>
      <UiDropdown v-model="values.mode">
        <option value="and">{{ m.decoration_modal_mode_option({ kind: "and" }) }}</option>
        <option value="or">{{ m.decoration_modal_mode_option({ kind: "or" }) }}</option>
      </UiDropdown>
      <span>{{ m.decoration_modal_mode_suffix() }}</span>
    </UiSettingRow>

    <UiSettingRow>
      <UiButtonDropdown :options="conditionTypeOptions" @select="addCondition">
        {{ m.decoration_modal_add_condition() }}
      </UiButtonDropdown>
    </UiSettingRow>
    <p v-if="values.conditions.length === 0" class="hint">{{ m.decoration_modal_no_conditions() }}</p>
    <UiSettingRow v-for="(condition, i) of values.conditions" :key="i" class="condition-row">
      <template #description>
        <span v-if="i > 0" class="mode-badge"
          >{{ m.describe_mode_or_and_word_inline ? "" : ""
          }}{{
            values.mode === "and"
              ? m.decoration_describe_mode({ kind: "and" })
              : m.decoration_describe_mode({ kind: "or" })
          }}</span
        >
      </template>
      <ConditionItem :name="`conditions.${i}`" :condition="condition" />
      <UiIconButton icon="trash" @click="conditions.remove(i)" />
    </UiSettingRow>

    <hr />

    <div class="preview-grid">
      <div class="preview">
        <DecorationPreview :styles="values.styles">{{ previewDay }}</DecorationPreview>
      </div>
      <div>
        <UiSettingRow>
          <UiButtonDropdown :options="styleTypeOptions" @select="addStyle">
            {{ m.decoration_modal_add_style() }}
          </UiButtonDropdown>
        </UiSettingRow>
        <p v-if="values.styles.length === 0" class="hint">{{ m.decoration_modal_no_styles() }}</p>
        <template v-for="(style, i) of values.styles" :key="i">
          <UiSettingRow heading>
            <template #name>{{ m.decoration_style_header({ type: style.type }) }}</template>
            <UiIconButton icon="trash" @click="styles.remove(i)" />
          </UiSettingRow>
          <StyleItem :name="`styles.${i}`" :style="style" />
        </template>
      </div>
    </div>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.preview-grid {
  display: grid;
  grid-template-columns: 25% 1fr;
  gap: var(--size-4-2);
}
.preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--size-4-2);
}
.hint {
  text-align: center;
  color: var(--text-faint);
}
.condition-row {
  position: relative;
}
.mode-badge {
  display: inline-block;
  margin-bottom: var(--size-2-2);
  text-transform: uppercase;
  font-size: 75%;
  padding: var(--size-2-1) var(--size-2-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-s);
}
.form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

(The vestigial `m.describe_mode_or_and_word_inline` reference in the template was a mistake; remove it so only the real i18n call remains, leaving: `<span v-if="i > 0" class="mode-badge">{{ values.mode === "and" ? m.decoration_describe_mode({ kind: "and" }) : m.decoration_describe_mode({ kind: "or" }) }}</span>`.)

- [ ] **Step 3: Run tests**

```bash
npm test -- src/decorations/settings/ui/EditDecorationModal.test.ts
```

Expected: pass. If the schema's `v.check` doesn't run before submit, switch to `v.pipe(decorationSchema, v.partialCheck([["conditions"]], ...))` or surface the error via `errorBag.root` and adjust the test query.

- [ ] **Step 4: Quality gates + commit (this commit includes Task 23's `modals.ts`)**

```bash
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/EditDecorationModal.vue src/decorations/settings/ui/EditDecorationModal.test.ts src/decorations/settings/ui/modals.ts
git commit -m "feat(decorations): add EditDecorationModal + modal definitions"
```

---

## Task 25: `DeleteDecorationFlow`

**Files:**

- Create: `src/decorations/settings/flows/delete-decoration.flow.ts`
- Create: `src/decorations/settings/flows/delete-decoration.flow.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/flows/delete-decoration.flow.test.ts
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JournalDecoration } from "@/decorations";
import { UnknownDecorationError } from "@/decorations/errors";
import { Container } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, Err, Ok } from "@/infrastructure/result";
import { journalConfigCollection } from "@/journals";
import { UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";

import { DeleteDecorationFlow } from "./delete-decoration.flow";

afterEach(() => vi.restoreAllMocks());

function transparent() {
  return { type: "transparent" as const };
}

function makeJournal(name: string, decorations: JournalDecoration[]) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: { dateField: "d", startDateField: "s", endDateField: "e", addStartDate: false, addEndDate: false },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    decorations,
  };
}

async function setup(decorations: JournalDecoration[] = []) {
  const raw = { version: 3, journals: { daily: makeJournal("daily", decorations) } };
  const { service, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await service.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
  const modal = { open: vi.fn() };
  container.register(ModalService).useValue(modal as unknown as ModalService);
  return {
    container,
    repo: container.resolve(JournalsRepository),
    flow: container.resolve(DeleteDecorationFlow),
    modal,
  };
}

describe("DeleteDecorationFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flow } = await setup();
    const r = await flow.execute({ journalName: "missing", index: 0 });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error.cause).toBeInstanceOf(UnknownJournalError);
  });

  it("returns UnknownDecorationError when index is out of range", async () => {
    const { flow } = await setup([]);
    const r = await flow.execute({ journalName: "daily", index: 0 });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error.cause).toBeInstanceOf(UnknownDecorationError);
  });

  it("returns UserAborted when the user cancels", async () => {
    const dec: JournalDecoration = {
      mode: "and",
      conditions: [{ type: "has-note" }],
      styles: [{ type: "background", color: transparent() }],
    };
    const { flow, modal } = await setup([dec]);
    modal.open.mockReturnValue(AsyncResult.fromPromise(Promise.resolve(new Err(new Error("cancelled")))));
    const r = await flow.execute({ journalName: "daily", index: 0 });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error).toBeInstanceOf(UserAborted);
  });

  it("removes the decoration when the user confirms", async () => {
    const dec: JournalDecoration = {
      mode: "and",
      conditions: [{ type: "has-note" }],
      styles: [{ type: "background", color: transparent() }],
    };
    const { flow, modal, repo } = await setup([dec]);
    modal.open.mockReturnValue(AsyncResult.fromPromise(Promise.resolve(new Ok({ confirmed: true }))));
    const r = await flow.execute({ journalName: "daily", index: 0 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value.deleted).toEqual(dec);
    const after = repo.get("daily").getOr(undefined as never);
    expect(after?.decorations).toEqual([]);
  });
});
```

(Note: the test treats `ModalService.open` as returning `AsyncResult`. Confirm that's the actual return type; if it returns `Promise<Result<...>>`, adjust the mock accordingly. Read `src/infrastructure/host/modals/modal-service.ts` and align.)

Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// src/decorations/settings/flows/delete-decoration.flow.ts
import { toDecorationFlowError, UnknownDecorationError } from "@/decorations/errors";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { Option } from "@/infrastructure/result/option";
import { toFlowError as toJournalFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { deleteDecorationModal } from "../ui/modals";

import type { JournalDecoration } from "@/decorations";

export class DeleteDecorationFlow implements Flow<
  { journalName: string; index: number },
  { deleted: JournalDecoration },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: { journalName: string; index: number }): AsyncResult<{ deleted: JournalDecoration }, FlowError> {
    return attempt.in(this, async function* (this: DeleteDecorationFlow) {
      const config = yield* Option.fromNullable(this.#repository.get(parameters.journalName).getOr(undefined)).okOrElse(
        () => toJournalFlowError(new UnknownJournalError(parameters.journalName)),
      );
      if (parameters.index < 0 || parameters.index >= config.decorations.length) {
        return yield* AsyncResult.err(
          toDecorationFlowError(new UnknownDecorationError(parameters.journalName, parameters.index)),
        );
      }
      const deleted = config.decorations[parameters.index]!;
      yield* this.#modals
        .open(deleteDecorationModal, { journalName: parameters.journalName })
        .mapErr(() => new UserAborted("delete-decoration-modal"));
      const next = config.decorations.filter((_, i) => i !== parameters.index);
      this.#repository.update(parameters.journalName, { decorations: next });
      return { deleted };
    });
  }
}
```

If `Option.fromNullable` is at a different path (`@/infrastructure/result` may re-export it), correct the import to match the project's actual location — search for `Option.fromNullable` usage in `src/journals/settings/flows/*.flow.ts` if needed.

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/flows/delete-decoration.flow.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/flows/delete-decoration.flow.ts src/decorations/settings/flows/delete-decoration.flow.test.ts
git commit -m "feat(decorations): add DeleteDecorationFlow"
```

---

## Task 26: `EditDecorationFlow`

**Files:**

- Create: `src/decorations/settings/flows/edit-decoration.flow.ts`
- Create: `src/decorations/settings/flows/edit-decoration.flow.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/flows/edit-decoration.flow.test.ts
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalDecoration } from "@/decorations";
import { UnknownDecorationError } from "@/decorations/errors";
import { Container } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, Err, Ok } from "@/infrastructure/result";
import { journalConfigCollection } from "@/journals";
import { UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";

import { EditDecorationFlow } from "./edit-decoration.flow";

afterEach(() => vi.restoreAllMocks());

function transparent() {
  return { type: "transparent" as const };
}

function makeJournal(name: string, decorations: JournalDecoration[]) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: { dateField: "d", startDateField: "s", endDateField: "e", addStartDate: false, addEndDate: false },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    decorations,
  };
}

async function setup(decorations: JournalDecoration[] = []) {
  const raw = { version: 3, journals: { daily: makeJournal("daily", decorations) } };
  const { service, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await service.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(EditDecorationFlow).useClass(EditDecorationFlow);
  const modal = { open: vi.fn() };
  container.register(ModalService).useValue(modal as unknown as ModalService);
  return { repo: container.resolve(JournalsRepository), flow: container.resolve(EditDecorationFlow), modal };
}

const sampleDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent() }],
};

describe("EditDecorationFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flow } = await setup();
    const r = await flow.execute({ journalName: "missing" });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error.cause).toBeInstanceOf(UnknownJournalError);
  });

  it("returns UnknownDecorationError for an out-of-range edit index", async () => {
    const { flow } = await setup([]);
    const r = await flow.execute({ journalName: "daily", index: 5 });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error.cause).toBeInstanceOf(UnknownDecorationError);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flow, modal } = await setup();
    modal.open.mockReturnValue(AsyncResult.fromPromise(Promise.resolve(new Err(new Error("cancel")))));
    const r = await flow.execute({ journalName: "daily" });
    expect(r.kind).toBe("err");
    if (r.kind === "err") expect(r.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no index is provided", async () => {
    const { flow, modal, repo } = await setup([sampleDecoration]);
    modal.open.mockReturnValue(AsyncResult.fromPromise(Promise.resolve(new Ok({ decoration: sampleDecoration }))));
    const r = await flow.execute({ journalName: "daily" });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value.index).toBe(1);
    expect(repo.get("daily").getOr(undefined as never)?.decorations.length).toBe(2);
  });

  it("replaces the decoration at index when an index is provided", async () => {
    const updated: JournalDecoration = { ...sampleDecoration, mode: "or" };
    const { flow, modal, repo } = await setup([sampleDecoration]);
    modal.open.mockReturnValue(AsyncResult.fromPromise(Promise.resolve(new Ok({ decoration: updated }))));
    const r = await flow.execute({ journalName: "daily", index: 0 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value.index).toBe(0);
    expect(repo.get("daily").getOr(undefined as never)?.decorations[0]).toEqual(updated);
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// src/decorations/settings/flows/edit-decoration.flow.ts
import { toDecorationFlowError, UnknownDecorationError } from "@/decorations/errors";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { Option } from "@/infrastructure/result/option";
import { toFlowError as toJournalFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsRepository } from "@/journals/repository";

import { editDecorationModal } from "../ui/modals";

import type { JournalDecoration } from "@/decorations";

export class EditDecorationFlow implements Flow<
  { journalName: string; index?: number },
  { decoration: JournalDecoration; index: number },
  FlowError
> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: {
    journalName: string;
    index?: number;
  }): AsyncResult<{ decoration: JournalDecoration; index: number }, FlowError> {
    return attempt.in(this, async function* (this: EditDecorationFlow) {
      const config = yield* Option.fromNullable(this.#repository.get(parameters.journalName).getOr(undefined)).okOrElse(
        () => toJournalFlowError(new UnknownJournalError(parameters.journalName)),
      );
      const isEdit = parameters.index !== undefined;
      if (isEdit && (parameters.index! < 0 || parameters.index! >= config.decorations.length)) {
        return yield* AsyncResult.err(
          toDecorationFlowError(new UnknownDecorationError(parameters.journalName, parameters.index!)),
        );
      }
      const existing = isEdit ? config.decorations[parameters.index!] : undefined;
      const submitted = yield* this.#modals
        .open(editDecorationModal, {
          journalName: parameters.journalName,
          decoration: existing,
          writeType: config.write.type,
        })
        .mapErr(() => new UserAborted("edit-decoration-modal"));
      const next = isEdit
        ? config.decorations.map((d, i) => (i === parameters.index ? submitted.decoration : d))
        : [...config.decorations, submitted.decoration];
      this.#repository.update(parameters.journalName, { decorations: next });
      const newIndex = isEdit ? parameters.index! : config.decorations.length;
      return { decoration: submitted.decoration, index: newIndex };
    });
  }
}
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/flows/edit-decoration.flow.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/flows/edit-decoration.flow.ts src/decorations/settings/flows/edit-decoration.flow.test.ts
git commit -m "feat(decorations): add EditDecorationFlow"
```

---

## Task 27: `DecorationsSection` SFC

**Files:**

- Create: `src/decorations/settings/ui/DecorationsSection.vue`
- Create: `src/decorations/settings/ui/DecorationsSection.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/decorations/settings/ui/DecorationsSection.test.ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalDecoration } from "@/decorations";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { m } from "@/i18n";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";

import { EditDecorationFlow } from "../flows/edit-decoration.flow";
import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";

import DecorationsSection from "./DecorationsSection.vue";

afterEach(() => cleanup());

function transparent() {
  return { type: "transparent" as const };
}
function makeJournal(name: string, decorations: JournalDecoration[]) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: { dateField: "d", startDateField: "s", endDateField: "e", addStartDate: false, addEndDate: false },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    decorations,
  };
}

async function mount(decorations: JournalDecoration[]) {
  const raw = { version: 3, journals: { daily: makeJournal("daily", decorations) } };
  const { service, container } = createSettingsService({ collections: [journalConfigCollection], raw });
  await service.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const flowsMock = { invoke: vi.fn() };
  container.register(Flows).useValue(flowsMock as unknown as Flows);
  render(DecorationsSection, {
    props: { journalName: "daily" },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return { flowsMock };
}

const sampleDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent() }],
};

describe("DecorationsSection", () => {
  it("renders the empty state when there are no decorations", async () => {
    await mount([]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    expect(screen.getByText(m.decoration_section_empty())).toBeTruthy();
  });

  it("renders a row description for each decoration", async () => {
    await mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("invokes EditDecorationFlow with no index when Add is clicked", async () => {
    const { flowsMock } = await mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    await userEvent.click(screen.getByText(m.decoration_add_button()));
    expect(flowsMock.invoke).toHaveBeenCalledWith(EditDecorationFlow, { journalName: "daily" });
  });

  it("invokes EditDecorationFlow with the index when Edit is clicked", async () => {
    const { flowsMock } = await mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    await userEvent.click(screen.getByLabelText(m.decoration_edit_tooltip()));
    expect(flowsMock.invoke).toHaveBeenCalledWith(EditDecorationFlow, { journalName: "daily", index: 0 });
  });

  it("invokes DeleteDecorationFlow when Delete is clicked", async () => {
    const { flowsMock } = await mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    await userEvent.click(screen.getByLabelText(m.decoration_delete_tooltip()));
    expect(flowsMock.invoke).toHaveBeenCalledWith(DeleteDecorationFlow, { journalName: "daily", index: 0 });
  });
});
```

Expected: FAIL.

- [ ] **Step 2: Implement**

```vue
<!-- src/decorations/settings/ui/DecorationsSection.vue -->
<script setup lang="ts">
import { computed, ref } from "vue";

import { DecorationPreview, type JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";

import { describeCondition } from "./describe-condition";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const decorations = computed<readonly JournalDecoration[]>(() => config.value?.decorations ?? []);

const expanded = ref(false);
const previewDay = new Date().getDate();

function add(): void {
  void flows.invoke(EditDecorationFlow, { journalName });
}
function edit(index: number): void {
  void flows.invoke(EditDecorationFlow, { journalName, index });
}
function remove(index: number): void {
  void flows.invoke(DeleteDecorationFlow, { journalName, index });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="paintbrush">
        {{ m.decoration_section_title() }}
        <span class="flair">{{ decorations.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiButton @click="add">{{ m.decoration_add_button() }}</UiButton>
    </template>

    <UiSettingRow no-controls>
      <template #description>{{ m.decoration_section_description() }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="decorations.length === 0" no-controls>
      <template #description>{{ m.decoration_section_empty() }}</template>
    </UiSettingRow>

    <UiSettingRow v-for="(decoration, index) of decorations" :key="index">
      <template #description>
        <div class="row-preview">
          <DecorationPreview :styles="decoration.styles">{{ previewDay }}</DecorationPreview>
        </div>
        <div class="row-clauses">
          <span>{{ m.decoration_describe_when() }}</span>
          <template v-for="(condition, i) of decoration.conditions" :key="i">
            <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: decoration.mode }) }}</span>
            <span>{{ describeCondition(condition) }}</span>
          </template>
        </div>
      </template>
      <UiIconButton icon="pencil" :tooltip="m.decoration_edit_tooltip()" @click="edit(index)" />
      <UiIconButton icon="trash" :tooltip="m.decoration_delete_tooltip()" @click="remove(index)" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.row-preview {
  display: inline-block;
  min-width: 2em;
  min-height: 2em;
  margin-right: var(--size-4-2);
}
.row-clauses {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--size-2-2);
  align-items: baseline;
}
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
```

- [ ] **Step 3: Run tests + gates + commit**

```bash
npm test -- src/decorations/settings/ui/DecorationsSection.test.ts
npm test
npm run check:types
npm run check:lint
git add src/decorations/settings/ui/DecorationsSection.vue src/decorations/settings/ui/DecorationsSection.test.ts
git commit -m "feat(decorations): add DecorationsSection for journal edit page"
```

---

## Task 28: Module wiring

**Files:**

- Create: `src/decorations/settings/module.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement the module**

```ts
// src/decorations/settings/module.ts
import { defineJournalEditSection, JournalEditSectionToken } from "@/journals";
import type { Module } from "@/infrastructure/di";

import { DeleteDecorationFlow } from "./flows/delete-decoration.flow";
import { EditDecorationFlow } from "./flows/edit-decoration.flow";
import DecorationsSection from "./ui/DecorationsSection.vue";

export const decorationsSettingsModule: Module = {
  register(c) {
    c.register(EditDecorationFlow).useClass(EditDecorationFlow);
    c.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "decorations",
        order: 50,
        component: DecorationsSection,
      }),
    );
  },
};
```

- [ ] **Step 2: Wire into main.ts**

Modify `src/main.ts`. Add the import alongside the other module imports and the `addModule` call after `journalsSettingsModule`:

```ts
import { decorationsSettingsModule } from "@/decorations/settings/module";
// ...
container.addModule(journalsSettingsModule);
container.addModule(decorationsSettingsModule);
container.addModule(decorationsModule);
```

(`decorationsModule` continues to be registered as before — it provides the engine and is unrelated to settings.)

- [ ] **Step 3: Quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: all pass. No new tests at this layer per `feedback_no_wiring_tests`.

- [ ] **Step 4: Commit**

```bash
git add src/decorations/settings/module.ts src/main.ts
git commit -m "feat(decorations): wire decorationsSettingsModule into main"
```

---

## Task 29: Final quality gates and smoke check

- [ ] **Step 1: Full repo gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: all green.

- [ ] **Step 2: Manual smoke verification**

Per `feedback_quality_gates`, this repo has no e2e suite, so manually verify the feature end-to-end inside Obsidian (or whatever the project's dev-vault setup is — check `test-vault/` and `package.json` scripts; typically `npm run dev` plus reloading the plugin in Obsidian).

Manual checklist:

- Open journal settings → edit a journal → expand "Calendar decorations".
- Empty state appears.
- Click "Add decoration" → modal opens.
- Add a `has-note` condition + `background` style with a custom color → save.
- The row appears with the preview and the localized "when a note exists" clause.
- Edit the same decoration → toggle to `or` mode + add a second condition → save.
- The row description shows both clauses joined by "OR".
- Delete the decoration → confirmation modal → confirm → row disappears.

- [ ] **Step 3: Optional cleanup commit**

If smoke testing surfaces small adjustments (label text, spacing), make them in their respective files. Otherwise, no further commit is required.

---

## Self-Review Notes

- **Spec coverage:** Every named component, flow, message, error, and test from the spec maps to a task. UiColorSettingsPicker → Task 3. describe-condition → Task 4. DecorationPreview (added during planning) → Task 5. Each condition leaf → Tasks 6–12. ConditionItem dispatcher → Task 13. Each style leaf → Tasks 14–20. StyleItem dispatcher → Task 21. DeleteDecorationModal → Task 22. modals.ts → Task 23. EditDecorationModal → Task 24. DeleteDecorationFlow → Task 25. EditDecorationFlow → Task 26. DecorationsSection → Task 27. Module + main.ts → Task 28. Quality gates → Task 29.

- **Placeholders:** None. Every step shows the actual code, command, or change.

- **Type consistency:** Form-field paths are stringly-typed by vee-validate; the dispatchers pass `name` through; the leaves use the same `name` prop everywhere. Flow inputs/outputs match between the modal's `defineModal` registrations and the flow `.execute` return types. The promoted `UiColorSettingsPicker` v-model type (`ColorSettings`) matches what leaves bind via `useField<ColorSettings>(...)`.

- **Risks flagged for the implementer:**
  - vee-validate `useFieldArray` requires the array path to be stable. If the form state shape changes mid-task, tests will start failing in subtle ways — the `useForm` initial values shape must match `JournalDecoration` exactly.
  - The `ModalService.open` API: confirm the return type (`AsyncResult` vs `Promise<Result>`) before writing the flow tests' mocks; adjust the harness wrapping accordingly.
  - `Option.fromNullable` import path may live in `@/infrastructure/result` or `@/infrastructure/result/option`; check an existing flow file before importing.
  - `m.decoration_condition_date_describe` uses `year: "null"` as the sentinel. If the paraglide `select` ICU-style match doesn't accept arbitrary case names, switch the message to use a different sentinel or branch in `describeCondition`.
  - The `EditDecorationModal` form-level errors (`decoration_no_conditions_error`, `decoration_no_styles_error`) need to surface. If vee-validate doesn't expose top-level `v.check` errors via `errorBag["conditions"]`, surface them via `errorBag.root` or by inspecting `errors.value` directly and add a banner row.
