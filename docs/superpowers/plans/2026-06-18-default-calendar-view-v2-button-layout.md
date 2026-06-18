# Default Calendar View v2 Button Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seeded default calendar view reproduce v2's two-row, aligned, decorated button layout using only the configurable toolbar, without losing journal decorations on period badges.

**Architecture:** Add a `spacer` toolbar item for alignment; decorate the toolbar `period-buttons` by reusing the `@/decorations` engine (so the grid header becomes redundant); add a `showHeading` toggle to the month-calendar block; restructure the default preset into two toolbar blocks with the grid header hidden. The e2e journeys fixture pins its own header-on view so the shared decoration matrix (which also runs against the toolbar-less timeline code block) keeps its grid-header targets.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, valibot, vitest + @testing-library/vue, paraglide i18n, WebdriverIO e2e.

## Global Constraints

- Test commands (npm, not pnpm): `npm run test`, `npm run check:types`, `npm run check:lint`. e2e: `npm run test:e2e` (builds, then wdio).
- After editing `messages/en.json`, run `npm run compile:i18n` so the generated `m.*` functions exist for `vue-tsc`/`vitest`.
- Commit to the current branch (`v3-ai`); never create a branch. No `Co-Authored-By` trailer.
- No `eslint-disable`; no spec-reference comments; no WHAT-comments. Colocate `*.test.ts` with implementation.
- Vue component tests use @testing-library/vue + user-event (no `@vue/test-utils`, no test-only `data-*`). Inline `defineProps<{...}>()`.
- Decorating the period-buttons (Task 2) MUST land before hiding the grid header on the default view (Task 6); the journeys fixture MUST be pinned (Task 5) before the default-view change (Task 6) so the e2e suite never breaks at a commit boundary.

---

### Task 1: `spacer` toolbar item

**Files:**

- Create: `src/views/toolbar-items/spacer/spacer-item.ts`
- Create: `src/views/toolbar-items/spacer/ui/SpacerItem.vue`
- Modify: `src/views/module.ts` (import + register)
- Modify: `messages/en.json` (two keys)

**Interfaces:**

- Produces: `spacerItem` — a `ToolbarItemDefinition` with `key: "spacer"`, registered under `ToolbarItemDefinitionToken`. Consumed by the default view (Task 6) and the e2e fixture (Task 5) as toolbar items with `key: "spacer"`, `config: {}`.

- [ ] **Step 1: Create the spacer component**

`src/views/toolbar-items/spacer/ui/SpacerItem.vue`:

```vue
<script setup lang="ts">
import type { BlockInstanceId } from "../../../config";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();
</script>

<template>
  <div class="jv-toolbar-spacer" />
</template>

<style scoped>
.jv-toolbar-spacer {
  flex: 1 1 0;
  min-width: 0;
}
</style>
```

- [ ] **Step 2: Create the item definition**

`src/views/toolbar-items/spacer/spacer-item.ts`:

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";

import SpacerItem from "./ui/SpacerItem.vue";

const schema = v.object({});

export const spacerItem = defineToolbarItem({
  key: "spacer",
  label: m.view_toolbar_spacer_label(),
  description: m.view_toolbar_spacer_description(),
  schema,
  defaultConfig: {},
  component: SpacerItem,
});
```

- [ ] **Step 3: Add the i18n keys**

In `messages/en.json`, add (next to the other `view_toolbar_*` keys):

```json
"view_toolbar_spacer_label": "Spacer",
"view_toolbar_spacer_description": "Flexible gap that pushes neighbouring items apart.",
```

- [ ] **Step 4: Compile i18n**

Run: `npm run compile:i18n`
Expected: completes with no error; `m.view_toolbar_spacer_label` / `m.view_toolbar_spacer_description` are generated.

- [ ] **Step 5: Register the item**

In `src/views/module.ts`, add the import next to the other toolbar-item imports:

```ts
import { shelfSelectorItem } from "./toolbar-items/shelf-selector/shelf-selector-item";
import { spacerItem } from "./toolbar-items/spacer/spacer-item";
```

and register it after `shelfSelectorItem`:

```ts
c.register(ToolbarItemDefinitionToken).useValue(shelfSelectorItem);
c.register(ToolbarItemDefinitionToken).useValue(spacerItem);
c.register(ToolbarItemDefinitionToken).useValue(periodButtonsItem);
```

- [ ] **Step 6: Verify types, lint, and existing tests**

Run: `npm run check:types && npm run check:lint && npm run test`
Expected: all pass. No new unit test — the spacer is a trivial empty-div component and registration is wiring; it is exercised by the e2e in Tasks 5 and 7.

- [ ] **Step 7: Commit**

```bash
git add src/views/toolbar-items/spacer src/views/module.ts messages/en.json src/i18n/paraglide
git commit -m "feat(views): add spacer toolbar item"
```

---

### Task 2: Decorate the toolbar period-buttons

**Files:**

- Modify: `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`
- Modify: `src/views/toolbar-items/period-buttons/PeriodButtonsItem.test.ts`

**Interfaces:**

- Consumes: `useCellDecorations` and `CellDecoration` from `@/decorations` (barrel exports confirmed at `src/decorations/index.ts:34,37`).
- Produces: period badges that render journal decorations; `data-period` / `data-active` stay on the `UiButton` for e2e and active styling.

- [ ] **Step 1: Update the existing unit test to stub `@/decorations`**

Decorating pulls `useCellDecorations` into the component, which resolves `DecorationEngine`, `JournalsRepository`, `JournalsIndex`, `NotesService`, `NoteMetadataService` from the container — none registered in this test's container. Stub the module so the unit test stays focused on badge/active/click behavior (decoration rendering is covered by e2e in Task 7).

In `src/views/toolbar-items/period-buttons/PeriodButtonsItem.test.ts`, add this mock next to the existing `vi.mock("@/notes-calendar/use-shelf-scope", …)` block (it uses `defineComponent` and `h`, already imported at the top of the file):

```ts
vi.mock("@/decorations", () => ({
  useCellDecorations: () => new Map(),
  CellDecoration: defineComponent({
    props: { period: { type: Object, required: true } },
    setup:
      (_props, { slots }) =>
      () =>
        h("span", slots.default?.()),
  }),
}));
```

- [ ] **Step 2: Run the test to confirm it still passes before the component changes**

Run: `npm run test -- src/views/toolbar-items/period-buttons/PeriodButtonsItem.test.ts`
Expected: PASS (the mock is inert until the component imports `@/decorations`).

- [ ] **Step 3: Decorate the period badges in the component**

In `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`:

Add the import (with the other `@/` imports):

```ts
import { CellDecoration, useCellDecorations } from "@/decorations";
```

After the `badges` computed is defined (and `scope` is in scope), register the decoration map:

```ts
useCellDecorations(
  () => badges.value.map((badge) => badge.period),
  () => scope.all.value,
);
```

Wrap each badge label in the template so decorations render inside the existing button:

```vue
<template>
  <UiButton
    v-for="badge of badges"
    :key="badge.key"
    flat
    :data-period="badge.key"
    :data-active="isActive(badge) || null"
    @click="(event: MouseEvent) => open(badge, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => open(badge, event)"
  >
    <CellDecoration :period="badge.period">{{ badge.label }}</CellDecoration>
  </UiButton>
</template>
```

- [ ] **Step 4: Run the period-buttons tests**

Run: `npm run test -- src/views/toolbar-items/period-buttons`
Expected: PASS — `PeriodButtonsItem.test.ts` and `PeriodButtonsItemConfig.test.ts` both green (badges still expose `data-period` / `data-active`; the stubbed `CellDecoration` renders the label).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types && npm run check:lint`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/toolbar-items/period-buttons
git commit -m "feat(views): decorate toolbar period buttons for v2 parity"
```

---

### Task 3: `showHeader` prop on `NotesMonthView`

**Files:**

- Modify: `src/notes-calendar/ui/NotesMonthView.vue`
- Test: `src/notes-calendar/ui/NotesMonthView.test.ts`

**Interfaces:**

- Produces: `NotesMonthView` accepts an optional `showHeader?: boolean` prop. When `false`, the `.notes-month-view__header` row is not rendered. Omitted/`true` keeps the current behavior. Consumed by `MonthCalendarBlock` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `src/notes-calendar/ui/NotesMonthView.test.ts`, first extend the `mount` helper's `props` type to allow the new prop:

```ts
function mount(
  h: NotesCalendarHarness,
  props: {
    shelf: string | null;
    month: MonthPeriod;
    hideOutsideDates?: boolean;
    weeks?: "none" | "left" | "right";
    hiddenWeekdays?: readonly number[];
    showHeader?: boolean;
  },
) {
```

Then add a new describe block (e.g. after the existing `"header slot"` describe):

```ts
describe("header visibility", () => {
  it("hides the default header row when showHeader is false", () => {
    const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
    const { container } = mount(h, { shelf: null, month, showHeader: false });
    expect(container.querySelector(".notes-month-view__header")).toBeNull();
  });

  it("renders the default header row when showHeader is omitted", () => {
    const h = buildNotesCalendarHarness({ journals: { monthly: fixedJournal("monthly", { type: "month" }) } });
    const { container } = mount(h, { shelf: null, month });
    expect(container.querySelector(".notes-month-view__header")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `npm run test -- src/notes-calendar/ui/NotesMonthView.test.ts`
Expected: "hides the default header row when showHeader is false" FAILS (header still renders); the omitted-case test passes.

- [ ] **Step 3: Implement the prop**

In `src/notes-calendar/ui/NotesMonthView.vue`, add `showHeader?: boolean;` to `defineProps`:

```ts
const props = defineProps<{
  shelf: string | null;
  month: MonthPeriod;
  hideOutsideDates?: boolean;
  weeks?: "none" | "left" | "right";
  hiddenWeekdays?: readonly number[];
  showHeader?: boolean;
}>();
```

Guard the header element (default-true: render unless explicitly `false`):

```vue
    <div v-if="props.showHeader !== false" class="notes-month-view__header">
      <slot name="header">
```

(leave the slot and the two/three `NotesCalendarCell` children unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/notes-calendar/ui/NotesMonthView.test.ts`
Expected: PASS (both new tests, and all pre-existing NotesMonthView tests, green).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check:types && npm run check:lint`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/ui/NotesMonthView.vue src/notes-calendar/ui/NotesMonthView.test.ts
git commit -m "feat(notes-calendar): add showHeader prop to NotesMonthView"
```

---

### Task 4: Month-calendar `showHeading` config + plumbing + editor toggle

**Files:**

- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts` (schema + defaultConfig)
- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue` (pass `:show-header`)
- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue` (toggle row)
- Modify: `messages/en.json` (label key)
- Test: `src/views/blocks/month-calendar/month-calendar-block.test.ts`
- Test: `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts`
- Test: `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts` (type fix)

**Interfaces:**

- Consumes: `NotesMonthView`'s `showHeader` prop (Task 3).
- Produces: `MonthCalendarConfig` gains `showHeading: boolean` (output type; optional-with-default in the schema). `defaultConfig.showHeading === true`. Consumed by the default view (Task 6) and e2e fixture (Task 5).

- [ ] **Step 1: Write the failing schema-default test**

In `src/views/blocks/month-calendar/month-calendar-block.test.ts`, add:

```ts
it("defaults showHeading to true when omitted", () => {
  const parsed = v.parse(monthCalendarBlock.schema, { before: 0, after: 0 });
  expect(parsed.showHeading).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/views/blocks/month-calendar/month-calendar-block.test.ts`
Expected: FAIL — `parsed.showHeading` is `undefined`.

- [ ] **Step 3: Add the schema field + default**

In `src/views/blocks/month-calendar/month-calendar-block.ts`, add `showHeading` to the schema and `defaultConfig`:

```ts
const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
  showHeading: v.optional(v.boolean(), true),
});
```

```ts
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true },
```

- [ ] **Step 4: Run the block test to verify it passes**

Run: `npm run test -- src/views/blocks/month-calendar/month-calendar-block.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the config through to NotesMonthView**

In `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`, add the prop binding to the `NotesMonthView` element:

```vue
<NotesMonthView
  v-for="month of months"
  :key="month.start.toAnchor()"
  :month="month"
  :shelf="viewContext.shelf.value"
  :weeks="config.weeks"
  :hidden-weekdays="config.hiddenWeekdays"
  :show-header="config.showHeading"
/>
```

- [ ] **Step 6: Fix the block-render test's config literals**

`MonthCalendarConfig` now requires `showHeading` in its output type, so the literals in `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts` must include it. Add `showHeading: true` to each of the four `config: { … }` objects, e.g.:

```ts
      config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true },
```

(the mocked `NotesMonthView` stub ignores `show-header`, so assertions are unchanged).

- [ ] **Step 7: Add the editor toggle**

In `src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue`, import `UiToggle`:

```ts
import UiToggle from "@/ui/UiToggle.vue";
```

Add this row as the **last** `UiSettingRow` in the template (placement-last keeps the toggle the final checkbox for the test query):

```vue
<UiSettingRow>
    <template #name>{{ m.view_block_config_show_heading_label() }}</template>
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
```

- [ ] **Step 8: Add the i18n key + compile**

In `messages/en.json` add (next to the other `view_block_config_*` keys):

```json
"view_block_config_show_heading_label": "Show month/year heading",
```

Run: `npm run compile:i18n`
Expected: completes; `m.view_block_config_show_heading_label` generated.

- [ ] **Step 9: Update the config-editor tests**

In `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts`:

(a) Add `showHeading: true` to every input `config` literal and every `expect(onChange).toHaveBeenLastCalledWith(...)` / `toHaveBeenCalledWith(...)` object, since `update()` spreads `...props.config`. For example the first test becomes:

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

Apply the same `showHeading: true` addition to the input config and expected object in all four existing tests.

(b) Add a focused test for the toggle (the toggle is the last checkbox in the form — 7 weekday checkboxes precede it):

```ts
it("emits onChange turning the heading off when the toggle is switched off", async () => {
  const onChange = vi.fn();
  mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
  const checkboxes = screen.getAllByRole("checkbox");
  await userEvent.click(checkboxes[checkboxes.length - 1]);
  expect(onChange).toHaveBeenCalledWith({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left", showHeading: false });
});
```

- [ ] **Step 10: Run the month-calendar tests, types, lint**

Run: `npm run test -- src/views/blocks/month-calendar && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/views/blocks/month-calendar messages/en.json src/i18n/paraglide
git commit -m "feat(views): add show-heading toggle to month-calendar block"
```

---

### Task 5: Pin a header-on `Calendar` view in the e2e-journeys fixture

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`

**Interfaces:**

- Consumes: the `spacer` item (Task 1), decorated period-buttons (Task 2), `showHeading` config (Task 4) — all must exist for this pinned view to parse/render.
- Produces: the journeys vault renders an explicit two-toolbar `Calendar` view with `showHeading: true`, decoupling the existing e2e suite (header-cell + decoration-matrix tests) from the default-preset change in Task 6.

- [ ] **Step 1: Add a `views` key to the fixture data**

The current top-level keys are `version`, `journals`, `shelves`, `commands`. Add a `views` object (a dict keyed by view id, same shape as `e2e-views`). The view mirrors the new two-toolbar layout but keeps the grid header on:

```json
"views": {
  "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c": {
    "id": "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c",
    "name": "Calendar",
    "icon": "calendar-days",
    "defaultShelf": null,
    "showInRibbon": true,
    "leaf": "right",
    "openOnStartup": true,
    "blocks": [
      {
        "id": "c1a2b3d4-1e2f-4a5b-9c6d-7e8f9a0b1c2d",
        "key": "toolbar",
        "config": {
          "items": [
            { "id": "d2b3c4e5-2f3a-4b6c-8d7e-9f0a1b2c3d4e", "key": "shelf-selector", "config": {} },
            { "id": "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e", "key": "spacer", "config": {} },
            { "id": "e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f", "key": "button", "config": { "action": { "type": "pick-date", "mode": "navigate", "levels": ["day"] } } },
            { "id": "f4d5e6a7-4b5c-4d8e-8f9a-1b2c3d4e5f6a", "key": "button", "config": { "action": { "type": "current", "mode": "create", "levels": ["day"] } } }
          ]
        }
      },
      {
        "id": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        "key": "toolbar",
        "config": {
          "items": [
            { "id": "a5e6f7b8-5c6d-4e9f-9a0b-2c3d4e5f6a7b", "key": "button", "config": { "action": { "type": "navigate-step", "direction": "prev", "unit": "year", "amount": 1 } } },
            { "id": "b6f7a8c9-6d7e-4f0a-8b1c-3d4e5f6a7b8c", "key": "button", "config": { "action": { "type": "navigate-step", "direction": "prev", "unit": "month", "amount": 1 } } },
            { "id": "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f", "key": "spacer", "config": {} },
            { "id": "c7a8b9d0-7e8f-4a1b-9c2d-4e5f6a7b8c9d", "key": "period-buttons", "config": { "week": false, "month": true, "quarter": true, "year": true } },
            { "id": "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a", "key": "spacer", "config": {} },
            { "id": "d8b9c0e1-8f9a-4b2c-8d3e-5f6a7b8c9d0e", "key": "button", "config": { "action": { "type": "navigate-step", "direction": "next", "unit": "month", "amount": 1 } } },
            { "id": "e9c0d1f2-9a0b-4c3d-9e4f-6a7b8c9d0e1f", "key": "button", "config": { "action": { "type": "navigate-step", "direction": "next", "unit": "year", "amount": 1 } } }
          ]
        }
      },
      {
        "id": "fa0d1e2b-0b1c-4d4e-8f5a-7b8c9d0e1f2a",
        "key": "month-calendar",
        "config": { "before": 0, "after": 0, "hiddenWeekdays": [], "weeks": "left", "showHeading": true }
      },
      { "id": "ab1e2f3c-1c2d-4e5f-9a6b-8c9d0e1f2a3b", "key": "divider", "config": {} },
      { "id": "bc2f3a4d-2d3e-4f6a-8b7c-9d0e1f2a3b4c", "key": "custom-intervals", "config": { "window": "current-month", "hideEmpty": true } }
    ]
  }
}
```

Place the `views` key as a sibling of `journals`/`shelves`/`commands` (mind JSON commas). Keep the existing keys untouched.

- [ ] **Step 2: Validate the JSON parses**

Run: `python3 -c "import json; json.load(open('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json')); print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Run the existing calendar e2e suite against the pinned view**

Run: `npm run test:e2e`
Expected: the `calendar view` journeys, decorations (incl. `assertDecorationMatrix`), live-editing, toolbar, and custom-intervals describes all PASS. The pinned view keeps the grid header (`header-month/quarter/year`) and exposes the same toolbar controls (`[aria-label="Next month"]`, `[data-period="month"]`, shelf "All journals", "Today", "Pick a date") across the two toolbar rows, so every existing selector still resolves.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(views): pin header-on calendar view in journeys fixture"
```

---

### Task 6: Restructure the default calendar view (two toolbars, spacers, hidden grid heading)

**Files:**

- Modify: `src/views/default-view.ts`
- Test: `src/views/default-view.test.ts` (rewrite for two toolbar blocks)

**Interfaces:**

- Consumes: `spacer` item (Task 1), `showHeading` config (Task 4).
- Produces: `defaultCalendarView()` returns blocks `[toolbar (actions), toolbar (navigation), month-calendar, divider, custom-intervals]`, the month-calendar with `showHeading: false`.

- [ ] **Step 1: Rewrite the unit test for the two-toolbar structure**

Replace the body of `src/views/default-view.test.ts` with:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema } from "./config";
import { defaultCalendarView } from "./default-view";

interface ToolbarItem {
  id: string;
  key: string;
  config: Record<string, unknown>;
}

function itemsOf(blockIndex: number): ToolbarItem[] {
  const block = defaultCalendarView().blocks[blockIndex];
  return (block.config as { items: ToolbarItem[] }).items;
}

function allItems(): ToolbarItem[] {
  return [...itemsOf(0), ...itemsOf(1)];
}

function actionOf(item: ToolbarItem): { type: string; mode?: string } | undefined {
  return (item.config as { action?: { type: string; mode?: string } }).action;
}

describe("defaultCalendarView", () => {
  it("produces a view that satisfies the view schema", () => {
    const result = v.safeParse(viewSchema, defaultCalendarView());
    expect(result.success).toBe(true);
  });

  it("orders blocks as two toolbars, month grid, divider, then intervals", () => {
    const keys = defaultCalendarView().blocks.map((block) => block.key);
    expect(keys).toEqual(["toolbar", "toolbar", "month-calendar", "divider", "custom-intervals"]);
  });

  it("lays out the actions row as shelf, spacer, then the two action buttons", () => {
    expect(itemsOf(0).map((item) => item.key)).toEqual(["shelf-selector", "spacer", "button", "button"]);
  });

  it("centres the period buttons between the nav buttons with flanking spacers", () => {
    expect(itemsOf(1).map((item) => item.key)).toEqual([
      "button",
      "button",
      "spacer",
      "period-buttons",
      "spacer",
      "button",
      "button",
    ]);
  });

  it("seeds the pick-date button in navigate mode", () => {
    const pick = allItems().find((item) => actionOf(item)?.type === "pick-date");
    expect(actionOf(pick!)?.mode).toBe("navigate");
  });

  it("seeds the current button in create mode", () => {
    const current = allItems().find((item) => actionOf(item)?.type === "current");
    expect(actionOf(current!)?.mode).toBe("create");
  });

  it("seeds period buttons for month, quarter, and year but not week", () => {
    const period = allItems().find((item) => item.key === "period-buttons");
    expect(period!.config).toEqual({ week: false, month: true, quarter: true, year: true });
  });

  it("hides the month grid's own heading in favour of the toolbar period buttons", () => {
    const monthGrid = defaultCalendarView().blocks.find((block) => block.key === "month-calendar");
    expect((monthGrid!.config as { showHeading: boolean }).showHeading).toBe(false);
  });

  it("seeds the default calendar view into the right sidebar", () => {
    expect(defaultCalendarView().leaf).toBe("right");
  });

  it("opts the default calendar view into open-on-startup", () => {
    expect(defaultCalendarView().openOnStartup).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/views/default-view.test.ts`
Expected: FAIL (the current single-toolbar view yields block keys `["toolbar","month-calendar",…]` and `itemsOf(1)` is the month-calendar block).

- [ ] **Step 3: Restructure the default view**

Replace `src/views/default-view.ts` block-id constants and the `blocks` array. New constants:

```ts
const TOOLBAR_ACTIONS_BLOCK_ID = "c1a2b3d4-1e2f-4a5b-9c6d-7e8f9a0b1c2d" as BlockInstanceId;
const TOOLBAR_NAV_BLOCK_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" as BlockInstanceId;
const MONTH_CALENDAR_BLOCK_ID = "fa0d1e2b-0b1c-4d4e-8f5a-7b8c9d0e1f2a" as BlockInstanceId;
const DIVIDER_BLOCK_ID = "ab1e2f3c-1c2d-4e5f-9a6b-8c9d0e1f2a3b" as BlockInstanceId;
const CUSTOM_INTERVALS_BLOCK_ID = "bc2f3a4d-2d3e-4f6a-8b7c-9d0e1f2a3b4c" as BlockInstanceId;

const ITEM_SHELF_SELECTOR = "d2b3c4e5-2f3a-4b6c-8d7e-9f0a1b2c3d4e";
const ITEM_SPACER_ACTIONS = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const ITEM_PICK_DATE = "e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f";
const ITEM_CURRENT = "f4d5e6a7-4b5c-4d8e-8f9a-1b2c3d4e5f6a";
const ITEM_PREV_YEAR = "a5e6f7b8-5c6d-4e9f-9a0b-2c3d4e5f6a7b";
const ITEM_PREV_MONTH = "b6f7a8c9-6d7e-4f0a-8b1c-3d4e5f6a7b8c";
const ITEM_SPACER_NAV_LEFT = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const ITEM_PERIOD_BUTTONS = "c7a8b9d0-7e8f-4a1b-9c2d-4e5f6a7b8c9d";
const ITEM_SPACER_NAV_RIGHT = "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a";
const ITEM_NEXT_MONTH = "d8b9c0e1-8f9a-4b2c-8d3e-5f6a7b8c9d0e";
const ITEM_NEXT_YEAR = "e9c0d1f2-9a0b-4c3d-9e4f-6a7b8c9d0e1f";
```

New `blocks` array inside `defaultCalendarView()`:

```ts
    blocks: [
      {
        id: TOOLBAR_ACTIONS_BLOCK_ID,
        key: "toolbar",
        config: {
          items: [
            { id: ITEM_SHELF_SELECTOR, key: "shelf-selector", config: {} },
            { id: ITEM_SPACER_ACTIONS, key: "spacer", config: {} },
            {
              id: ITEM_PICK_DATE,
              key: "button",
              config: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
            },
            {
              id: ITEM_CURRENT,
              key: "button",
              config: { action: { type: "current", mode: "create", levels: ["day"] } },
            },
          ],
        },
      },
      {
        id: TOOLBAR_NAV_BLOCK_ID,
        key: "toolbar",
        config: {
          items: [
            {
              id: ITEM_PREV_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "year", amount: 1 } },
            },
            {
              id: ITEM_PREV_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } },
            },
            { id: ITEM_SPACER_NAV_LEFT, key: "spacer", config: {} },
            {
              id: ITEM_PERIOD_BUTTONS,
              key: "period-buttons",
              config: { week: false, month: true, quarter: true, year: true },
            },
            { id: ITEM_SPACER_NAV_RIGHT, key: "spacer", config: {} },
            {
              id: ITEM_NEXT_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } },
            },
            {
              id: ITEM_NEXT_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "year", amount: 1 } },
            },
          ],
        },
      },
      {
        id: MONTH_CALENDAR_BLOCK_ID,
        key: "month-calendar",
        config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left", showHeading: false },
      },
      { id: DIVIDER_BLOCK_ID, key: "divider", config: {} },
      { id: CUSTOM_INTERVALS_BLOCK_ID, key: "custom-intervals", config: { window: "current-month", hideEmpty: true } },
    ],
```

- [ ] **Step 4: Run the unit test, types, lint**

Run: `npm run test -- src/views/default-view.test.ts && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 5: Confirm the e2e suite is still green (journeys is pinned, so unaffected)**

Run: `npm run test:e2e`
Expected: PASS — the journeys fixture renders its pinned header-on view (Task 5), so changing the code default does not affect it.

- [ ] **Step 6: Commit**

```bash
git add src/views/default-view.ts src/views/default-view.test.ts
git commit -m "feat(views): seed default calendar view as two toolbars without grid heading"
```

---

### Task 7: e2e coverage for the new behaviors

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

**Interfaces:**

- Consumes: the journeys fixture's decorated period-buttons (Tasks 2, 5) and a views-less fixture (`e2e/fixtures/e2e-daily`, confirmed: keys `version`/`journals`, a `daily` journal, no `views`) that auto-seeds the real default (Task 6).

- [ ] **Step 1: Assert the toolbar period button renders a decoration**

`seedDecorationFixture()` (run in the `decorations` describe's `before`) seeds a `monthly` note whose tasks are all completed, which decorates the month period. In `e2e/journeys/view.e2e.ts`, inside the existing `describe("decorations", …)` block (after `assertDecorationMatrix(calendar);`), add:

```ts
it("renders the month decoration on the toolbar period button", async () => {
  await openCalendarView();
  await $(`${TOOLBAR} [data-period="month"] .decoration-corner`).waitForExist({
    timeoutMsg: "month decoration did not render on the toolbar period button",
  });
});
```

(`TOOLBAR` and `openCalendarView` are already imported from `./view.js`.)

- [ ] **Step 2: Assert the seeded default preset hides the grid heading and renders two toolbar rows**

Add a new top-level describe in `e2e/journeys/view.e2e.ts` (e.g. after the `custom intervals block` describe). It reloads the views-less `e2e-daily` vault so the plugin auto-seeds the real default view:

```ts
describe("default preset layout", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("seeds two toolbar rows above the month grid", async () => {
    await openCalendarView();
    await expect($$(`${LIVE_LEAF} .journal-view-toolbar`)).toBeElementsArrayOfSize(2);
  });

  it("seeds three flexible spacers across the two toolbar rows", async () => {
    await openCalendarView();
    await expect($$(`${LIVE_LEAF} .jv-toolbar-spacer`)).toBeElementsArrayOfSize(3);
  });

  it("hides the month grid's own month/year heading", async () => {
    await openCalendarView();
    await $(`${MONTH_VIEW}`).waitForExist({ timeoutMsg: "month grid did not render" });
    await expect($(`${LIVE_LEAF} .notes-month-view__header`)).not.toBeExisting();
  });
});
```

For the heading test to reference `MONTH_VIEW`, export it from `e2e/journeys/view.ts` (it is currently module-private):

```ts
export const MONTH_VIEW = `${LIVE_LEAF} .notes-month-view`;
```

and add `MONTH_VIEW` to the existing import from `./view.js` at the top of `view.e2e.ts`:

```ts
import { calendar, LIVE_LEAF, MONTH_VIEW, openCalendarView, TOOLBAR } from "./view.js";
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: the new `default preset layout` describe and the period-button decoration test PASS, and every pre-existing describe stays green.

- [ ] **Step 4: Final full verification**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view.e2e.ts e2e/journeys/view.ts
git commit -m "test(views): e2e for decorated period buttons and default two-toolbar preset"
```

---

## Notes for the implementer

- **Ordering is load-bearing.** Tasks 1–4 are prerequisites for the pinned fixture (Task 5), which must precede the default-view change (Task 6) so the journeys e2e never breaks. Task 2 (decoration) must precede Task 6 (hiding the header) so no decorated-badge coverage is lost.
- **Why pin the journeys fixture instead of repointing tests:** `assertDecorationMatrix` is shared with the calendar-timeline code block (`code-blocks.e2e.ts`), which has no toolbar, so its `header-*` assertions cannot move to toolbar period buttons. The grid header stays a kept feature; only the preset hides it.
- **i18n:** `messages/en.json` is the paraglide source; run `npm run compile:i18n` after edits (Tasks 1 and 4) so `vue-tsc`/`vitest` see the new `m.*` functions. Commit the regenerated `src/i18n/paraglide` output alongside.
