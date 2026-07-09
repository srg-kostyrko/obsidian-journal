# Global Week-Number Placement Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global default for week-number column placement (`none`/`left`/`right`) that calendar blocks inherit unless they pin an explicit override.

**Architecture:** A new `calendarDisplay` settings slice holds the global default. Block configs gain a `"default"` sentinel meaning "inherit"; a pure `resolveWeekPlacement` helper plus a `useResolvedWeekPlacement` composable turn a block's stored value into a concrete placement by reading the slice. The three block wrappers (month/week view blocks, timeline code block) resolve once and pass a concrete value to the dumb renderers.

**Tech Stack:** TypeScript, Vue 3.5 SFCs (reactive-props-destructure), valibot schemas, a small DI container, paraglide i18n, Vitest (unit), WebdriverIO (e2e).

## Global Constraints

- Quality gates for every task: `npm run test`, `npm run check:types`, `npm run check:lint`. This change touches runtime, so the wdio e2e suite runs too (Task 6).
- npm scripts only (never pnpm).
- No `eslint-disable` comments; fix the code. `no-non-null-assertion` is ON in prod, OFF in tests — use `.at()` / `??` instead of `!`.
- Colocate `*.test.ts` beside the implementation. Use `expectTypeOf` (never `@ts-expect-error`) for any type assertions.
- i18n: edit `messages/en.json`, then run `npm run compile:i18n`. Never stage `src/i18n/paraglide` (git-ignored, generated).
- Do NOT test wiring (barrel shape, DI registration, module wiring) or framework behavior. Test the pure resolver and the schema, not the composable.
- Global default value is `"left"`, matching today's hard-coded default, so out-of-box appearance is unchanged.
- Commit to the current branch (`v3-ai`); never create a new branch. No `Co-Authored-By` trailer.

**Note on a spec refinement:** The spec suggested a standalone `CalendarDisplayBlock.vue` dashboard block. A dashboard block renders as its own collapsible section, which would produce a second "Calendar"-ish section for a single dropdown. This plan instead folds the global dropdown into the existing Calendar section (`CalendarWeekBlock.vue`), which the spec explicitly blessed as "easy either way." No new dashboard block or module registration for UI is needed.

---

### Task 1: Global `calendarDisplay` settings slice

**Files:**

- Create: `src/calendar/settings/display-slice.ts`
- Test: `src/calendar/settings/display-slice.test.ts`
- Modify: `src/calendar/settings/module.ts` (register the slice)
- Modify: `src/calendar/index.ts` (barrel export)

**Interfaces:**

- Produces: `calendarDisplaySlice` (a `SliceDefinition<"calendarDisplay", …>`), `calendarDisplaySliceSchema`, `type WeekPlacement = "none" | "left" | "right"`, `type CalendarDisplaySliceState`. Slice state shape: `{ weekPlacement: WeekPlacement }`, default `{ weekPlacement: "left" }`.

- [ ] **Step 1: Write the failing test**

Create `src/calendar/settings/display-slice.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarDisplaySlice, calendarDisplaySliceSchema } from "./display-slice";

describe("calendarDisplaySlice", () => {
  it("defaults weekPlacement to left", () => {
    expect(calendarDisplaySlice.defaults.weekPlacement).toBe("left");
  });

  it("fills weekPlacement from the default when the field is absent", () => {
    const parsed = v.parse(calendarDisplaySliceSchema, {});
    expect(parsed.weekPlacement).toBe("left");
  });

  it("rejects an unknown placement value", () => {
    const parsed = v.safeParse(calendarDisplaySliceSchema, { weekPlacement: "middle" });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/calendar/settings/display-slice.test.ts`
Expected: FAIL — cannot resolve `./display-slice`.

- [ ] **Step 3: Create the slice**

Create `src/calendar/settings/display-slice.ts`:

```ts
import * as v from "valibot";

import { defineSlice } from "@/settings";

export type WeekPlacement = "none" | "left" | "right";

export const calendarDisplaySliceSchema = v.object({
  weekPlacement: v.optional(v.picklist(["none", "left", "right"]), "left"),
});

export type CalendarDisplaySliceState = v.InferOutput<typeof calendarDisplaySliceSchema>;

export const calendarDisplaySlice = defineSlice<"calendarDisplay", typeof calendarDisplaySliceSchema>(
  "calendarDisplay",
  calendarDisplaySliceSchema,
  { weekPlacement: "left" },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/calendar/settings/display-slice.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the slice in the calendar settings module**

In `src/calendar/settings/module.ts`, add the import beside the existing `calendarSlice` import and register the new slice inside `register(c)`:

```ts
import { calendarDisplaySlice } from "./display-slice";
import { calendarSlice } from "./slice";
```

```ts
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice);
    c.register(SliceDefinitionToken).useValue(calendarDisplaySlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-week",
        component: CalendarWeekBlock,
        order: 10,
      }),
    );
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
```

- [ ] **Step 6: Export from the calendar barrel**

In `src/calendar/index.ts`, add after the existing `calendarSlice` export line (line 23):

```ts
export { calendarDisplaySlice, type WeekPlacement, type CalendarDisplaySliceState } from "./settings/display-slice";
```

- [ ] **Step 7: Run gates and commit**

Run: `npm run check:types && npm run check:lint && npm run test -- src/calendar/settings/display-slice.test.ts`
Expected: all PASS.

```bash
git add src/calendar/settings/display-slice.ts src/calendar/settings/display-slice.test.ts src/calendar/settings/module.ts src/calendar/index.ts
git commit -m "feat(calendar): add global week-number placement slice"
```

---

### Task 2: Placement resolver + composable

**Files:**

- Create: `src/calendar/week-placement.ts`
- Test: `src/calendar/week-placement.test.ts`
- Modify: `src/calendar/index.ts` (barrel export)

**Interfaces:**

- Consumes (from Task 1): `calendarDisplaySlice`, `type WeekPlacement`.
- Produces:
  - `type WeekPlacementConfig = WeekPlacement | "default"`
  - `resolveWeekPlacement(configWeeks: WeekPlacementConfig | undefined, globalDefault: WeekPlacement): WeekPlacement` — maps `"default"` and `undefined` to `globalDefault`, otherwise returns `configWeeks`.
  - `useResolvedWeekPlacement(getConfigWeeks: () => WeekPlacementConfig | undefined): ComputedRef<WeekPlacement>` — reads the slice and returns the resolved placement reactively.

- [ ] **Step 1: Write the failing test**

Create `src/calendar/week-placement.test.ts` (pure resolver only — the composable is DI/Vue wiring and is not unit-tested):

```ts
import { describe, expect, it } from "vitest";

import { resolveWeekPlacement } from "./week-placement";

describe("resolveWeekPlacement", () => {
  it("returns the global default when the config is 'default'", () => {
    expect(resolveWeekPlacement("default", "right")).toBe("right");
  });

  it("returns the global default when the config is undefined", () => {
    expect(resolveWeekPlacement(undefined, "right")).toBe("right");
  });

  it("returns an explicit placement unchanged", () => {
    expect(resolveWeekPlacement("left", "right")).toBe("left");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/calendar/week-placement.test.ts`
Expected: FAIL — cannot resolve `./week-placement`.

- [ ] **Step 3: Create the resolver and composable**

Create `src/calendar/week-placement.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { calendarDisplaySlice, type WeekPlacement } from "./settings/display-slice";

export type WeekPlacementConfig = WeekPlacement | "default";

export function resolveWeekPlacement(
  configWeeks: WeekPlacementConfig | undefined,
  globalDefault: WeekPlacement,
): WeekPlacement {
  return configWeeks === undefined || configWeeks === "default" ? globalDefault : configWeeks;
}

export function useResolvedWeekPlacement(
  getConfigWeeks: () => WeekPlacementConfig | undefined,
): ComputedRef<WeekPlacement> {
  const slice = useService(SettingsService).getSlice(calendarDisplaySlice);
  return computed(() => resolveWeekPlacement(getConfigWeeks(), slice.state.weekPlacement));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/calendar/week-placement.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the calendar barrel**

In `src/calendar/index.ts`, add after the Task 1 export block:

```ts
export { resolveWeekPlacement, useResolvedWeekPlacement, type WeekPlacementConfig } from "./week-placement";
```

- [ ] **Step 6: Run gates and commit**

Run: `npm run check:types && npm run check:lint && npm run test -- src/calendar/week-placement.test.ts`
Expected: all PASS.

```bash
git add src/calendar/week-placement.ts src/calendar/week-placement.test.ts src/calendar/index.ts
git commit -m "feat(calendar): resolve week placement against the global default"
```

---

### Task 3: Add the `"default"` sentinel to block config schemas

**Files:**

- Modify: `src/views/blocks/calendar-block-schema.ts:7`
- Modify: `src/views/blocks/ui/calendar-block-fields.ts:5`
- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts:31`
- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts:31`
- Modify: `src/code-blocks/timeline/timeline-config.ts:10`
- Modify: `src/views/default-view.ts` (the `month-calendar` block config `weeks` value)
- Test: `src/views/blocks/calendar-block-schema.test.ts`

**Interfaces:**

- Consumes (from Task 2): `type WeekPlacementConfig` conceptually (the union `"default" | "none" | "left" | "right"`). The schemas restate the literal union directly; do not import `WeekPlacementConfig` into valibot picklists.
- Produces: view-block `weeks` field now parses to `"default" | "none" | "left" | "right"` and defaults to `"default"`; timeline `weeks` field accepts the same union and may be omitted (`undefined`).

- [ ] **Step 1: Write the failing test**

Create `src/views/blocks/calendar-block-schema.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarBlockBaseSchema } from "./calendar-block-schema";

const schema = v.object(calendarBlockBaseSchema);

describe("calendarBlockBaseSchema weeks", () => {
  it("defaults weeks to 'default' when omitted", () => {
    const parsed = v.parse(schema, { before: 0, after: 0 });
    expect(parsed.weeks).toBe("default");
  });

  it("accepts an explicit 'right' override", () => {
    const parsed = v.parse(schema, { before: 0, after: 0, weeks: "right" });
    expect(parsed.weeks).toBe("right");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/views/blocks/calendar-block-schema.test.ts`
Expected: FAIL — `parsed.weeks` is `"left"`, not `"default"`.

- [ ] **Step 3: Update the base schema**

In `src/views/blocks/calendar-block-schema.ts`, change line 7 from:

```ts
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
```

to:

```ts
  weeks: v.optional(v.picklist(["default", "none", "left", "right"]), "default"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/views/blocks/calendar-block-schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update the hand-written fields type**

In `src/views/blocks/ui/calendar-block-fields.ts`, change line 5 from:

```ts
weeks: "none" | "left" | "right";
```

to:

```ts
weeks: "default" | "none" | "left" | "right";
```

- [ ] **Step 6: Update the two view blocks' defaultConfig**

In `src/views/blocks/month-calendar/month-calendar-block.ts`, change line 31 from:

```ts
    weeks: "left" as const,
```

to:

```ts
    weeks: "default" as const,
```

Make the identical change in `src/views/blocks/week-calendar/week-calendar-block.ts` (also line 31).

- [ ] **Step 7: Update the timeline config schema**

In `src/code-blocks/timeline/timeline-config.ts`, change line 10 from:

```ts
  weeks: v.optional(v.picklist(["none", "left", "right"] as const)),
```

to:

```ts
  weeks: v.optional(v.picklist(["default", "none", "left", "right"] as const)),
```

- [ ] **Step 8: Update the built-in default view**

In `src/views/default-view.ts`, find the `month-calendar` block config (currently `config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left", showHeading: false }`) and change `weeks: "left"` to `weeks: "default"`. Leave every other field unchanged.

- [ ] **Step 9: Run the full unit suite**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS. If a pre-existing test asserted a `weeks` default of `"left"` for a view block, update that assertion to `"default"` (the new inherit sentinel) and re-run.

- [ ] **Step 10: Commit**

```bash
git add src/views/blocks/calendar-block-schema.ts src/views/blocks/calendar-block-schema.test.ts src/views/blocks/ui/calendar-block-fields.ts src/views/blocks/month-calendar/month-calendar-block.ts src/views/blocks/week-calendar/week-calendar-block.ts src/code-blocks/timeline/timeline-config.ts src/views/default-view.ts
git commit -m "feat(blocks): add 'default' inherit sentinel to week placement config"
```

---

### Task 4: Wire resolution into the block wrappers

**Files:**

- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`
- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`
- Modify: `src/code-blocks/timeline/ui/TimelineCodeBlock.vue`

**Interfaces:**

- Consumes (from Task 2): `useResolvedWeekPlacement` from `@/calendar`.
- Produces: each wrapper passes a concrete `"none" | "left" | "right"` to `NotesMonthView` / `NotesWeekView` / the timeline mode components. Renderers are unchanged.

No new test in this task — behavior is covered end-to-end by the e2e in Task 6, and the unit-testable logic (`resolveWeekPlacement`) is already covered in Task 2. This is view wiring.

- [ ] **Step 1: Wire the month view block**

In `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`, add the import (beside the existing `usePeriodWindow` import from `@/calendar/ui`):

```ts
import { useResolvedWeekPlacement } from "@/calendar";
```

Add, in the `<script setup>` block after `const outsideDates = …`:

```ts
const weekPlacement = useResolvedWeekPlacement(() => props.config.weeks);
```

In the template, change `:weeks="config.weeks"` to:

```html
:weeks="weekPlacement"
```

- [ ] **Step 2: Wire the week view block**

In `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`, add the import:

```ts
import { useResolvedWeekPlacement } from "@/calendar";
```

Add, after `const weeks = usePeriodWindow("week", …)` (note: `weeks` here is the period window; the placement uses a distinct name):

```ts
const weekPlacement = useResolvedWeekPlacement(() => props.config.weeks);
```

In the template, change `:weeks="config.weeks"` to:

```html
:weeks="weekPlacement"
```

- [ ] **Step 3: Wire the timeline code block**

In `src/code-blocks/timeline/ui/TimelineCodeBlock.vue`, extend the existing `@/calendar` import (line 5) to include the composable:

```ts
import { Clock, useResolvedWeekPlacement, type AnchorString } from "@/calendar";
```

Add, in `<script setup>` after `const shelf = computed(…)`:

```ts
const weekPlacement = useResolvedWeekPlacement(() => config.weeks);
```

In the template, change all four `:weeks="config.weeks"` occurrences (on `TimelineWeek`, `TimelineMonth`, `TimelineQuarter`, `TimelineCalendar`) to:

```html
:weeks="weekPlacement"
```

- [ ] **Step 4: Run gates**

Run: `npm run check:types && npm run check:lint && npm run test`
Expected: all PASS. (`check:types` confirms the concrete `WeekPlacement` matches the renderer props' `"none" | "left" | "right"`.)

- [ ] **Step 5: Commit**

```bash
git add src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue src/code-blocks/timeline/ui/TimelineCodeBlock.vue
git commit -m "feat(blocks): resolve week placement in month, week, and timeline blocks"
```

---

### Task 5: Config UI — block dropdown option + global setting row + i18n

**Files:**

- Modify: `messages/en.json`
- Modify: `src/views/blocks/ui/CalendarBlockConfigFields.vue`
- Modify: `src/calendar/settings/ui/CalendarWeekBlock.vue`

**Interfaces:**

- Consumes (from Task 1): `calendarDisplaySlice`, `type WeekPlacement`.
- Produces: view-block config dropdown gains a "Use global default" option; the Calendar settings section gains a "Default week numbers" dropdown bound to the global slice.

- [ ] **Step 1: Add i18n messages**

In `messages/en.json`, add these three keys next to the existing `view_block_config_weeks_*` entries:

```json
  "view_block_config_weeks_default": "Use global default",
  "calendar_week_placement_label": "Default week numbers",
  "calendar_week_placement_description": "Where the week-number column appears in calendar blocks set to “Use global default”.",
```

- [ ] **Step 2: Compile i18n**

Run: `npm run compile:i18n`
Expected: success; `m.view_block_config_weeks_default`, `m.calendar_week_placement_label`, and `m.calendar_week_placement_description` become available. Do NOT `git add` anything under `src/i18n/paraglide`.

- [ ] **Step 3: Add the "Use global default" option to the block dropdown**

In `src/views/blocks/ui/CalendarBlockConfigFields.vue`, add a first `<option>` inside the weeks `UiDropdown` (before the `none` option, around line 59):

```html
<option value="default">{{ m.view_block_config_weeks_default() }}</option>
<option value="none">{{ m.view_block_config_weeks_none() }}</option>
<option value="left">{{ m.view_block_config_weeks_left() }}</option>
<option value="right">{{ m.view_block_config_weeks_right() }}</option>
```

(The `config.weeks` model and the `onChange` cast to `CalendarBlockFields['weeks']` already accommodate `"default"` after Task 3.)

- [ ] **Step 4: Add the global placement dropdown to the Calendar settings section**

In `src/calendar/settings/ui/CalendarWeekBlock.vue`:

Add these imports:

```ts
import UiDropdown from "@/ui/UiDropdown.vue";
```

```ts
import { calendarDisplaySlice, type WeekPlacement } from "../display-slice";
```

In `<script setup>`, after `const slice = settings.getSlice(calendarSlice);`:

```ts
const displaySlice = settings.getSlice(calendarDisplaySlice);

function setWeekPlacement(weekPlacement: WeekPlacement): void {
  displaySlice.state = { ...displaySlice.state, weekPlacement };
}
```

In the template, add a new `UiSettingRow` immediately before the closing `</UiCollapsibleBlock>` (after the "apply globally" row):

```html
<UiSettingRow :name="m.calendar_week_placement_label()">
  <template #description>{{ m.calendar_week_placement_description() }}</template>
  <UiDropdown
    :model-value="displaySlice.state.weekPlacement"
    @update:model-value="(v) => setWeekPlacement(v as WeekPlacement)"
  >
    <option value="none">{{ m.view_block_config_weeks_none() }}</option>
    <option value="left">{{ m.view_block_config_weeks_left() }}</option>
    <option value="right">{{ m.view_block_config_weeks_right() }}</option>
  </UiDropdown>
</UiSettingRow>
```

- [ ] **Step 5: Run gates**

Run: `npm run check:types && npm run check:lint && npm run test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json src/views/blocks/ui/CalendarBlockConfigFields.vue src/calendar/settings/ui/CalendarWeekBlock.vue
git commit -m "feat(settings): edit the global week-number placement default"
```

---

### Task 6: e2e — global default drives an inheriting block

**Files:**

- Modify: `e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json`
- Modify: `e2e/journeys/view-blocks.e2e.ts`

**Interfaces:**

- Consumes: the running plugin. Uses the existing `e2e-views` fixture, its `openBlocksView` / `WEEK_CALENDAR` helpers from `./view-blocks.js`, and the rendered `.notes-week-view__row[data-weeks]` attribute produced by `NotesWeekView.vue`.

**Why this proves the feature:** the fixture sets the global default to `right` (diverging from the historical `left` fallback) and the week block to `"default"` (inherit). A passing `data-weeks="right"` assertion can only happen if resolution reads the global slice — if `useResolvedWeekPlacement` were removed, `NotesWeekView` would receive the raw `"default"` string and render `data-weeks="default"`, failing the assertion.

- [ ] **Step 1: Set the fixture's global default and make its week block inherit**

Edit `e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json`:

1. Add a top-level `"calendarDisplay"` key (sibling of `"journals"` and `"views"`):

```json
  "calendarDisplay": { "weekPlacement": "right" },
```

2. In `views` → the single view → `blocks`, find the `week-calendar` block and change its config `weeks` value from `"left"` to `"default"`:

```json
{ "id": "…", "key": "week-calendar", "config": { "before": 0, "after": 0, "hiddenWeekdays": [], "weeks": "default" } }
```

Keep the block `id` and all other fields exactly as they are. Verify the file is still valid JSON:

Run: `python3 -c "import json; json.load(open('e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json'))" && echo OK`
Expected: `OK`.

- [ ] **Step 2: Write the failing e2e**

In `e2e/journeys/view-blocks.e2e.ts`, add this test inside the existing `describe("week-calendar block", …)` block (after the "renders the week grid" test, around line 31):

```ts
it("places the week-number column on the side of the global default when the block inherits", async () => {
  await openBlocksView();

  const row = $(`${WEEK_CALENDAR} .notes-week-view__row`);
  await row.waitForExist({ timeoutMsg: "week grid row did not render" });

  // Fixture: global weekPlacement = "right", block weeks = "default" (inherit).
  await expect(row).toHaveAttribute("data-weeks", "right");
});
```

The `$` and `expect` imports already exist at the top of the file; `openBlocksView` and `WEEK_CALENDAR` are already imported from `./view-blocks.js`.

- [ ] **Step 3: Run the e2e to verify it passes**

Run: `npm run test:e2e -- --spec e2e/journeys/view-blocks.e2e.ts`

(If the project's e2e invocation differs, use the documented e2e command; the spec file is `e2e/journeys/view-blocks.e2e.ts`.)

Expected: PASS, including the new test and the pre-existing week-calendar tests (the week-number cell still renders, now on the right).

- [ ] **Step 4: Sanity-check the guard (optional, recommended)**

Temporarily change the fixture's `calendarDisplay.weekPlacement` to `"left"` and re-run only the new test; it should FAIL (`data-weeks` is `"left"`, not `"right"`). Revert to `"right"` afterward. This confirms the assertion actually tracks the global default rather than a coincidental layout.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json e2e/journeys/view-blocks.e2e.ts
git commit -m "test(e2e): global week placement default drives an inheriting block"
```

---

## Self-Review

**Spec coverage:**

- Global default setting → Task 1 (slice) + Task 5 (settings UI).
- `"default"` inherit sentinel, new blocks default to it → Task 3.
- Live inheritance / resolution → Task 2 (resolver + composable) + Task 4 (wiring).
- Overridable in view-block settings → Task 5 (dropdown option).
- Overridable in timeline block config (YAML) + inherit when omitted → Task 3 (schema `"default"`) + Task 4 (timeline wiring).
- Built-in default view demonstrates inheritance → Task 3 Step 8.
- No migration / existing explicit blocks unchanged → nothing migrates; the fixture keeps other blocks' explicit values.
- Unit tests for resolver + slice default → Task 2, Task 1. e2e → Task 6.
- i18n via en.json + compile → Task 5.

**Type consistency:** `WeekPlacement` (`"none"|"left"|"right"`) defined in Task 1, imported by Task 2's resolver and Task 5's UI. `WeekPlacementConfig` (`WeekPlacement | "default"`) defined in Task 2, matches the `"default"|"none"|"left"|"right"` unions the schemas restate in Task 3. `useResolvedWeekPlacement` signature is identical across Task 2 (definition) and Task 4 (three call sites), all passing `() => …config.weeks`. Renderer props stay `"none"|"left"|"right"`; wrappers pass the resolved concrete value.

**Placeholder scan:** none — every code and command step is concrete. The only conditional is Task 3 Step 9 (update a pre-existing `"left"`-default assertion if one exists), which is a bounded, explicit instruction.
