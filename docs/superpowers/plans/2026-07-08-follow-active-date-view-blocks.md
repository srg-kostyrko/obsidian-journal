# Follow Active Date in View Blocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore v2's "calendar follows the active note" as an opt-in-per-block setting (default on) on the month-calendar, week-calendar, custom-intervals, and markdown-template blocks, using per-block local focus.

**Architecture:** A shared `useFollowActiveDate` composable owns a per-block local focus that overrides the view's shared `refDate` when the active note is an in-scope journal entry that is off-screen. Each windowed block feeds this focus into its existing period-window computation; toolbar/manual navigation still drives `refDate` and resets the local override. Visibility (“is the active note already on screen?”) is answered per block by pure helpers.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`, composables), valibot schemas, Awilix-style DI (`useService`/`inject`), Vitest + @testing-library/vue for unit/component tests, WebdriverIO for e2e, Paraglide (inlang) for i18n.

## Global Constraints

- Commands are npm scripts: `npm test`, `npm run check:types`, `npm run check:lint`. Run all three before considering a task done. e2e: `npm run test:e2e` (or the project's wdio runner) for runtime-touching changes.
- Never add `eslint-disable`; fix the code instead.
- Colocate `*.test.ts` beside implementation. Use `expectTypeOf` for type assertions (never `@ts-expect-error`).
- One behavior per test; test names are subject+verb behavior, not effect lists. Use nested `describe()` for scope, no dashes/colons in a single label.
- Vue component tests use @testing-library/vue + user-event; no CSS-class queries or test-only `data-*` attributes.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`.
- Only WHY-comments; no WHAT-comments, no spec-reference comments.
- Commit to the current branch (`v3-ai`); never create a branch. No `Co-Authored-By` trailer.
- i18n: new user-facing strings are Paraglide messages in `messages/en.json`, then `npm run compile:i18n` regenerates `src/i18n/paraglide` (committed).

---

### Task 1: `useFollowActiveDate` composable

**Files:**

- Create: `src/notes-calendar/use-follow-active-date.ts`
- Test: `src/notes-calendar/use-follow-active-date.test.ts`
- Modify: `src/notes-calendar/index.ts` (barrel export)

**Interfaces:**

- Produces:
  - `interface FollowActiveDateOptions { refDate: MaybeRefOrGetter<AnchorString>; enabled: () => boolean; inScope: (journalName: string) => boolean; isVisible: (anchor: AnchorString, focus: AnchorString) => boolean }`
  - `useFollowActiveDate(options: FollowActiveDateOptions): ComputedRef<AnchorString>`
- Consumes: `ActiveEntryViewModel` (`.active: ShallowRef<ActiveEntryRef | null>`, `ActiveEntryRef = { journalName: string; anchor: AnchorString }`) via `useService`.

- [ ] **Step 1: Write the failing test**

Create `src/notes-calendar/use-follow-active-date.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { ActiveEntryViewModel, type ActiveEntryRef } from "./active-entry";
import { FakeActiveEntryViewModel } from "./testing";
import { useFollowActiveDate, type FollowActiveDateOptions } from "./use-follow-active-date";

function mount(
  options: FollowActiveDateOptions,
  initialActive: ActiveEntryRef | null = null,
): { focus: ComputedRef<AnchorString>; active: FakeActiveEntryViewModel; unmount: () => void } {
  const container = new Container();
  const active = new FakeActiveEntryViewModel();
  active.setActive(initialActive);
  container.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  let captured: ComputedRef<AnchorString> | null = null;
  const Host = defineComponent({
    setup() {
      captured = useFollowActiveDate(options);
      return () => h("div");
    },
  });
  const utilities = render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  if (!captured) throw new Error("focus not captured");
  return { focus: captured, active, unmount: () => utilities.unmount() };
}

const A = "2026-05-15" as AnchorString;
const B = "2026-09-10" as AnchorString;
const daily = (anchor: AnchorString): ActiveEntryRef => ({ journalName: "daily", anchor });

afterEach(() => {
  // @testing-library/vue auto-cleanup runs per test; nothing extra needed.
});

describe("useFollowActiveDate", () => {
  it("recenters focus to an in-scope note that is off-window", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(B);
  });

  it("keeps focus on the reference date for an in-scope note already visible", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => true,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date for an out-of-scope note", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: (name) => name === "daily",
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(B);
    active.setActive({ journalName: "weekly", anchor: "2026-10-01" as AnchorString });
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date when the active note clears", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    active.setActive(null);
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("does not follow while disabled", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => false,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date when the reference date changes", async () => {
    const refDate = ref(A);
    const { focus, active } = mount({
      refDate,
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    refDate.value = "2026-12-01" as AnchorString;
    await nextTick();
    expect(focus.value).toBe("2026-12-01");
  });

  it("follows a note that is already active at mount", () => {
    const { focus } = mount(
      { refDate: ref(A), enabled: () => true, inScope: () => true, isVisible: () => false },
      daily(B),
    );
    expect(focus.value).toBe(B);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/notes-calendar/use-follow-active-date.test.ts`
Expected: FAIL — module `./use-follow-active-date` not found.

- [ ] **Step 3: Write the composable**

Create `src/notes-calendar/use-follow-active-date.ts`:

```ts
import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { ActiveEntryViewModel } from "./active-entry";

export interface FollowActiveDateOptions {
  readonly refDate: MaybeRefOrGetter<AnchorString>;
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly isVisible: (anchor: AnchorString, focus: AnchorString) => boolean;
}

export function useFollowActiveDate(options: FollowActiveDateOptions): ComputedRef<AnchorString> {
  const activeEntry = useService(ActiveEntryViewModel);
  const localFocus = shallowRef<AnchorString | null>(null);

  // The focus before any pending change — used both to compute the rendered window
  // and to answer the visibility check at the moment the active note changes.
  const currentFocus = (): AnchorString => (options.enabled() ? localFocus.value : null) ?? toValue(options.refDate);

  watch(
    () => toValue(options.refDate),
    () => {
      localFocus.value = null;
    },
  );

  watch(
    activeEntry.active,
    (active) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) {
        localFocus.value = null;
        return;
      }
      if (options.isVisible(active.anchor, currentFocus())) return;
      localFocus.value = active.anchor;
    },
    { immediate: true },
  );

  return computed(currentFocus);
}
```

- [ ] **Step 4: Export from the barrel**

In `src/notes-calendar/index.ts`, add:

```ts
export { useFollowActiveDate, type FollowActiveDateOptions } from "./use-follow-active-date";
```

- [ ] **Step 5: Run tests, types, lint**

Run: `npm test -- src/notes-calendar/use-follow-active-date.test.ts && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/use-follow-active-date.ts src/notes-calendar/use-follow-active-date.test.ts src/notes-calendar/index.ts
git commit -m "feat(views): add useFollowActiveDate composable"
```

---

### Task 2: Follow-visibility pure helpers

**Files:**

- Create: `src/views/blocks/ui/follow-visibility.ts`
- Test: `src/views/blocks/ui/follow-visibility.test.ts`

**Interfaces:**

- Produces:
  - `spanContains(anchor: AnchorString, start: AnchorString, end: AnchorString): boolean`
  - `monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean`
  - `weekWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean`
- Consumes: `CalendarDate`, `periodOfKind`, `window` from `@/calendar`.

- [ ] **Step 1: Write the failing test**

Create `src/views/blocks/ui/follow-visibility.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";

import { monthWindowContains, spanContains, weekWindowContains } from "./follow-visibility";

const a = (s: string): AnchorString => s as AnchorString;

beforeAll(() => {
  installTestCalendar();
});

describe("spanContains", () => {
  it("includes a date on the start boundary", () => {
    expect(spanContains(a("2026-05-01"), a("2026-05-01"), a("2026-05-31"))).toBe(true);
  });

  it("excludes a date after the end boundary", () => {
    expect(spanContains(a("2026-06-01"), a("2026-05-01"), a("2026-05-31"))).toBe(false);
  });
});

describe("monthWindowContains", () => {
  it("includes a day inside the single focus month", () => {
    expect(monthWindowContains(a("2026-05-20"), a("2026-05-15"), 0, 0)).toBe(true);
  });

  it("excludes a day in a month outside the window", () => {
    expect(monthWindowContains(a("2026-09-10"), a("2026-05-15"), 0, 0)).toBe(false);
  });

  it("includes a spillover day from an adjacent month shown in the grid", () => {
    // The May 2026 grid renders the trailing days of April in its first week.
    expect(monthWindowContains(a("2026-04-30"), a("2026-05-15"), 0, 0)).toBe(true);
  });
});

describe("weekWindowContains", () => {
  it("includes a day inside the focus week", () => {
    expect(weekWindowContains(a("2026-05-15"), a("2026-05-15"), 0, 0)).toBe(true);
  });

  it("excludes a day two weeks away with no padding", () => {
    expect(weekWindowContains(a("2026-05-29"), a("2026-05-15"), 0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/views/blocks/ui/follow-visibility.test.ts`
Expected: FAIL — module `./follow-visibility` not found.

- [ ] **Step 3: Write the helpers**

Create `src/views/blocks/ui/follow-visibility.ts`:

```ts
import { CalendarDate, periodOfKind, window as periodWindow } from "@/calendar";
import type { AnchorString, MonthPeriod, WeekPeriod } from "@/calendar";

export function spanContains(anchor: AnchorString, start: AnchorString, end: AnchorString): boolean {
  const date = CalendarDate.fromAnchor(anchor);
  return !date.isBefore(CalendarDate.fromAnchor(start)) && !date.isAfter(CalendarDate.fromAnchor(end));
}

export function monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusMonth = periodOfKind("month", CalendarDate.fromAnchor(focus)) as MonthPeriod;
  const months = periodWindow(focusMonth, before, after);
  // Expand to full weeks so the check matches the grid's spillover days, mirroring v2.
  const gridStart = periodOfKind("week", months[0]!.start).start;
  const gridEnd = periodOfKind("week", months[months.length - 1]!.end).end;
  return spanContains(anchor, gridStart.toAnchor(), gridEnd.toAnchor());
}

export function weekWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusWeek = periodOfKind("week", CalendarDate.fromAnchor(focus)) as WeekPeriod;
  const weeks = periodWindow(focusWeek, before, after);
  return spanContains(anchor, weeks[0]!.start.toAnchor(), weeks[weeks.length - 1]!.end.toAnchor());
}
```

- [ ] **Step 4: Run tests, types, lint**

Run: `npm test -- src/views/blocks/ui/follow-visibility.test.ts && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/blocks/ui/follow-visibility.ts src/views/blocks/ui/follow-visibility.test.ts
git commit -m "feat(views): add follow-visibility window helpers"
```

---

### Task 3: Shared calendar follow setting (schema + config UI + i18n)

**Files:**

- Modify: `src/views/blocks/calendar-block-schema.ts` (add optional field)
- Modify: `src/views/blocks/ui/calendar-block-fields.ts` (add `followActiveDate?` to `CalendarBlockFields`)
- Modify: `src/views/blocks/ui/CalendarBlockConfigFields.vue` (add toggle row)
- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts` (defaultConfig)
- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts` (defaultConfig)
- Modify: `messages/en.json` (new message)
- Test: `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts` (toggle behavior)

**Interfaces:**

- Produces: `calendarBlockBaseSchema.followActiveDate` (valibot optional boolean); `CalendarBlockFields.followActiveDate?: boolean`; `m.view_block_config_follow_active_date_label()`.

- [ ] **Step 1: Add the schema field**

In `src/views/blocks/calendar-block-schema.ts`, add to the object:

```ts
export const calendarBlockBaseSchema = {
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
  followActiveDate: v.optional(v.boolean()),
};
```

Note: no default value — the inferred output keeps `followActiveDate?: boolean` optional so existing typed configs still compile; the on-by-default is applied at read sites with `?? true`.

- [ ] **Step 2: Add the field to the shared fields type**

In `src/views/blocks/ui/calendar-block-fields.ts`:

```ts
export interface CalendarBlockFields {
  before: number;
  after: number;
  hiddenWeekdays: number[];
  weeks: "none" | "left" | "right";
  followActiveDate?: boolean;
}
```

- [ ] **Step 3: Add the i18n message**

In `messages/en.json`, add (next to the other `view_block_config_*` keys, e.g. after `view_block_config_weeks_right`):

```json
  "view_block_config_follow_active_date_label": "Follow active note",
```

- [ ] **Step 4: Regenerate Paraglide output**

Run: `npm run compile:i18n`
Expected: `src/i18n/paraglide` updates to include the new message accessor.

- [ ] **Step 5: Add the toggle row to the shared fields component**

In `src/views/blocks/ui/CalendarBlockConfigFields.vue`, import `UiToggle` and add a row as the FIRST `UiSettingRow` in the template (keep the per-block `showHeading` toggle last so existing config tests that click the last checkbox still target it):

Script additions:

```ts
import UiToggle from "@/ui/UiToggle.vue";
```

Template — insert at the top of the `<template>`, before the `before` row:

```html
<UiSettingRow>
  <template #name>{{ m.view_block_config_follow_active_date_label() }}</template>
  <UiToggle
    :model-value="config.followActiveDate ?? true"
    @update:model-value="(value: boolean | undefined) => onChange({ followActiveDate: value ?? false })"
  />
</UiSettingRow>
```

- [ ] **Step 6: Set the default in both block definitions**

In `src/views/blocks/month-calendar/month-calendar-block.ts`, update `defaultConfig`:

```ts
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true, followActiveDate: true },
```

In `src/views/blocks/week-calendar/week-calendar-block.ts`, update `defaultConfig`:

```ts
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true, followActiveDate: true },
```

- [ ] **Step 7: Write the failing toggle test**

Append to `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts` a new test inside the existing `describe("MonthCalendarBlockConfig", ...)`:

```ts
it("emits onChange turning follow off when the follow toggle is switched off", async () => {
  const onChange = vi.fn();
  mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
  const checkboxes = screen.getAllByRole("checkbox");
  await userEvent.click(checkboxes[0]!);
  expect(onChange).toHaveBeenCalledWith({
    before: 0,
    after: 0,
    hiddenWeekdays: [],
    weeks: "left",
    showHeading: true,
    followActiveDate: false,
  });
});
```

Note: the follow toggle is the first checkbox (defaults to checked because `config.followActiveDate ?? true`); clicking it emits `followActiveDate: false`.

- [ ] **Step 8: Run the test to verify it fails, then passes after Steps 1–6**

Run: `npm test -- src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts`
Expected: the new test PASSES (Steps 1–6 already implemented); the pre-existing `showHeading` test still PASSES (it clicks the last checkbox).

- [ ] **Step 9: Run full checks**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS. (No runtime follow yet — blocks still read `refDate`; this task only adds the setting surface.)

- [ ] **Step 10: Commit**

```bash
git add src/views/blocks/calendar-block-schema.ts src/views/blocks/ui/calendar-block-fields.ts src/views/blocks/ui/CalendarBlockConfigFields.vue src/views/blocks/month-calendar/month-calendar-block.ts src/views/blocks/week-calendar/week-calendar-block.ts src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts messages/en.json src/i18n/paraglide
git commit -m "feat(views): add follow-active-date setting to calendar blocks"
```

---

### Task 4: Wire the month-calendar block to follow

**Files:**

- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`
- Test: `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts` (rewrite to provide DI + follow tests)

**Interfaces:**

- Consumes: `useFollowActiveDate` (Task 1), `monthWindowContains` (Task 2), `useShelfScope` (`scope.fixed`), `usePeriodWindow`.

- [ ] **Step 1: Rewrite the block test to provide DI and assert follow**

The block now resolves services (`useShelfScope`, `useFollowActiveDate`), so it needs an injector. Replace the whole contents of `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts` with:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";

import { provideViewContext, type ViewContext } from "../../view-context";
import { provideViewContextStub } from "../../testing";
import { monthCalendarBlock, type MonthCalendarConfig } from "./month-calendar-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/notes-calendar/ui/NotesMonthView.vue", () => ({
  default: defineComponent({
    props: { month: { type: Object, required: true }, shelf: { type: [String, null], default: null } },
    setup: (p) => {
      interface MonthLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "month-stub",
          "data-month": (p.month as unknown as MonthLike).start.toAnchor(),
          "data-shelf": p.shelf ?? "",
        });
    },
  }),
}));

const FIXED: { names: readonly string[] } = { names: [] };
vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => FIXED.names),
    fixed: computed<readonly string[]>(() => FIXED.names),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed<readonly string[]>(() => []),
  }),
}));

const ACTIVE = ref<ActiveEntryRef | null>(null);

function mountBlock(config: MonthCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(monthCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const baseConfig: MonthCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: true,
  followActiveDate: true,
};

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  FIXED.names = [];
  ACTIVE.value = null;
});

describe("MonthCalendarBlock", () => {
  it("renders a single NotesMonthView when before=0 and after=0", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesMonthView instances", () => {
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub").length).toBe(3);
  });

  it("anchors the first NotesMonthView at refDate shifted back by before months", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 2 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
  });

  it("passes the current shelf to each NotesMonthView", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(getAllByTestId("month-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("recenters to the active note's month when it is off-window and following", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-09-01");
  });

  it("stays on the reference month when following is off", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, followActiveDate: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
  });

  it("stays on the reference window when the active note's month is already visible", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-05-02" as AnchorString };
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  it("returns to the reference month when the active note becomes out of scope", async () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-09-01");
    ACTIVE.value = { journalName: "weekly", anchor: "2026-11-01" as AnchorString };
    await nextTick();
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`
Expected: FAIL — the follow tests fail because the block still centers on `refDate`.

- [ ] **Step 3: Wire the block**

Replace the `<script setup>` of `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue` with:

```ts
import { usePeriodWindow } from "@/calendar/ui";
import { useFollowActiveDate } from "@/notes-calendar/use-follow-active-date";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { monthWindowContains } from "../../ui/follow-visibility";
import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { MonthCalendarConfig } from "../month-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: MonthCalendarConfig;
}>();

const viewContext = useViewContext();
const scope = useShelfScope(() => viewContext.shelf.value);

const focus = useFollowActiveDate({
  refDate: viewContext.refDate,
  enabled: () => props.config.followActiveDate ?? true,
  inScope: (name) => scope.fixed.value.includes(name),
  isVisible: (anchor, focusAnchor) => monthWindowContains(anchor, focusAnchor, props.config.before, props.config.after),
});

const months = usePeriodWindow(
  "month",
  focus,
  () => props.config.before,
  () => props.config.after,
);
```

The `<template>` and `<style>` are unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue src/views/blocks/month-calendar/MonthCalendarBlock.test.ts
git commit -m "feat(views): month calendar follows the active note"
```

---

### Task 5: Wire the week-calendar block to follow

**Files:**

- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`
- Test: `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts` (rewrite to provide DI + follow tests)

**Interfaces:**

- Consumes: `useFollowActiveDate` (Task 1), `weekWindowContains` (Task 2), `useShelfScope` (`scope.fixed`), `usePeriodWindow`.

- [ ] **Step 1: Rewrite the block test to provide DI and assert follow**

Replace the whole contents of `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts` with:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";

import { provideViewContext, type ViewContext } from "../../view-context";
import { provideViewContextStub } from "../../testing";
import { weekCalendarBlock, type WeekCalendarConfig } from "./week-calendar-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/notes-calendar/ui/NotesWeekView.vue", () => ({
  default: defineComponent({
    props: { week: { type: Object, required: true }, shelf: { type: [String, null], default: null } },
    setup: (p) => {
      interface WeekLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "week-stub",
          "data-week": (p.week as unknown as WeekLike).start.toAnchor(),
          "data-shelf": p.shelf ?? "",
        });
    },
  }),
}));

const FIXED: { names: readonly string[] } = { names: [] };
vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => FIXED.names),
    fixed: computed<readonly string[]>(() => FIXED.names),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed<readonly string[]>(() => []),
  }),
}));

const ACTIVE = ref<ActiveEntryRef | null>(null);

function mountBlock(config: WeekCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(weekCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const baseConfig: WeekCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: true,
  followActiveDate: true,
};

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  FIXED.names = [];
  ACTIVE.value = null;
});

describe("WeekCalendarBlock", () => {
  it("renders a single NotesWeekView when before=0 and after=0", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("week-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesWeekView instances", () => {
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("week-stub").length).toBe(3);
  });

  it("passes the current shelf to each NotesWeekView", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(getAllByTestId("week-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("recenters to the active note's week when it is off-window and following", () => {
    FIXED.names = ["daily"];
    const target = "2026-09-10" as AnchorString;
    ACTIVE.value = { journalName: "daily", anchor: target };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const focusWeekAnchor = getAllByTestId("week-stub")[0]?.dataset.week ?? "";
    // The single rendered week must be the one containing the active note, not May's week.
    expect(focusWeekAnchor <= "2026-09-10" && "2026-09-10" <= addSixDays(focusWeekAnchor)).toBe(true);
  });

  it("stays on the reference week when following is off", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const off = mountBlock({ ...baseConfig, followActiveDate: false }, { refDate: ref("2026-05-15" as AnchorString) });
    const followed = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const offWeek = off.getAllByTestId("week-stub")[0]?.dataset.week;
    const followedWeek = followed.getAllByTestId("week-stub")[0]?.dataset.week;
    expect(offWeek).not.toBe(followedWeek);
  });

  it("returns to the reference week when the active note clears", async () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const followedWeek = getAllByTestId("week-stub")[0]?.dataset.week;
    ACTIVE.value = null;
    await nextTick();
    const resetWeek = getAllByTestId("week-stub")[0]?.dataset.week;
    expect(resetWeek).not.toBe(followedWeek);
  });
});

function addSixDays(anchor: string): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}
```

Note: the week grid's start-of-week depends on `installTestCalendar`'s locale seed, so the follow test asserts the rendered week _contains_ the active anchor rather than hard-coding the week-start anchor.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`
Expected: FAIL — follow tests fail while the block centers on `refDate`.

- [ ] **Step 3: Wire the block**

Replace the `<script setup>` of `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue` with:

```ts
import { usePeriodWindow } from "@/calendar/ui";
import { useFollowActiveDate } from "@/notes-calendar/use-follow-active-date";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import NotesWeekView from "@/notes-calendar/ui/NotesWeekView.vue";

import { weekWindowContains } from "../../ui/follow-visibility";
import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { WeekCalendarConfig } from "../week-calendar-block";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: WeekCalendarConfig;
}>();

const viewContext = useViewContext();
const scope = useShelfScope(() => viewContext.shelf.value);

const focus = useFollowActiveDate({
  refDate: viewContext.refDate,
  enabled: () => props.config.followActiveDate ?? true,
  inScope: (name) => scope.fixed.value.includes(name),
  isVisible: (anchor, focusAnchor) => weekWindowContains(anchor, focusAnchor, props.config.before, props.config.after),
});

const weeks = usePeriodWindow(
  "week",
  focus,
  () => props.config.before,
  () => props.config.after,
);
```

The `<template>` and `<style>` are unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue src/views/blocks/week-calendar/WeekCalendarBlock.test.ts
git commit -m "feat(views): week calendar follows the active note"
```

---

### Task 6: Wire the custom-intervals block to follow

**Files:**

- Modify: `src/views/blocks/custom-intervals/custom-intervals-block.ts` (schema + defaultConfig)
- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue` (focus wiring)
- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue` (toggle)
- Test: `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts` (add follow test)

**Interfaces:**

- Consumes: `useFollowActiveDate` (Task 1), `spanContains` (Task 2), `resolveWindow`.

- [ ] **Step 1: Add the schema field + default**

In `src/views/blocks/custom-intervals/custom-intervals-block.ts`, add to the `v.object({...})`:

```ts
  hideEmpty: v.boolean(),
  followActiveDate: v.optional(v.boolean()),
```

And update `defaultConfig`:

```ts
  defaultConfig: { window: "month", hideEmpty: true, followActiveDate: true },
```

- [ ] **Step 2: Write the failing follow test**

Append to `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`, inside `describe("CustomIntervalsBlock", ...)`:

```ts
it("recenters the window to the active note's interval when it is off-window and following", () => {
  SCOPE.custom = ["foo"];
  JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
  ACTIVE.value = { journalName: "foo", anchor: "2027-03-05" as AnchorString };
  const { container } = mountBlock(
    { window: "year", hideEmpty: true, followActiveDate: true },
    { refDate: ref("2026-05-15" as AnchorString) },
  );
  const anchors = [...container.querySelectorAll<HTMLElement>("[data-anchor]")].map((el) => el.dataset.anchor ?? "");
  expect(anchors.every((anchor) => anchor.startsWith("2027"))).toBe(true);
  expect(anchors).toContain("2027-03-05");
});

it("keeps the window on the reference date when following is off", () => {
  SCOPE.custom = ["foo"];
  JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
  ACTIVE.value = { journalName: "foo", anchor: "2027-03-05" as AnchorString };
  const { container } = mountBlock(
    { window: "year", hideEmpty: true, followActiveDate: false },
    { refDate: ref("2026-05-15" as AnchorString) },
  );
  const anchors = [...container.querySelectorAll<HTMLElement>("[data-anchor]")].map((el) => el.dataset.anchor ?? "");
  expect(anchors.every((anchor) => anchor.startsWith("2026"))).toBe(true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`
Expected: FAIL — the block still resolves its window from `context.refDate`.

- [ ] **Step 4: Wire the block**

In `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue`, add two imports (the file already imports `ActiveEntryViewModel` from `@/notes-calendar/active-entry`; leave that line as-is):

```ts
import { useFollowActiveDate } from "@/notes-calendar/use-follow-active-date";
import { spanContains } from "../../ui/follow-visibility";
```

Extract the displayed-journals list and replace the `window` computed. Find:

```ts
const window = computed(() => resolveWindow(props.config.window, context.refDate.value));
```

Replace with:

```ts
const displayedJournals = computed(() => {
  const filter = props.config.journals;
  return scope.custom.value.filter((name) => !filter || filter.includes(name));
});

const focus = useFollowActiveDate({
  refDate: context.refDate,
  enabled: () => props.config.followActiveDate ?? true,
  inScope: (name) => displayedJournals.value.includes(name),
  isVisible: (anchor, focusAnchor) => {
    const w = resolveWindow(props.config.window, focusAnchor);
    return spanContains(anchor, w.start, w.end);
  },
});

const window = computed(() => resolveWindow(props.config.window, focus.value));
```

Then simplify the `sections` computed to reuse `displayedJournals`. Find:

```ts
const filter = props.config.journals;
const candidates = scope.custom.value.filter((name) => !filter || filter.includes(name));
```

Replace with:

```ts
const candidates = displayedJournals.value;
```

- [ ] **Step 5: Add the config toggle**

In `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue`, add a follow row after the existing `hideEmpty` `UiSettingRow` (this file already imports `UiToggle`, `UiSettingRow`, and defines `update`):

```html
<UiSettingRow>
  <template #name>{{ m.view_block_config_follow_active_date_label() }}</template>
  <UiToggle
    :model-value="config.followActiveDate ?? true"
    @update:model-value="(value: boolean | undefined) => update({ followActiveDate: value ?? false })"
  />
</UiSettingRow>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`
Expected: PASS. The pre-existing custom-intervals tests (ACTIVE null or in-window) still PASS because a null/visible active note leaves focus on `refDate`.

- [ ] **Step 7: Run full checks**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/blocks/custom-intervals/custom-intervals-block.ts src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts
git commit -m "feat(views): custom intervals block follows the active note"
```

---

### Task 7: Gate the markdown-template block's follow behind the setting

**Files:**

- Modify: `src/views/blocks/markdown-template/markdown-template-block.ts` (schema + defaultConfig)
- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.vue` (gate focus)
- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue` (toggle)
- Test: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts` (add off-follow test)

**Interfaces:**

- Consumes: existing `ActiveEntryViewModel`, `viewContext.refDate`. Degenerate follow (no window): focus = active anchor when enabled, else refDate.

- [ ] **Step 1: Add the schema field + default**

In `src/views/blocks/markdown-template/markdown-template-block.ts`:

```ts
const schema = v.object({ templatePath: v.optional(v.string(), ""), followActiveDate: v.optional(v.boolean()) });
```

And:

```ts
  defaultConfig: { templatePath: "", followActiveDate: true },
```

- [ ] **Step 2: Write the failing test**

Append to `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts`, inside `describe("MarkdownTemplateBlock", ...)`:

```ts
it("uses the reference date for {{date}} when following is disabled", async () => {
  seedAndMount(
    { "templates/today.md": "Today is {{date}}" },
    { templatePath: "templates/today.md", followActiveDate: false },
    "2026-05-15" as AnchorString,
    { journalName: "daily", anchor: "2026-03-09" as AnchorString },
  );
  expect(await screen.findByText("Today is 2026-05-15")).toBeTruthy();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts`
Expected: FAIL — the block always uses the active anchor, so it renders `2026-03-09`.

- [ ] **Step 4: Gate the focus**

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.vue`, replace the focus line inside the `rendered` computed. Find:

```ts
const focus = CalendarDate.fromAnchor(activeEntry.active.value?.anchor ?? viewContext.refDate.value);
```

Replace with:

```ts
const followed = (props.config.followActiveDate ?? true) ? activeEntry.active.value?.anchor : undefined;
const focus = CalendarDate.fromAnchor(followed ?? viewContext.refDate.value);
```

- [ ] **Step 5: Add the config toggle**

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`, add the `UiToggle` import (the file imports `UiSettingRow` and defines `update`, but does NOT import `UiToggle`):

```ts
import UiToggle from "@/ui/UiToggle.vue";
```

Then add a follow row after the existing template-path `UiSettingRow`:

```html
<UiSettingRow>
  <template #name>{{ m.view_block_config_follow_active_date_label() }}</template>
  <UiToggle
    :model-value="config.followActiveDate ?? true"
    @update:model-value="(value: boolean | undefined) => update({ followActiveDate: value ?? false })"
  />
</UiSettingRow>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts`
Expected: PASS. Existing tests (default config, follow on) still PASS because `followActiveDate ?? true` keeps following on when the key is absent.

- [ ] **Step 7: Run full checks**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/blocks/markdown-template/markdown-template-block.ts src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.vue src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts
git commit -m "feat(views): gate markdown-template follow behind the setting"
```

---

### Task 8: End-to-end — calendar recenters on the active note

**Files:**

- Modify: `src/i18n/paraglide` is already built (Task 3). No fixture change: the e2e-views Blocks view's week-calendar block omits `followActiveDate`, so `?? true` makes it follow by default.
- Test: `e2e/journeys/view-blocks.e2e.ts` (add a follow describe)

**Interfaces:**

- Consumes e2e helpers: `openBlocksView`, `weekCalendar`, `WEEK_CALENDAR` from `./view-blocks.js`; `seedNote`, `openNote`, `waitForJournalFrontmatter` from `../support/vault.js`.

- [ ] **Step 1: Write the e2e test**

Add to `e2e/journeys/view-blocks.e2e.ts`, inside the top-level `describe("blocks view", ...)`:

```ts
describe("week-calendar follow", () => {
  it("recenters to the week of a journal note opened outside the current week", async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
    await openBlocksView();

    // A day well outside the current (today's) week; the week block renders only the
    // focus week (before/after = 0), so a passing assertion means the block moved.
    const far = "2026-09-14";
    const path = `day/${far}.md`;
    await seedNote(path, `---\njournal: daily\njournal-date: ${far}\n---\n`);
    await waitForJournalFrontmatter(path, { journal: "daily", date: far });

    await openNote(path);

    await weekCalendar.waitForActive(far);
    await expect(weekCalendar.cell(far)).toBeExisting();
  });
});
```

Add `openNote`, `seedNote`, `waitForJournalFrontmatter` to the existing import from `../support/vault.js` (the file already imports `seedNote` and `waitForJournalFrontmatter`; add `openNote`).

- [ ] **Step 2: Run the e2e test**

Run: `npm run test:e2e -- --spec e2e/journeys/view-blocks.e2e.ts`
(Use the repo's actual wdio invocation; consult `package.json` scripts.)
Expected: PASS — `waitForActive(far)` resolves, proving the week block recentered to September and highlighted the opened note.

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/view-blocks.e2e.ts
git commit -m "test(views): e2e for calendar follow-active-note recenter"
```

---

## Final verification

- [ ] Run the whole suite: `npm test && npm run check:types && npm run check:lint`
- [ ] Run the affected e2e journey: `npm run test:e2e -- --spec e2e/journeys/view-blocks.e2e.ts`
- [ ] Confirm the existing markdown-template e2e (`resolves {{date}} to the active note's date`) still passes — it exercises follow-on for the template block.
