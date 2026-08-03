# Decoration Offset Condition UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the custom-interval `offset` decoration condition usable — kill the dead `0` default, split the sign into a visible direction control, and replace distance-language copy with ordinal-language copy.

**Architecture:** The stored value keeps its meaning (a signed 1-based ordinal: `1` = first day, `-1` = last day) and the matching engine is untouched. Three layers change: the valibot schema coerces `0 → 1` so no reader ever sees the dead value; a new single-select `UiSegmentedControl` primitive lets the editor expose direction and day as separate controls; and both offset messages become two-selector match blocks so the two extremes read as "the first day" / "the last day".

**Tech Stack:** Vue 3.5 (`<script setup>`, `useId`), valibot, vee-validate, ts-pattern, paraglide/inlang i18n, vitest + @testing-library/vue + @testing-library/user-event.

**Spec:** `docs/superpowers/specs/2026-08-03-decoration-offset-condition-ux-design.md`

## Global Constraints

- Commands are **npm**, not pnpm: `npm test`, `npm run check:types`, `npm run check:lint`, `npm run compile:i18n`, `npm run translate:i18n`.
- **Never** stage `src/i18n/paraglide/` — it is generated and git-ignored. Edit `messages/*.json` and run `npm run compile:i18n`.
- **Never** add `eslint-disable` comments. Fix the code instead.
- **Never** add a `Co-Authored-By` trailer to a commit message.
- Commit to the **current branch** (`v3-ai`). Do not create a branch.
- Tests are colocated `*.test.ts` next to the implementation.
- One behaviour per test; test names are subject+verb behaviour descriptions with no "and" or comma lists.
- Vue component tests use `@testing-library/vue` + `user-event`, queried by role. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- There is **no `jest-dom`** in this project. Assert input contents via `screen.getByRole<HTMLInputElement>("spinbutton").value` (a string), not `toHaveValue`.
- No WHAT-comments and no spec-reference comments in source. WHY-comments only.
- New `en.json` copy follows `docs/2026-07-13-ux-text-audit.md` §A: sentence case, en-US.
- Discriminated-union dispatch uses `match().with().exhaustive()` from ts-pattern, not `switch`.

---

### Task 1: Coerce the dead zero offset

The bug's root: `offsets()` in `journals/cycle.ts:230` returns `[diff(start) + 1, diff(end) - 1]`, so the positive channel starts at `1` and the negative ends at `-1`. `0` is unreachable, yet `defaultCondition("offset")` produces it.

**Files:**

- Create: `src/decorations/config.test.ts`
- Modify: `src/decorations/config.ts:177-180`
- Modify: `src/decorations/defaults.ts:71`
- Modify: `src/decorations/defaults.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `decorationConditionSchema` now guarantees a parsed offset condition never carries `offset: 0`. Later tasks may assume `Math.abs(offset) >= 1` for any value that came through the schema.

- [ ] **Step 1: Write the failing schema test**

Create `src/decorations/config.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { decorationConditionSchema } from "./config";

// Interval offsets are 1-based in both directions (1 = first day, -1 = last day), so a
// stored 0 could never match anything. v2 shipped it as the default, so it exists in the wild.
describe("offset condition schema", () => {
  it("reads a stored zero offset as the interval's first day", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: 0 });
    expect(parsed).toEqual({ type: "offset", offset: 1 });
  });

  it("leaves a non-zero offset untouched", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: -3 });
    expect(parsed).toEqual({ type: "offset", offset: -3 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/decorations/config.test.ts`
Expected: FAIL — the first test reports `{ type: "offset", offset: 0 }` instead of `offset: 1`.

- [ ] **Step 3: Add the coercion**

In `src/decorations/config.ts`, replace the `offsetCondition` declaration:

```ts
const offsetCondition = v.object({
  type: v.literal("offset"),
  offset: v.pipe(
    v.number(),
    v.integer(),
    // 0 is unreachable: offsets are 1-based from both ends. v2's default stored it anyway.
    v.transform((n) => (n === 0 ? 1 : n)),
  ),
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/decorations/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing default test**

Append to the end of `src/decorations/defaults.test.ts`, after the existing `describe("defaultStyle", ...)` block. Add `defaultCondition` to the existing import from `./defaults`:

```ts
describe("defaultCondition", () => {
  it("points a new offset condition at the interval's first day", () => {
    expect(defaultCondition("offset")).toEqual({ type: "offset", offset: 1 });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/decorations/defaults.test.ts`
Expected: FAIL — received `{ type: "offset", offset: 0 }`.

- [ ] **Step 7: Fix the default**

In `src/decorations/defaults.ts:71`, change the offset branch of `defaultCondition`:

```ts
    .with("offset", () => ({ type: "offset", offset: 1 }))
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/decorations/config.ts src/decorations/config.test.ts src/decorations/defaults.ts src/decorations/defaults.test.ts
git commit -m "fix(decorations): make a new interval-offset condition match the first day"
```

---

### Task 2: Single-select segmented control primitive

`UiToggleGroup` is multi-select only (`defineModel<T[]>`). The weekday toggle-group design (`docs/superpowers/specs/2026-07-06-weekday-toggle-group-design.md`, "Out of scope") already ruled that single-select segmented controls are a distinct radio-like shape that must not be fused into it. This builds that separate primitive.

**Files:**

- Create: `src/ui/UiSegmentedControl.vue`
- Create: `src/ui/UiSegmentedControl.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `UiSegmentedControl`, a generic single-select control.
  - Model: `defineModel<T>({ required: true })` — the selected value.
  - Props: `{ options: { value: T; label: string }[]; disabled?: boolean }`.
  - A fallthrough `aria-label` lands on the `role="radiogroup"` root and names the group.
  - Each option renders as a `role="radio"` whose accessible name is `option.label`.
  - Task 4 consumes it as `<UiSegmentedControl v-model="side" :options="directionOptions" :aria-label="..." />`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/UiSegmentedControl.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiSegmentedControl from "./UiSegmentedControl.vue";

afterEach(() => cleanup());

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
];

describe("UiSegmentedControl", () => {
  it("renders a radio for each option", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options } });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("checks the option matching the model", () => {
    render(UiSegmentedControl, { props: { modelValue: "beta", options } });
    expect(screen.getByRole("radio", { name: "Beta", checked: true })).toBeTruthy();
  });

  it("emits the value of the clicked option", async () => {
    const { emitted } = render(UiSegmentedControl, { props: { modelValue: "beta", options } });
    await userEvent.click(screen.getByRole("radio", { name: "Alpha" }));
    expect(emitted("update:modelValue")).toEqual([["alpha"]]);
  });

  it("names the group from a fallthrough aria-label", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options, "aria-label": "Count from" } });
    expect(screen.getByRole("radiogroup", { name: "Count from" })).toBeTruthy();
  });

  it("disables every option when disabled", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options, disabled: true } });
    for (const radio of screen.getAllByRole<HTMLInputElement>("radio")) {
      expect(radio.disabled).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/UiSegmentedControl.test.ts`
Expected: FAIL — cannot resolve `./UiSegmentedControl.vue`.

- [ ] **Step 3: Write the component**

Create `src/ui/UiSegmentedControl.vue`. Native radio inputs give arrow-key navigation, roving focus, and checked state from the platform rather than from JS — that is why this is not a row of `role="radio"` buttons:

```vue
<script setup lang="ts" generic="T">
import { useId } from "vue";

const model = defineModel<T>({ required: true });

defineProps<{
  options: { value: T; label: string }[];
  disabled?: boolean;
}>();

// Two instances on one page must not join the same native radio group.
const groupName = useId();
</script>

<template>
  <div class="ui-segmented-control" role="radiogroup">
    <label v-for="option in options" :key="String(option.value)" class="ui-segmented-control__option">
      <input
        v-model="model"
        type="radio"
        class="ui-segmented-control__input"
        :name="groupName"
        :value="option.value"
        :disabled="disabled"
      />
      <span class="ui-segmented-control__label">{{ option.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.ui-segmented-control {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.ui-segmented-control__option {
  flex: 1 1 auto;
  display: flex;
}
.ui-segmented-control__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.ui-segmented-control__label {
  flex: 1 1 auto;
  padding: var(--size-4-1) var(--size-4-2);
  border-left: 1px solid var(--background-modifier-border);
  background-color: var(--background-primary);
  color: var(--text-muted);
  text-align: center;
  cursor: pointer;
}
.ui-segmented-control__option:first-child .ui-segmented-control__label {
  border-left: none;
}
.ui-segmented-control__input:checked + .ui-segmented-control__label {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.ui-segmented-control__input:disabled + .ui-segmented-control__label {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-segmented-control__input:focus-visible + .ui-segmented-control__label {
  box-shadow: inset 0 0 0 2px var(--background-modifier-border-focus);
}
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/UiSegmentedControl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Check types and lint**

Run: `npm run check:types && npm run check:lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiSegmentedControl.vue src/ui/UiSegmentedControl.test.ts
git commit -m "feat(ui): add a single-select segmented control"
```

---

### Task 3: Ordinal wording for the condition summary

`describeCondition` currently renders `"offset from start is {offset}"` for every value, so `-3` reads as "offset from start is -3". This task changes only the summary message and its call site; the editor hint is Task 4, because the two messages have separate call sites and each task must leave `check:types` green.

**Files:**

- Modify: `messages/en.json` **and all ten locale files** (`de`, `es`, `fr`, `it`, `ja`, `ko`, `pt`, `ru`, `uk`, `zh`) — key `decoration_condition_offset_describe`
- Modify: `src/decorations/settings/ui/describe-condition.ts:49`
- Modify: `src/decorations/settings/ui/describe-condition.test.ts:94-99`

**Why every locale changes in this task:** paraglide derives a message's generated
input type from the union of **all** locale files, not from `en.json` alone. Leaving
`"…{offset}"` in the other ten would keep `offset` in the generated signature and break
`check:types` at the new `{ side, day }` call site. The locale edits are not deferrable.

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `m.decoration_condition_offset_describe({ side: "start" | "end", day: number })`. The old single-argument `{ offset }` signature no longer exists.

- [ ] **Step 1: Rework the message**

In `messages/en.json`, replace the `decoration_condition_offset_describe` line with a two-selector match block. The `"unit=day,count=1"` composite-key form is already used by `journal_add_modal_every_unit`, and exact numeric keys are already used by `journal_delete_connected_count`, so this needs nothing new from the pipeline. Keep the key in its existing alphabetical position:

```json
  "decoration_condition_offset_describe": [
    {
      "declarations": ["input side", "input day"],
      "selectors": ["side", "day"],
      "match": {
        "side=start,day=1": "is the first day of the interval",
        "side=start,day=*": "is day {day} of the interval",
        "side=end,day=1": "is the last day of the interval",
        "side=end,day=*": "is day {day} counted back from the end of the interval"
      }
    }
  ],
```

The lowercase fragment register matches its neighbours ("a note exists", "tag contains x") — these clauses are joined into a list, not shown as sentences.

- [ ] **Step 1b: Apply the same block to all ten locale files**

Same key, same position, same four match keys — only the strings differ. Locale files are
tab-indented; match the file you are editing. Use these translations verbatim:

| locale | `side=start,day=1`                  | `side=start,day=*`                | `side=end,day=1`                    | `side=end,day=*`                                            |
| ------ | ----------------------------------- | --------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| de     | ist der erste Tag des Intervalls    | ist Tag {day} des Intervalls      | ist der letzte Tag des Intervalls   | ist Tag {day} vom Ende des Intervalls zurückgerechnet       |
| es     | es el primer día del intervalo      | es el día {day} del intervalo     | es el último día del intervalo      | es el día {day} contando desde el final del intervalo       |
| fr     | est le premier jour de l'intervalle | est le jour {day} de l'intervalle | est le dernier jour de l'intervalle | est le jour {day} en comptant depuis la fin de l'intervalle |
| it     | è il primo giorno dell'intervallo   | è il giorno {day} dell'intervallo | è l'ultimo giorno dell'intervallo   | è il giorno {day} contando dalla fine dell'intervallo       |
| ja     | 間隔の最初の日である                | 間隔の{day}日目である             | 間隔の最後の日である                | 間隔の終わりから数えて{day}日目である                       |
| ko     | 간격의 첫째 날임                    | 간격의 {day}번째 날임             | 간격의 마지막 날임                  | 간격의 끝에서부터 {day}번째 날임                            |
| pt     | é o primeiro dia do intervalo       | é o dia {day} do intervalo        | é o último dia do intervalo         | é o dia {day} contando a partir do fim do intervalo         |
| ru     | это первый день интервала           | это {day}-й день интервала        | это последний день интервала        | это {day}-й день с конца интервала                          |
| uk     | це перший день інтервалу            | це {day}-й день інтервалу         | це останній день інтервалу          | це {day}-й день з кінця інтервалу                           |
| zh     | 是间隔的第一天                      | 是间隔的第{day}天                 | 是间隔的最后一天                    | 是从间隔末尾倒数第{day}天                                   |

The interval noun matches each locale's existing `common_custom_intervals` rendering. None of
these strings contain a glossary-protected domain noun (journal, note, shelf, bold), so
`npm run check:i18n` has nothing to object to.

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: succeeds. Do not stage `src/i18n/paraglide/`.

- [ ] **Step 3: Write the failing tests**

In `src/decorations/settings/ui/describe-condition.test.ts`, replace the whole `describe("offset", ...)` block (around lines 94-99) with:

```ts
describe("offset", () => {
  it("names offset 1 as the first day of the interval", () => {
    const out = describeCondition({ type: "offset", offset: 1 }, calendar);
    expect(out).toBe(m.decoration_condition_offset_describe({ side: "start", day: 1 }));
  });

  it("names offset -1 as the last day of the interval", () => {
    const out = describeCondition({ type: "offset", offset: -1 }, calendar);
    expect(out).toBe(m.decoration_condition_offset_describe({ side: "end", day: 1 }));
  });

  it("counts a positive offset forward from the interval start", () => {
    const out = describeCondition({ type: "offset", offset: 5 }, calendar);
    expect(out).toBe(m.decoration_condition_offset_describe({ side: "start", day: 5 }));
  });

  it("counts a negative offset back from the interval end", () => {
    const out = describeCondition({ type: "offset", offset: -3 }, calendar);
    expect(out).toBe(m.decoration_condition_offset_describe({ side: "end", day: 3 }));
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/describe-condition.test.ts`
Expected: FAIL on all four — `describeCondition` still calls the message with the old `{ offset }` argument, so no `side`/`day` variant can be selected.

- [ ] **Step 5: Update the call site**

In `src/decorations/settings/ui/describe-condition.ts`, replace line 49:

```ts
    .with({ type: "offset" }, (c) =>
      m.decoration_condition_offset_describe({
        side: c.offset < 0 ? "end" : "start",
        day: Math.abs(c.offset),
      }),
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/describe-condition.test.ts && npm run check:types && npm run check:i18n`
Expected: PASS, clean types, glossary clean.

`check:types` is the real gate here: it passes only if every locale file carries the new
`side`/`day` variants. If it still demands an `offset` argument, a locale was missed.

- [ ] **Step 7: Commit**

```bash
git add messages/ src/decorations/settings/ui/describe-condition.ts src/decorations/settings/ui/describe-condition.test.ts
git commit -m "fix(decorations): describe an interval offset by the day it targets"
```

---

### Task 4: Split the offset editor into direction and day

**Files:**

- Modify: `messages/en.json` **and all ten locale files** (rework `decoration_condition_offset_hint`; remove `decoration_condition_offset_label`; add `decoration_condition_offset_day_label`, `decoration_condition_offset_direction_label`, `decoration_condition_offset_direction_option`)
- Modify: `src/decorations/settings/ui/ConditionOffset.vue` (full rewrite)
- Modify: `src/decorations/settings/ui/ConditionOffset.test.ts` (full rewrite)

**Interfaces:**

- Consumes: `UiSegmentedControl` from Task 2; the `0 → 1` schema coercion from Task 1 (the editor never has to render a `0`).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Rework and add the messages**

In `messages/en.json`:

**Delete** the `decoration_condition_offset_label` line entirely — it is superseded by the two labels below.

**Replace** `decoration_condition_offset_hint` with:

```json
  "decoration_condition_offset_hint": [
    {
      "declarations": ["input side", "input day"],
      "selectors": ["side", "day"],
      "match": {
        "side=start,day=1": "Matches the first day of the interval.",
        "side=start,day=*": "Matches day {day} of the interval.",
        "side=end,day=1": "Matches the last day of the interval.",
        "side=end,day=*": "Matches day {day} counted back from the end of the interval."
      }
    }
  ],
```

**Add** three keys, each in its alphabetical position among the `decoration_condition_offset_*` group (order: `_day_label`, `_describe`, `_direction_label`, `_direction_option`, `_hint`):

```json
  "decoration_condition_offset_day_label": "Day",
  "decoration_condition_offset_direction_label": "Count from",
  "decoration_condition_offset_direction_option": [
    {
      "declarations": ["input side"],
      "selectors": ["side"],
      "match": {
        "side=start": "From start",
        "side=end": "From end"
      }
    }
  ],
```

- [ ] **Step 1b: Apply the same four edits to all ten locale files**

Same as Task 3: paraglide unions the generated input type across every locale, so a stale
`{days}`/`{side}` hint block in any one of them breaks `check:types` at the new call site.
Delete `decoration_condition_offset_label` from each file too. Locale files are tab-indented.

`decoration_condition_offset_hint` — sentence register, ends with a period:

| locale | `side=start,day=1`                           | `side=start,day=*`                           | `side=end,day=1`                               | `side=end,day=*`                                                    |
| ------ | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| de     | Entspricht dem ersten Tag des Intervalls.    | Entspricht Tag {day} des Intervalls.         | Entspricht dem letzten Tag des Intervalls.     | Entspricht Tag {day} vom Ende des Intervalls zurückgerechnet.       |
| es     | Coincide con el primer día del intervalo.    | Coincide con el día {day} del intervalo.     | Coincide con el último día del intervalo.      | Coincide con el día {day} contando desde el final del intervalo.    |
| fr     | Correspond au premier jour de l'intervalle.  | Correspond au jour {day} de l'intervalle.    | Correspond au dernier jour de l'intervalle.    | Correspond au jour {day} en comptant depuis la fin de l'intervalle. |
| it     | Corrisponde al primo giorno dell'intervallo. | Corrisponde al giorno {day} dell'intervallo. | Corrisponde all'ultimo giorno dell'intervallo. | Corrisponde al giorno {day} contando dalla fine dell'intervallo.    |
| ja     | 間隔の最初の日に一致します。                 | 間隔の{day}日目に一致します。                | 間隔の最後の日に一致します。                   | 間隔の終わりから数えて{day}日目に一致します。                       |
| ko     | 간격의 첫째 날과 일치합니다.                 | 간격의 {day}번째 날과 일치합니다.            | 간격의 마지막 날과 일치합니다.                 | 간격의 끝에서부터 {day}번째 날과 일치합니다.                        |
| pt     | Corresponde ao primeiro dia do intervalo.    | Corresponde ao dia {day} do intervalo.       | Corresponde ao último dia do intervalo.        | Corresponde ao dia {day} contando a partir do fim do intervalo.     |
| ru     | Совпадает с первым днём интервала.           | Совпадает с {day}-м днём интервала.          | Совпадает с последним днём интервала.          | Совпадает с {day}-м днём с конца интервала.                         |
| uk     | Збігається з першим днем інтервалу.          | Збігається з {day}-м днем інтервалу.         | Збігається з останнім днем інтервалу.          | Збігається з {day}-м днем з кінця інтервалу.                        |
| zh     | 匹配间隔的第一天。                           | 匹配间隔的第{day}天。                        | 匹配间隔的最后一天。                           | 匹配从间隔末尾倒数第{day}天。                                       |

The three label keys:

| locale | `_day_label` | `_direction_label`  | `_direction_option` `side=start` | `_direction_option` `side=end` |
| ------ | ------------ | ------------------- | -------------------------------- | ------------------------------ |
| de     | Tag          | Zählen ab           | Vom Anfang                       | Vom Ende                       |
| es     | Día          | Contar desde        | Desde el inicio                  | Desde el final                 |
| fr     | Jour         | Compter à partir de | Depuis le début                  | Depuis la fin                  |
| it     | Giorno       | Conta da            | Dall'inizio                      | Dalla fine                     |
| ja     | 日           | 起点                | 先頭から                         | 末尾から                       |
| ko     | 일           | 기준                | 시작부터                         | 끝부터                         |
| pt     | Dia          | Contar a partir de  | Do início                        | Do fim                         |
| ru     | День         | Отсчёт от           | От начала                        | От конца                       |
| uk     | День         | Відлік від          | Від початку                      | Від кінця                      |
| zh     | 天           | 计数起点            | 从开头                           | 从末尾                         |

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: succeeds. Do not stage `src/i18n/paraglide/`.

- [ ] **Step 3: Write the failing tests**

Replace the whole body of `src/decorations/settings/ui/ConditionOffset.test.ts` with:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";

import ConditionOffset from "./ConditionOffset.vue";

const renderConditionOffsetHost = () => h(ConditionOffset, { name: "c" });

afterEach(() => cleanup());

type Offset = Extract<JournalDecorationCondition, { type: "offset" }>;

function mount(initial: Offset) {
  const exposed: { values: { c: Offset } } = { values: { c: initial } };
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderConditionOffsetHost;
    },
  });
  render(Host);
  return exposed;
}

const fromStart = m.decoration_condition_offset_direction_option({ side: "start" });
const fromEnd = m.decoration_condition_offset_direction_option({ side: "end" });

describe("ConditionOffset", () => {
  it("shows a negative offset as counting from the end", () => {
    mount({ type: "offset", offset: -2 });
    expect(screen.getByRole("radio", { name: fromEnd, checked: true })).toBeTruthy();
  });

  it("shows a negative offset as a positive day number", () => {
    mount({ type: "offset", offset: -2 });
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("2");
  });

  it("stores a negative offset when the user counts from the end", async () => {
    const host = mount({ type: "offset", offset: 3 });
    await userEvent.click(screen.getByRole("radio", { name: fromEnd }));
    expect(host.values.c.offset).toBe(-3);
  });

  it("stores a positive offset when the user counts from the start", async () => {
    const host = mount({ type: "offset", offset: -3 });
    await userEvent.click(screen.getByRole("radio", { name: fromStart }));
    expect(host.values.c.offset).toBe(3);
  });

  it("stores the day number the user types", async () => {
    const host = mount({ type: "offset", offset: 1 });
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    expect(host.values.c.offset).toBe(5);
  });

  it("keeps the stored offset while the day input is empty", async () => {
    const host = mount({ type: "offset", offset: 4 });
    await userEvent.clear(screen.getByRole("spinbutton"));
    expect(host.values.c.offset).toBe(4);
  });

  it("explains day 1 from the start as the interval's first day", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByText(m.decoration_condition_offset_hint({ side: "start", day: 1 }))).toBeTruthy();
  });

  it("explains day 1 from the end as the interval's last day", () => {
    mount({ type: "offset", offset: -1 });
    expect(screen.getByText(m.decoration_condition_offset_hint({ side: "end", day: 1 }))).toBeTruthy();
  });

  it("names the direction control for assistive tech", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByRole("radiogroup", { name: m.decoration_condition_offset_direction_label() })).toBeTruthy();
  });

  it("names the day input for assistive tech", () => {
    mount({ type: "offset", offset: 1 });
    expect(screen.getByRole("spinbutton", { name: m.decoration_condition_offset_day_label() })).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/decorations/settings/ui/ConditionOffset.test.ts`
Expected: FAIL — no `radio` role exists yet; the component still renders a lone number input bound to the signed value.

- [ ] **Step 5: Rewrite the component**

Replace `src/decorations/settings/ui/ConditionOffset.vue` with:

```vue
<script setup lang="ts">
import { useField } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);

const day = ref<number | undefined>(Math.abs(offset.value) || 1);

const side = computed<"start" | "end">({
  get: () => (offset.value < 0 ? "end" : "start"),
  set: (next) => {
    // Fall back to the stored magnitude so the direction still flips while the input is empty.
    const magnitude = typeof day.value === "number" ? day.value : Math.abs(offset.value);
    offset.value = next === "end" ? -magnitude : magnitude;
  },
});

watch(offset, (next) => {
  const magnitude = Math.abs(next);
  if (magnitude >= 1) day.value = magnitude;
});

watch(day, (next) => {
  // Clearing the input yields a non-number; hold the last valid offset instead of coercing.
  if (typeof next !== "number" || !Number.isInteger(next) || next < 1) return;
  offset.value = side.value === "end" ? -next : next;
});

const directionOptions = [
  { value: "start" as const, label: m.decoration_condition_offset_direction_option({ side: "start" }) },
  { value: "end" as const, label: m.decoration_condition_offset_direction_option({ side: "end" }) },
];

const hint = computed(() =>
  m.decoration_condition_offset_hint({
    side: offset.value < 0 ? "end" : "start",
    day: Math.abs(offset.value),
  }),
);
</script>

<template>
  <UiSegmentedControl
    v-model="side"
    :options="directionOptions"
    :aria-label="m.decoration_condition_offset_direction_label()"
  />
  <UiNumberInput v-model="day" :min="1" narrow :aria-label="m.decoration_condition_offset_day_label()" />
  <span class="offset-hint">{{ hint }}</span>
</template>

<style scoped>
.offset-hint {
  color: var(--text-muted);
}
</style>
```

Two things here are deliberate and must not be "simplified":

- `day` is a local `ref` with watchers, **not** a writable `computed` over the vee-validate field. Clearing the input makes `v-model` on `<input type="number">` emit the raw empty string (Vue's `looseToNumber` returns `""` unchanged when `parseFloat` yields `NaN`). A computed setter would coerce that to `1` and its getter would immediately re-render `1`, making the field impossible to clear and retype.
- The `typeof next !== "number"` guard is why the declared `number` model type is not trusted — see above.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/decorations/settings/ui/ConditionOffset.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Run the full check**

Run: `npm test && npm run check:types && npm run check:lint && npm run check:i18n`
Expected: all clean, except the known pre-existing `ConditionItem.test.ts` failure. `check:types` catches any remaining reference to the deleted `decoration_condition_offset_label` and any locale file still carrying the old hint shape.

- [ ] **Step 8: Commit**

```bash
git add messages/ src/decorations/settings/ui/ConditionOffset.vue src/decorations/settings/ui/ConditionOffset.test.ts
git commit -m "fix(decorations): pick an interval offset by direction and day"
```

---

### Task 5: Audit the locale corpus and record the fix

The translations themselves land in Tasks 3 and 4 — paraglide unions a message's generated
input type across every locale file, so a locale left stale breaks `check:types` in the task
that changes the message. This task is the audit that no locale was missed or malformed, plus
the changelog entry.

**Files:**

- Verify (do not routinely edit): `messages/de.json`, `messages/es.json`, `messages/fr.json`, `messages/it.json`, `messages/ja.json`, `messages/ko.json`, `messages/pt.json`, `messages/ru.json`, `messages/uk.json`, `messages/zh.json`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: the finished message corpus from Tasks 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Confirm the retired key is gone everywhere**

Run: `grep -ln decoration_condition_offset_label messages/*.json`
Expected: **no output**. Any file listed still carries the key deleted in Task 4 — remove that line from it.

- [ ] **Step 2: Confirm every locale carries the new variant keys**

Run:

```bash
for L in en de es fr it ja ko pt ru uk zh; do
  printf '%s: describe=%s hint=%s dir=%s day=%s cf=%s\n' "$L" \
    "$(grep -c 'side=start,day=1' messages/$L.json)" \
    "$(grep -c 'side=end,day=\*' messages/$L.json)" \
    "$(grep -c decoration_condition_offset_direction_option messages/$L.json)" \
    "$(grep -c decoration_condition_offset_day_label messages/$L.json)" \
    "$(grep -c decoration_condition_offset_direction_label messages/$L.json)"
done
```

Expected: every locale reports `describe=2 hint=2 dir=1 day=1 cf=1` — the two `side=start,day=1` keys are the describe and hint blocks, likewise the two `side=end,day=*`.

Any zero is a missed locale. Fill it from the translation tables in Tasks 3 and 4 — those tables are the source of truth, not a re-translation.

- [ ] **Step 3: Confirm no match key carries a stray space**

The inlang CLI injects a space into composite match keys (`side=start, day=1`), which is why `scripts/fix-i18n-variant-keys.mjs` exists. Hand-authored entries should not have this, but verify:

Run: `grep -n 'side=[a-z]*, day=' messages/*.json`
Expected: **no output**. If a file matches, remove the space after the comma.

- [ ] **Step 4: Run the full gate**

Run: `npm run compile:i18n && npm run check:i18n && npm test && npm run check:types && npm run check:lint`
Expected: all clean, except the known pre-existing `src/decorations/settings/ui/ConditionItem.test.ts` failure (a stale weekday query from commit `dec6adf7`, unrelated to this plan — do not fix it here).

- [ ] **Step 5: Record the user-facing fix**

v2 shipped the same broken default (`src/_old-code/defaults.ts:299`), so this is a real fix for anyone upgrading with an offset condition left at its default. Add one line to the end of the `### Bug Fixes` list under `## [Unreleased]` in `CHANGELOG.md`, matching the existing voice:

```markdown
- Interval-offset decorations now mark the interval's first day by default instead of never matching, and the editor spells out which day the offset targets.
```

- [ ] **Step 6: Commit**

```bash
git add messages/ CHANGELOG.md
git commit -m "docs(decorations): record the interval-offset condition fix"
```

---

### Task 6: Repair the stale weekday assertion in ConditionItem's test

Not part of the offset work — a pre-existing red test in the same directory, added to this plan
by explicit user request. `dec6adf7` ("refactor(decorations): pick weekdays with a segmented
control") replaced `ConditionWeekday.vue`'s checkbox grid with a `UiToggleGroup` of
`<button aria-pressed>` elements. It updated `ConditionWeekday.test.ts` but missed the sibling
assertion in `ConditionItem.test.ts`, so the suite has been red since that commit. While it is
red, every "npm test clean" gate in this plan is unverifiable.

**Files:**

- Modify: `src/decorations/settings/ui/ConditionItem.test.ts:70-73`

**Interfaces:**

- Consumes: nothing. Independent of the offset work.
- Produces: a green suite, so the final review's verification gate means something.

- [ ] **Step 1: Confirm the failure and its cause**

Run: `npx vitest run src/decorations/settings/ui/ConditionItem.test.ts`
Expected: FAIL at line 72 — `getAllByRole("checkbox")` finds nothing, and the printed DOM shows
`<button aria-pressed="false" class="ui-toggle-group__option">` elements instead.

- [ ] **Step 2: Query the control that is actually rendered**

`UiToggleGroup` renders one `<button type="button" :aria-pressed>` per option (see
`src/ui/UiToggleGroup.vue`), and `ConditionItem` mounts only the single leaf component, so the
seven weekday buttons are the only buttons in the tree. Replace line 72:

```ts
expect(screen.getAllByRole("button")).toHaveLength(7);
```

Do not change the test's name or its `mount` call — the behaviour under test ("renders
ConditionWeekday for a weekday condition") is unchanged; only the query was stale.

- [ ] **Step 3: Run the file to verify it passes**

Run: `npx vitest run src/decorations/settings/ui/ConditionItem.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: **fully green**, with no known-failure carve-out. This is the first point in the plan
where that is true. If anything else fails, stop and report it rather than fixing it — an
unexpected second failure is information the controller needs.

- [ ] **Step 5: Commit**

```bash
git add src/decorations/settings/ui/ConditionItem.test.ts
git commit -m "test(decorations): query the weekday toggle buttons instead of checkboxes"
```

---

## Verification

Full gate after Task 6: `npm test`, `npm run check:types`, `npm run check:lint`, `npm run check:i18n` — all green, no carve-outs.

No e2e. This is presentation over an engine path (`checkOffset`, `CycleService.offsets`) that unit tests already cover, and an offset e2e would need a custom-interval journal with a decoration whose result diverges from the default path to be worth anything — the unit tests establish that far more cheaply.

## Out of scope

- Range or band matching ("within the first 3 days"). That still needs several offset conditions with `mode: "or"`. It is a schema change; this is a presentation fix.
- Extending the offset condition beyond custom-interval journals (`condition-types.ts:13`).
- `CycleService.offsets` and `checkOffset` — both already correct.
