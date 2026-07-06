# Week Block Hideable Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `showHeading` option to the week calendar block that toggles its month/quarter/year header row, mirroring the month block exactly.

**Architecture:** Add `showHeading` to the week block schema/defaults, thread a `showHeader` prop through the shared `NotesWeekView` component (gating the header `<div>` with `v-if`), pass `config.showHeading` from the block renderer, and expose a toggle in the block config UI reusing the existing i18n label. This is a direct mirror of the month block's implementation.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), valibot (schema), vitest + @testing-library/vue (tests), paraglide (`m.*` i18n).

## Global Constraints

- Test/type/lint via npm scripts (not pnpm): `npm run test`, `npm run check:types`, `npm run check:lint`. All three must pass at each task's end.
- Never use `eslint-disable` comments; fix the code instead.
- Colocate `*.test.ts` next to implementation. Use `expectTypeOf` (never `@ts-expect-error`) for any type assertions.
- One behavior per test; test names are subject+verb behavior descriptions; assert observable outcomes (black-box).
- No new i18n key — reuse `m.view_block_config_show_heading_label()`.
- Commit to the current branch (`v3-ai`); never create a new branch. No `Co-Authored-By` trailer.
- `showHeading` defaults to `true` (preserves current always-visible header).

**Reference implementation (the month block — mirror it):**

- `src/views/blocks/month-calendar/month-calendar-block.ts:13-16,27`
- `src/notes-calendar/ui/NotesMonthView.vue:12-22,100`
- `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue:34`
- `src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue:20-26`
- Tests: `month-calendar-block.test.ts:36-39`, `NotesMonthView.test.ts:197-209`, `MonthCalendarBlockConfig.test.ts:31-44`

---

### Task 1: Add `showHeading` to the week block schema and defaults

Adding a required output field to the schema changes `WeekCalendarConfig`, so
every existing `WeekCalendarConfig` literal in the week block's tests must gain
`showHeading` to keep `check:types` green. This task bundles those mechanical
fixes with the schema change and the new default-parse test.

**Files:**

- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts`
- Test: `src/views/blocks/week-calendar/week-calendar-block.test.ts`
- Modify (type fix): `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`
- Modify (type fix): `src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`

**Interfaces:**

- Produces: `WeekCalendarConfig` now includes `showHeading: boolean` (required in
  the inferred output type; defaults to `true` when parsing a config that omits
  it). `weekCalendarBlock.defaultConfig.showHeading === true`.

- [ ] **Step 1: Write the failing test**

Add to `src/views/blocks/week-calendar/week-calendar-block.test.ts`, inside the
`describe("weekCalendarBlock", ...)` block (mirrors `month-calendar-block.test.ts:36-39`):

```ts
it("defaults showHeading to true when omitted", () => {
  const parsed = v.parse(weekCalendarBlock.schema, { before: 0, after: 0 });
  expect(parsed.showHeading).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/views/blocks/week-calendar/week-calendar-block.test.ts`
Expected: FAIL — `parsed.showHeading` is `undefined` (schema has no `showHeading`), and TypeScript reports `showHeading` does not exist on the parsed type.

- [ ] **Step 3: Add `showHeading` to the schema and default config**

In `src/views/blocks/week-calendar/week-calendar-block.ts`, change the schema (line 13) from:

```ts
const schema = v.object({ ...calendarBlockBaseSchema });
```

to:

```ts
const schema = v.object({
  ...calendarBlockBaseSchema,
  showHeading: v.optional(v.boolean(), true),
});
```

and change `defaultConfig` (line 24) from:

```ts
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const },
```

to:

```ts
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true },
```

- [ ] **Step 4: Fix existing `WeekCalendarConfig` literals broken by the type change**

In `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`, add `showHeading: true` to each of the four `config` literals. Each currently reads like:

```ts
      config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const },
```

Update every one to include `showHeading: true`, e.g.:

```ts
      config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true },
```

(The four are at the `before/after` values `0/0`, `1/1`, `2/0`, `0/1`.)

In `src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`, update the
existing test's config literal (line 34) AND its expected `onChange` object (line 38),
since `update` spreads the full config through:

```ts
mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
const [beforeInput] = screen.getAllByRole("spinbutton");
await userEvent.clear(beforeInput);
await userEvent.type(beforeInput, "2");
expect(onChange).toHaveBeenLastCalledWith({
  before: 2,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: true,
});
```

- [ ] **Step 5: Run tests and type-check to verify they pass**

Run: `npm run test -- src/views/blocks/week-calendar/ && npm run check:types`
Expected: PASS — new default test passes; the four `WeekCalendarBlock` tests and the existing `WeekCalendarBlockConfig` test pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/week-calendar/week-calendar-block.ts src/views/blocks/week-calendar/week-calendar-block.test.ts src/views/blocks/week-calendar/WeekCalendarBlock.test.ts src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts
git commit -m "feat(views): add showHeading option to the week calendar block schema"
```

---

### Task 2: Gate the `NotesWeekView` header behind a `showHeader` prop

**Files:**

- Modify: `src/notes-calendar/ui/NotesWeekView.vue`
- Test: `src/notes-calendar/ui/NotesWeekView.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `NotesWeekView` accepts `showHeader?: boolean` (default `true`). When
  `false`, `.notes-week-view__header` is not rendered.

- [ ] **Step 1: Write the failing tests**

In `src/notes-calendar/ui/NotesWeekView.test.ts`, first add `showHeader` to the
`mount` helper's `props` type (currently lines 16-21) so the new prop can be passed:

```ts
  props: {
    shelf: string | null;
    week: WeekPeriod;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  },
```

Then add a new `describe` block inside `describe("NotesWeekView", ...)` (mirrors
`NotesMonthView.test.ts:197-209`):

```ts
describe("header visibility", () => {
  it("hides the default header row when showHeader is false", () => {
    const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
    const { container } = mount(h, { shelf: null, week, showHeader: false });
    expect(container.querySelector(".notes-week-view__header")).toBeNull();
  });

  it("renders the default header row when showHeader is omitted", () => {
    const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
    const { container } = mount(h, { shelf: null, week });
    expect(container.querySelector(".notes-week-view__header")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `npm run test -- src/notes-calendar/ui/NotesWeekView.test.ts`
Expected: FAIL — "hides the default header row when showHeader is false" fails because the header is always rendered (`showHeader` is ignored). The "omitted" case already passes.

- [ ] **Step 3: Add the `showHeader` prop and `v-if` guard**

In `src/notes-calendar/ui/NotesWeekView.vue`, convert the plain `defineProps`
(lines 12-17) to `withDefaults` and add `showHeader` (mirrors `NotesMonthView.vue:12-22`):

```ts
const props = withDefaults(
  defineProps<{
    shelf: string | null;
    week: WeekPeriod;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  }>(),
  { weeks: undefined, hiddenWeekdays: undefined, showHeader: true },
);
```

Then gate the header `<div>` (line 58) with `v-if="showHeader"`:

```vue
    <div v-if="showHeader" class="notes-week-view__header">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/notes-calendar/ui/NotesWeekView.test.ts`
Expected: PASS — both header-visibility tests pass; all pre-existing `NotesWeekView` tests (day cells, weekday header, header badges, header slot, etc.) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/notes-calendar/ui/NotesWeekView.vue src/notes-calendar/ui/NotesWeekView.test.ts
git commit -m "feat(views): support hiding the NotesWeekView header via showHeader"
```

---

### Task 3: Expose `showHeading` through the week block renderer and config UI

**Files:**

- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`
- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue`
- Test: `src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`

**Interfaces:**

- Consumes: `WeekCalendarConfig.showHeading` (Task 1); `NotesWeekView` `showHeader`
  prop (Task 2).
- Produces: the block renderer passes `config.showHeading` to `NotesWeekView`; the
  config form renders a toggle that emits `onChange` with the updated `showHeading`.

- [ ] **Step 1: Write the failing config test**

In `src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`, add a new
test inside `describe("WeekCalendarBlockConfig", ...)` (mirrors `MonthCalendarBlockConfig.test.ts:32-44`):

```ts
it("emits onChange turning the heading off when the toggle is switched off", async () => {
  const onChange = vi.fn();
  mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
  const checkboxes = screen.getAllByRole("checkbox");
  await userEvent.click(checkboxes.at(-1)!);
  expect(onChange).toHaveBeenCalledWith({
    before: 0,
    after: 0,
    hiddenWeekdays: [],
    weeks: "left",
    showHeading: false,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`
Expected: FAIL — there is no heading toggle in the form, so the last checkbox is not the heading control (or no such checkbox exists), and `onChange` is not called with `showHeading: false`.

- [ ] **Step 3: Add the toggle to the config UI**

Replace the contents of `src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue`
with (mirrors `MonthCalendarBlockConfig.vue`):

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import CalendarBlockConfigFields from "../../ui/CalendarBlockConfigFields.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "../week-calendar-block";

const props = defineProps<{
  config: WeekCalendarConfig;
  onChange: WeekCalendarConfigChange;
}>();

const update = (patch: Partial<WeekCalendarConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <CalendarBlockConfigFields unit="week" :config="config" :on-change="update" />
  <UiSettingRow>
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
</template>
```

- [ ] **Step 4: Run the config test to verify it passes**

Run: `npm run test -- src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts`
Expected: PASS — both the existing "merges a field patch" test and the new heading-toggle test pass.

- [ ] **Step 5: Pass `showHeading` from the block renderer**

In `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`, add the `show-header`
binding to `NotesWeekView` (mirrors `MonthCalendarBlock.vue:34`). The element
(lines 27-34) becomes:

```vue
<NotesWeekView
  v-for="week of weeks"
  :key="week.start.toAnchor()"
  :week="week"
  :shelf="viewContext.shelf.value"
  :weeks="config.weeks"
  :hidden-weekdays="config.hiddenWeekdays"
  :show-header="config.showHeading"
/>
```

- [ ] **Step 6: Run the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS — all tests green (including the existing `WeekCalendarBlock.test.ts`, whose `NotesWeekView` stub ignores the extra `show-header` binding), no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue src/views/blocks/week-calendar/WeekCalendarBlockConfig.test.ts
git commit -m "feat(views): expose the week block hide-heading toggle"
```

---

## Notes

- **No e2e change.** No existing e2e asserts on the month block's `showHeading`;
  gating an existing element behind a `v-if` has no e2e precedent to mirror and a
  black-box toggle test would be low value. The unit tests in Tasks 2 and 3 cover
  the behavior.
- **No migration change.** The v3→v4 migration (`src/settings/legacy/v3-to-v4.ts`)
  builds week-block configs without `showHeading`; the schema default (`true`)
  fills it on read, matching how the month block migration omits it. Leave it.
- **`calendarBlockBaseSchema` untouched.** `showHeading` stays per-block, mirroring
  the month block.
