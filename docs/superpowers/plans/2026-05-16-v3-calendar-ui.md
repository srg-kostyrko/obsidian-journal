# v3 Calendar UI (Date Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's date-picker family to v3 as a Period-aware, locale-stable `DatePicker` living in `src/calendar/ui/`, and migrate the four current journal-settings call sites off raw `UiTextInput`.

**Architecture:** A `DatePicker` trigger button opens a `DatePickerModal` that descends from `Decade → Year/Quarter → Month/Week/Day` views toward the picking-target view determined by the `picking` prop. Each view is a thin presentational shell over a shared `useCalendarGrid` composable that consumes `Period` iterators (`MonthPeriod.weeks()`, `YearPeriod.months()`, etc.) and emits typed cells. The picker v-models `Period | null`; a `useAnchorField` composable on the journal-storage side bridges to `AnchorString`. Date math goes through `CalendarDate` / `Period` / `OpenInterval` — no `moment` imports in `src/calendar/ui/**`.

**Tech Stack:** Vue 3 SFC + `<script setup>`, `defineModel`, vee-validate (callers only), `@testing-library/vue`, `@testing-library/user-event`, valibot, vitest, ts-pattern, paraglide i18n, the v3 DI container (`useService`), the v3 modals foundation (`defineModal`, `useModal`, `useModalService`, `AsyncResult<TResult, ModalCancelled>`).

**Reference spec:** [`docs/superpowers/specs/2026-05-16-v3-calendar-ui-design.md`](../specs/2026-05-16-v3-calendar-ui-design.md).

**Spec corrections discovered during planning** (apply inline as you implement):

1. `YearPeriod.quarters()` already exists in `src/calendar/period-year.ts` — the spec's "Calendar-layer addition #1" is already done. Skip; Task 22 fixes the spec.
2. The spec mentions `useCalendar()` / `useClock()` composables. The project's actual pattern is `useService(Calendar)` (Calendar is a DI service) and `CalendarDate.today()` (static; no Clock DI service exists). Plan uses the actual pattern throughout.

**Quality gates** (per `feedback_quality_gates` and `feedback_test_commands`):

- Per-task: `npm run test`, `npm run check:types`, `npm run check:lint` — all green before commit.
- Per push: full `npm run test:e2e` runs in CI.

---

### Task 1: Add `OpenInterval.overlapsPeriod(p: Period): boolean`

**Files:**

- Modify: `src/calendar/open-interval.ts`
- Test: `src/calendar/open-interval.test.ts`

- [ ] **Step 1: Write failing tests**

Append at the bottom of `src/calendar/open-interval.test.ts`, inside the existing top-level `describe("OpenInterval", () => { ... })` block:

```ts
describe("overlapsPeriod", () => {
  it("returns true when the period and interval share a day (both bounds)", () => {
    const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
    expectOk(result);

    expect(result.value.overlapsPeriod(MonthPeriod.containing(date("2025-03-15")))).toBe(true);
  });

  it("returns false when the period is entirely before the interval", () => {
    const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
    expectOk(result);

    expect(result.value.overlapsPeriod(MonthPeriod.containing(date("2025-01-15")))).toBe(false);
  });

  it("returns false when the period is entirely after the interval", () => {
    const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
    expectOk(result);

    expect(result.value.overlapsPeriod(MonthPeriod.containing(date("2025-06-15")))).toBe(false);
  });

  it("returns true for any period at or after start when end is unbounded", () => {
    expect(OpenInterval.from(date("2025-03-10")).overlapsPeriod(MonthPeriod.containing(date("2025-06-15")))).toBe(true);
  });

  it("returns false for a period entirely before an unbounded-end interval", () => {
    expect(OpenInterval.from(date("2025-03-10")).overlapsPeriod(MonthPeriod.containing(date("2025-01-15")))).toBe(
      false,
    );
  });

  it("returns true for any period at or before end when start is unbounded", () => {
    expect(OpenInterval.until(date("2025-03-10")).overlapsPeriod(MonthPeriod.containing(date("2025-01-15")))).toBe(
      true,
    );
  });

  it("returns false for a period entirely after an unbounded-start interval", () => {
    expect(OpenInterval.until(date("2025-03-10")).overlapsPeriod(MonthPeriod.containing(date("2025-06-15")))).toBe(
      false,
    );
  });
});
```

Add the `MonthPeriod` import at the top of the file:

```ts
import { MonthPeriod } from "./period-month";
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/open-interval.test.ts
```

Expected: 7 new failures with `result.value.overlapsPeriod is not a function`.

- [ ] **Step 3: Implement `overlapsPeriod`**

In `src/calendar/open-interval.ts`, add an import and method:

```ts
import type { Period } from "./period";
```

Inside the class, after `contains(d)`:

```ts
  overlapsPeriod(p: Period): boolean {
    const startOk = this.end.match({
      some: (endDate) => !p.start.isAfter(endDate),
      none: () => true,
    });
    const endOk = this.start.match({
      some: (s) => !p.end.isBefore(s),
      none: () => true,
    });
    return startOk && endOk;
  }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/open-interval.test.ts && npm run check:types && npm run check:lint
```

Expected: PASS, no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/open-interval.ts src/calendar/open-interval.test.ts
git commit -m "feat(calendar): OpenInterval.overlapsPeriod for range-aware bound checks"
```

---

### Task 2: Add `DatePickerInvariantError` in calendar UI errors module

**Files:**

- Create: `src/calendar/ui/errors.ts`

- [ ] **Step 1: Create the errors module**

```ts
// src/calendar/ui/errors.ts
import type { PeriodKind } from "@/calendar";

export type View = "month" | "week" | "quarter" | "year" | "decade";
export type Picking = "day" | "week" | "month" | "quarter" | "year";

export class DatePickerInvariantError extends Error {
  readonly currentView: View;
  readonly picking: Picking;
  readonly cellKind: PeriodKind;

  constructor(view: View, picking: Picking, cellKind: PeriodKind) {
    super(`unreachable descent: view=${view} picking=${picking} cell=${cellKind}`);
    this.name = "DatePickerInvariantError";
    this.currentView = view;
    this.picking = picking;
    this.cellKind = cellKind;
  }
}
```

No tests — per `feedback_no_trivial_tests` we do not test `instanceof` for tiny error subclasses. The error is exercised through the modal descent test (Task 11).

- [ ] **Step 2: Verify the module compiles**

```bash
npm run check:types
```

Expected: PASS (no usages yet, but the file should still typecheck).

- [ ] **Step 3: Commit**

```bash
git add src/calendar/ui/errors.ts
git commit -m "feat(calendar-ui): DatePickerInvariantError and shared View/Picking types"
```

---

### Task 3: Create `useCalendarGrid` composable

**Files:**

- Create: `src/calendar/ui/use-calendar-grid.ts`
- Test: `src/calendar/ui/use-calendar-grid.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/use-calendar-grid.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { CalendarDate, DayPeriod, MonthPeriod, OpenInterval, YearPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import { useCalendarGrid } from "./use-calendar-grid";

describe("useCalendarGrid", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function monthCells(refDate: CalendarDate): readonly DayPeriod[] {
    const m = MonthPeriod.containing(refDate);
    const cells: DayPeriod[] = [];
    for (const week of m.weeks()) {
      for (const day of week.days()) cells.push(DayPeriod.containing(day));
    }
    return cells;
  }

  describe("isSelected", () => {
    it("marks the cell whose period matches the selection of the same kind", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: DayPeriod.containing(date("2025-03-15")),
        today: date("2099-01-01"),
      });

      expect(cells.value.find((c) => c.isSelected)?.period.start.toAnchor()).toBe("2025-03-15");
    });

    it("does not mark any cell when the selection is a different period kind", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: YearPeriod.containing(date("2025-03-15")),
        today: date("2099-01-01"),
      });

      expect(cells.value.some((c) => c.isSelected)).toBe(false);
    });
  });

  describe("isDisabled", () => {
    it("disables a cell whose period falls entirely outside the bounds", () => {
      const bounds = OpenInterval.from(date("2025-03-10"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        bounds,
      });

      expect(cells.value.find((c) => c.period.start.toAnchor() === "2025-03-05")?.isDisabled).toBe(true);
    });

    it("does not disable a cell whose period overlaps the bounds", () => {
      const bounds = OpenInterval.from(date("2025-03-10"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        bounds,
      });

      expect(cells.value.find((c) => c.period.start.toAnchor() === "2025-03-15")?.isDisabled).toBe(false);
    });
  });

  describe("isOutside", () => {
    it("marks a cell as outside when the predicate returns true", () => {
      const outer = MonthPeriod.containing(date("2025-03-15"));
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
        outsidePredicate: (p) => !outer.contains(p.start),
      });

      const someOutside = cells.value.some((c) => c.isOutside);
      expect(someOutside).toBe(true);
    });

    it("leaves cells unmarked when no predicate is given", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
      });

      expect(cells.value.every((c) => c.isOutside === false)).toBe(true);
    });
  });

  describe("isToday", () => {
    it("marks the cell whose period contains today", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2025-03-12"),
      });

      expect(cells.value.find((c) => c.isToday)?.period.start.toAnchor()).toBe("2025-03-12");
    });
  });

  describe("label", () => {
    it("formats each cell using the supplied pattern", () => {
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected: null,
        today: date("2099-01-01"),
      });

      const inMonth = cells.value.find((c) => c.period.start.toAnchor() === "2025-03-15");
      expect(inMonth?.label).toBe("15");
    });
  });

  describe("reactivity", () => {
    it("recomputes when the selected ref changes", () => {
      const selected = ref<DayPeriod | null>(null);
      const cells = useCalendarGrid({
        cells: monthCells(date("2025-03-15")),
        formatPattern: "D",
        selected,
        today: date("2099-01-01"),
      });

      expect(cells.value.some((c) => c.isSelected)).toBe(false);

      selected.value = DayPeriod.containing(date("2025-03-15"));
      expect(cells.value.find((c) => c.isSelected)?.period.start.toAnchor()).toBe("2025-03-15");
    });
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/use-calendar-grid.test.ts
```

Expected: module-not-found / import errors.

- [ ] **Step 3: Implement the composable**

```ts
// src/calendar/ui/use-calendar-grid.ts
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { CalendarDate, OpenInterval, Period } from "@/calendar";

export interface Cell {
  readonly period: Period;
  readonly label: string;
  readonly key: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isOutside: boolean;
  readonly isToday: boolean;
}

export interface UseCalendarGridOptions {
  cells: MaybeRefOrGetter<readonly Period[]>;
  formatPattern: string;
  selected: MaybeRefOrGetter<Period | null>;
  today: MaybeRefOrGetter<CalendarDate>;
  bounds?: MaybeRefOrGetter<OpenInterval | undefined>;
  outsidePredicate?: (period: Period) => boolean;
}

export function useCalendarGrid(opts: UseCalendarGridOptions): ComputedRef<readonly Cell[]> {
  return computed(() => {
    const periods = toValue(opts.cells);
    const selected = toValue(opts.selected);
    const bounds = opts.bounds ? toValue(opts.bounds) : undefined;
    const today = toValue(opts.today);
    const outside = opts.outsidePredicate;

    return periods.map((period) => {
      const key = `${period.kind}:${period.anchor.toAnchor()}`;
      const isSelected =
        selected !== null && selected.kind === period.kind
          ? (period as unknown as { isSame(o: Period): boolean }).isSame(selected as Period)
          : false;
      const isDisabled = bounds ? !bounds.overlapsPeriod(period) : false;
      const isOutside = outside ? outside(period) : false;
      const isToday = period.contains(today);
      const label = period.format(opts.formatPattern);
      return { period, label, key, isSelected, isDisabled, isOutside, isToday };
    });
  });
}
```

The `isSame` cast is needed because each `Period` subtype's `isSame` is statically typed to its own kind; the kind discriminator we check first makes the call sound at runtime.

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/use-calendar-grid.test.ts && npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/use-calendar-grid.ts src/calendar/ui/use-calendar-grid.test.ts
git commit -m "feat(calendar-ui): useCalendarGrid composable"
```

---

### Task 4: Create `CalendarGrid.vue` presentational primitive

**Files:**

- Create: `src/calendar/ui/CalendarGrid.vue`

- [ ] **Step 1: Implement the primitive**

```vue
<!-- src/calendar/ui/CalendarGrid.vue -->
<script setup lang="ts">
defineProps<{ columns: number }>();
</script>

<template>
  <div class="calendar-grid">
    <div v-if="$slots.header" class="calendar-grid__header">
      <slot name="header" />
    </div>
    <div class="calendar-grid__body" :style="{ gridTemplateColumns: `repeat(${columns}, 1fr)` }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.calendar-grid__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.calendar-grid__body {
  display: grid;
  gap: 4px;
}
</style>
```

No tests — pure CSS/structural primitive, per `feedback_no_wiring_tests` and `feedback_no_trivial_tests`.

- [ ] **Step 2: Verify**

```bash
npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/calendar/ui/CalendarGrid.vue
git commit -m "feat(calendar-ui): CalendarGrid layout primitive"
```

---

### Task 5: `CalendarMonthView.vue` (month → days)

**Files:**

- Create: `src/calendar/ui/CalendarMonthView.vue`
- Test: `src/calendar/ui/CalendarMonthView.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/CalendarMonthView.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { CalendarDate, DayPeriod, MonthPeriod, OpenInterval } from "@/calendar";
import { Calendar } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { withServices } from "@/infrastructure/di/testing";

import CalendarMonthView from "./CalendarMonthView.vue";

describe("CalendarMonthView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderView(overrides: Partial<{ selected: DayPeriod | null; bounds: OpenInterval }>) {
    const calendar = new Calendar();
    return render(CalendarMonthView, {
      props: {
        outerPeriod: MonthPeriod.containing(date("2025-03-15")),
        selected: overrides.selected ?? null,
        bounds: overrides.bounds,
      },
      global: withServices([[Calendar, calendar]]),
    });
  }

  it("renders cells for every day in every week overlapping the month", () => {
    const { container } = renderView({});

    // 5 or 6 weeks × 7 days. Bound by lower limit 28 days only.
    expect(container.querySelectorAll('[data-testid="month-cell"]').length).toBeGreaterThanOrEqual(28);
  });

  it("emits select with the clicked day's DayPeriod", async () => {
    const { container, emitted } = renderView({});
    const cell = container.querySelector('[data-testid="month-cell"][data-anchor="2025-03-15"]') as HTMLElement;

    await userEvent.click(cell);

    const events = emitted("select") as DayPeriod[][];
    expect(events[0][0].start.toAnchor()).toBe("2025-03-15");
  });

  it("marks the selected day", () => {
    const { container } = renderView({ selected: DayPeriod.containing(date("2025-03-15")) });

    const cell = container.querySelector('[data-testid="month-cell"][data-anchor="2025-03-15"]');
    expect(cell?.getAttribute("data-selected")).toBe("true");
  });

  it("disables a cell whose day falls outside bounds", () => {
    const { container } = renderView({ bounds: OpenInterval.from(date("2025-03-10")) });

    const cell = container.querySelector('[data-testid="month-cell"][data-anchor="2025-03-05"]');
    expect(cell?.getAttribute("disabled")).not.toBeNull();
  });

  it("renders the first column matching the Calendar dow configuration", () => {
    const calendar = new Calendar();
    calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });

    const { container } = render(CalendarMonthView, {
      props: {
        outerPeriod: MonthPeriod.containing(date("2025-03-15")),
        selected: null,
      },
      global: withServices([[Calendar, calendar]]),
    });

    const firstWeekdayLabel = container.querySelector('[data-testid="weekday-header"]')?.textContent;
    expect(firstWeekdayLabel).toMatch(/Sun/i);
  });
});
```

If `@/infrastructure/di/testing` does not yet export a `withServices` helper, check existing component tests (e.g., `src/journals/settings/ui/JournalsDashboardBlock.test.ts`) for the actual helper name used to provide DI services in tests, and adopt the same pattern. Replace `withServices` accordingly — do NOT invent a new helper here.

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/CalendarMonthView.test.ts
```

Expected: module-not-found errors.

- [ ] **Step 3: Implement the component**

```vue
<!-- src/calendar/ui/CalendarMonthView.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { Calendar, CalendarDate, DayPeriod, MonthPeriod, OpenInterval, type Period } from "@/calendar";
import { useService } from "@/infrastructure/di";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: MonthPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: DayPeriod] }>();

const calendar = useService(Calendar);
const weekdays = computed(() => calendar.weekdays());

const cells = computed<readonly DayPeriod[]>(() => {
  const out: DayPeriod[] = [];
  for (const week of props.outerPeriod.weeks()) {
    for (const day of week.days()) out.push(DayPeriod.containing(day));
  }
  return out;
});

const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "D",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
  outsidePredicate: (p) => !props.outerPeriod.contains(p.start),
});
</script>

<template>
  <CalendarGrid :columns="7">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <div class="calendar-weekdays" :style="{ gridTemplateColumns: 'repeat(7, 1fr)' }">
      <div
        v-for="(label, i) in weekdays"
        :key="label"
        :data-testid="i === 0 ? 'weekday-header' : undefined"
        class="calendar-weekdays__cell"
      >
        {{ label.slice(0, 3) }}
      </div>
    </div>

    <button
      v-for="cell of grid"
      :key="cell.key"
      type="button"
      class="calendar-cell"
      data-testid="month-cell"
      :data-anchor="cell.period.start.toAnchor()"
      :data-selected="cell.isSelected || null"
      :data-outside="cell.isOutside || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as DayPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-weekdays {
  display: grid;
  gap: 4px;
}
.calendar-weekdays__cell {
  text-align: center;
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
}
.calendar-cell {
  padding: 4px;
  border: none;
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.calendar-cell[data-selected] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.calendar-cell[data-outside] {
  opacity: 0.4;
}
.calendar-cell:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
</style>
```

The `.calendar-weekdays` grid sits inside `CalendarGrid`'s body slot, which itself is a 7-col grid — but we want the weekday row to render as a single full-width 7-col row, not as seven body cells. To achieve that simply, the weekday header lives in `CalendarGrid`'s `#header` slot in the modal, NOT here. Move the weekday header up one layer in implementation: render it from `DatePickerModal` when `currentView === "month"`. Re-check after the next task — if it complicates the modal, fold the weekday strip into a separate component `CalendarWeekdays.vue` rather than threading slots.

**Revised plan for this task** — keep the weekday row inside the view but use a wrapper element with `grid-column: 1 / -1`:

Update the template so the weekday block spans all columns within the body grid:

```vue
    <div class="calendar-weekdays" data-grid-span>
      <div
        v-for="(label, i) in weekdays"
        :key="label"
        :data-testid="i === 0 ? 'weekday-header' : undefined"
        class="calendar-weekdays__cell"
      >
        {{ label.slice(0, 3) }}
      </div>
    </div>
```

And in the style block:

```css
[data-grid-span] {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/CalendarMonthView.test.ts && npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarMonthView.vue src/calendar/ui/CalendarMonthView.test.ts
git commit -m "feat(calendar-ui): CalendarMonthView day-grid"
```

---

### Task 6: `CalendarWeekView.vue` (month → weeks)

**Files:**

- Create: `src/calendar/ui/CalendarWeekView.vue`
- Test: `src/calendar/ui/CalendarWeekView.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/CalendarWeekView.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { Calendar, MonthPeriod, OpenInterval, WeekPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { withServices } from "@/infrastructure/di/testing"; // adapt if helper differs

import CalendarWeekView from "./CalendarWeekView.vue";

describe("CalendarWeekView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderView(overrides: Partial<{ selected: WeekPeriod | null; bounds: OpenInterval }> = {}) {
    return render(CalendarWeekView, {
      props: {
        outerPeriod: MonthPeriod.containing(date("2025-03-15")),
        selected: overrides.selected ?? null,
        bounds: overrides.bounds,
      },
      global: withServices([[Calendar, new Calendar()]]),
    });
  }

  it("renders one cell per week overlapping the month", () => {
    const { container } = renderView();

    const cells = container.querySelectorAll('[data-testid="week-cell"]');
    // ISO weeks in March 2025: 5–6 weeks
    expect(cells.length).toBeGreaterThanOrEqual(5);
    expect(cells.length).toBeLessThanOrEqual(6);
  });

  it("emits select with the clicked week's WeekPeriod", async () => {
    const { container, emitted } = renderView();
    const cells = container.querySelectorAll('[data-testid="week-cell"]');
    await userEvent.click(cells[1] as HTMLElement);

    const events = emitted("select") as WeekPeriod[][];
    expect(events[0][0].kind).toBe("week");
  });

  it("marks the selected week", () => {
    const week = WeekPeriod.containing(date("2025-03-15"));
    const { container } = renderView({ selected: week });

    const selected = container.querySelector('[data-testid="week-cell"][data-selected="true"]');
    expect(selected).not.toBeNull();
  });

  it("disables a cell whose week falls outside bounds", () => {
    const { container } = renderView({ bounds: OpenInterval.from(date("2025-03-15")) });

    const disabled = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="week-cell"]')).find(
      (b) => b.disabled,
    );
    expect(disabled).not.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/CalendarWeekView.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the component**

```vue
<!-- src/calendar/ui/CalendarWeekView.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, OpenInterval, WeekPeriod, type Period } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: MonthPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: WeekPeriod] }>();

const cells = computed<readonly WeekPeriod[]>(() => [...props.outerPeriod.weeks()]);
const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "[W]w",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="1">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <button
      v-for="cell of grid"
      :key="cell.key"
      type="button"
      class="calendar-cell calendar-cell--week"
      data-testid="week-cell"
      :data-anchor="cell.period.anchor.toAnchor()"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as WeekPeriod)"
    >
      <span class="calendar-cell--week__label">{{ cell.label }}</span>
      <span class="calendar-cell--week__range">
        {{ cell.period.format("MMM D") }} – {{ (cell.period as WeekPeriod).end.format("MMM D") }}
      </span>
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-cell--week {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.calendar-cell--week[data-selected] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.calendar-cell--week:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
.calendar-cell--week__range {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
</style>
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/CalendarWeekView.test.ts && npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarWeekView.vue src/calendar/ui/CalendarWeekView.test.ts
git commit -m "feat(calendar-ui): CalendarWeekView week-list view"
```

---

### Task 7: `CalendarQuarterView.vue` (year → 4 quarters)

**Files:**

- Create: `src/calendar/ui/CalendarQuarterView.vue`
- Test: `src/calendar/ui/CalendarQuarterView.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/CalendarQuarterView.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { OpenInterval, QuarterPeriod, YearPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import CalendarQuarterView from "./CalendarQuarterView.vue";

describe("CalendarQuarterView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderView(overrides: Partial<{ selected: QuarterPeriod | null; bounds: OpenInterval }> = {}) {
    return render(CalendarQuarterView, {
      props: {
        outerPeriod: YearPeriod.containing(date("2025-05-15")),
        selected: overrides.selected ?? null,
        bounds: overrides.bounds,
      },
    });
  }

  it("renders exactly four quarter cells", () => {
    const { container } = renderView();
    expect(container.querySelectorAll('[data-testid="quarter-cell"]').length).toBe(4);
  });

  it("emits select with the clicked quarter's QuarterPeriod", async () => {
    const { container, emitted } = renderView();
    const cells = container.querySelectorAll('[data-testid="quarter-cell"]');
    await userEvent.click(cells[2] as HTMLElement);

    const events = emitted("select") as QuarterPeriod[][];
    expect(events[0][0].kind).toBe("quarter");
  });

  it("marks the selected quarter", () => {
    const q = QuarterPeriod.containing(date("2025-05-15"));
    const { container } = renderView({ selected: q });

    const selected = container.querySelector('[data-testid="quarter-cell"][data-selected="true"]');
    expect(selected).not.toBeNull();
  });

  it("disables a quarter whose period falls outside bounds", () => {
    const { container } = renderView({ bounds: OpenInterval.from(date("2025-07-01")) });

    const disabled = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="quarter-cell"]')).find(
      (b) => b.disabled,
    );
    expect(disabled).not.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/CalendarQuarterView.test.ts
```

- [ ] **Step 3: Implement**

```vue
<!-- src/calendar/ui/CalendarQuarterView.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, OpenInterval, QuarterPeriod, YearPeriod, type Period } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: YearPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: QuarterPeriod] }>();

const cells = computed<readonly QuarterPeriod[]>(() => [...props.outerPeriod.quarters()]);
const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "[Q]Q",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="2">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <button
      v-for="cell of grid"
      :key="cell.key"
      type="button"
      class="calendar-cell"
      data-testid="quarter-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as QuarterPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-cell {
  padding: 8px;
  border: none;
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.calendar-cell[data-selected] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.calendar-cell:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
</style>
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/CalendarQuarterView.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarQuarterView.vue src/calendar/ui/CalendarQuarterView.test.ts
git commit -m "feat(calendar-ui): CalendarQuarterView 4-quarter grid"
```

---

### Task 8: `CalendarYearView.vue` (year → 12 months)

**Files:**

- Create: `src/calendar/ui/CalendarYearView.vue`
- Test: `src/calendar/ui/CalendarYearView.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/CalendarYearView.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { MonthPeriod, OpenInterval, YearPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import CalendarYearView from "./CalendarYearView.vue";

describe("CalendarYearView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderView(overrides: Partial<{ selected: MonthPeriod | null; bounds: OpenInterval }> = {}) {
    return render(CalendarYearView, {
      props: {
        outerPeriod: YearPeriod.containing(date("2025-05-15")),
        selected: overrides.selected ?? null,
        bounds: overrides.bounds,
      },
    });
  }

  it("renders exactly twelve month cells", () => {
    const { container } = renderView();
    expect(container.querySelectorAll('[data-testid="year-cell"]').length).toBe(12);
  });

  it("emits select with the clicked month's MonthPeriod", async () => {
    const { container, emitted } = renderView();
    const cells = container.querySelectorAll('[data-testid="year-cell"]');
    await userEvent.click(cells[4] as HTMLElement); // May

    const events = emitted("select") as MonthPeriod[][];
    expect(events[0][0].start.toAnchor()).toBe("2025-05-01");
  });

  it("marks the selected month", () => {
    const { container } = renderView({ selected: MonthPeriod.containing(date("2025-05-15")) });

    const selected = container.querySelector('[data-testid="year-cell"][data-selected="true"]');
    expect(selected).not.toBeNull();
  });

  it("disables a month whose period falls outside bounds", () => {
    const { container } = renderView({ bounds: OpenInterval.from(date("2025-07-01")) });

    const disabled = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="year-cell"]')).find(
      (b) => b.disabled,
    );
    expect(disabled).not.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/CalendarYearView.test.ts
```

- [ ] **Step 3: Implement**

```vue
<!-- src/calendar/ui/CalendarYearView.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, OpenInterval, YearPeriod, type Period } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: YearPeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: MonthPeriod] }>();

const cells = computed<readonly MonthPeriod[]>(() => [...props.outerPeriod.months()]);
const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "MMM",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="3">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <button
      v-for="cell of grid"
      :key="cell.key"
      type="button"
      class="calendar-cell"
      data-testid="year-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as MonthPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-cell {
  padding: 6px;
  border: none;
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.calendar-cell[data-selected] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.calendar-cell:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
</style>
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/CalendarYearView.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarYearView.vue src/calendar/ui/CalendarYearView.test.ts
git commit -m "feat(calendar-ui): CalendarYearView 12-month grid"
```

---

### Task 9: `CalendarDecadeView.vue` (decade → 10 years)

**Files:**

- Create: `src/calendar/ui/CalendarDecadeView.vue`
- Test: `src/calendar/ui/CalendarDecadeView.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/CalendarDecadeView.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { DecadePeriod, OpenInterval, YearPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import CalendarDecadeView from "./CalendarDecadeView.vue";

describe("CalendarDecadeView", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderView(overrides: Partial<{ selected: YearPeriod | null; bounds: OpenInterval }> = {}) {
    return render(CalendarDecadeView, {
      props: {
        outerPeriod: DecadePeriod.containing(date("2025-05-15")),
        selected: overrides.selected ?? null,
        bounds: overrides.bounds,
      },
    });
  }

  it("renders exactly ten year cells", () => {
    const { container } = renderView();
    expect(container.querySelectorAll('[data-testid="decade-cell"]').length).toBe(10);
  });

  it("emits select with the clicked year's YearPeriod", async () => {
    const { container, emitted } = renderView();
    const cells = container.querySelectorAll('[data-testid="decade-cell"]');
    await userEvent.click(cells[5] as HTMLElement);

    const events = emitted("select") as YearPeriod[][];
    expect(events[0][0].kind).toBe("year");
  });

  it("marks the selected year", () => {
    const { container } = renderView({ selected: YearPeriod.containing(date("2025-05-15")) });

    const selected = container.querySelector('[data-testid="decade-cell"][data-selected="true"]');
    expect(selected).not.toBeNull();
  });

  it("disables a year whose period falls outside bounds", () => {
    const { container } = renderView({ bounds: OpenInterval.from(date("2026-01-01")) });

    const disabled = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="decade-cell"]')).find(
      (b) => b.disabled,
    );
    expect(disabled).not.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/CalendarDecadeView.test.ts
```

- [ ] **Step 3: Implement**

```vue
<!-- src/calendar/ui/CalendarDecadeView.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, DecadePeriod, OpenInterval, YearPeriod, type Period } from "@/calendar";

import CalendarGrid from "./CalendarGrid.vue";
import { useCalendarGrid } from "./use-calendar-grid";

const props = defineProps<{
  outerPeriod: DecadePeriod;
  selected: Period | null;
  bounds?: OpenInterval;
}>();

const emit = defineEmits<{ select: [cell: YearPeriod] }>();

const cells = computed<readonly YearPeriod[]>(() => [...props.outerPeriod.years()]);
const today = CalendarDate.today();

const grid = useCalendarGrid({
  cells,
  formatPattern: "YYYY",
  selected: () => props.selected,
  today,
  bounds: () => props.bounds,
});
</script>

<template>
  <CalendarGrid :columns="4">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <button
      v-for="cell of grid"
      :key="cell.key"
      type="button"
      class="calendar-cell"
      data-testid="decade-cell"
      :data-selected="cell.isSelected || null"
      :data-today="cell.isToday || null"
      :disabled="cell.isDisabled"
      @click="emit('select', cell.period as YearPeriod)"
    >
      {{ cell.label }}
    </button>
  </CalendarGrid>
</template>

<style scoped>
.calendar-cell {
  padding: 8px;
  border: none;
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.calendar-cell[data-selected] {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.calendar-cell:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
</style>
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/CalendarDecadeView.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/CalendarDecadeView.vue src/calendar/ui/CalendarDecadeView.test.ts
git commit -m "feat(calendar-ui): CalendarDecadeView 10-year grid"
```

---

### Task 10: `DatePickerModal.vue` — view state, descent, navigation

**Files:**

- Create: `src/calendar/ui/DatePickerModal.vue`
- Test: `src/calendar/ui/DatePickerModal.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/DatePickerModal.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import {
  Calendar,
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  OpenInterval,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
} from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { withServices } from "@/infrastructure/di/testing"; // adapt to project helper
import { provideModalApi } from "./testing";

import DatePickerModal from "./DatePickerModal.vue";

describe("DatePickerModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderModal(opts: {
    picking: "day" | "week" | "month" | "quarter" | "year";
    selected?: any;
    bounds?: OpenInterval;
    onSubmit?: (value: unknown) => void;
    onCancel?: () => void;
  }) {
    return render(DatePickerModal, {
      props: { picking: opts.picking, selected: opts.selected, bounds: opts.bounds },
      global: {
        ...withServices([[Calendar, new Calendar()]]),
        provide: provideModalApi({ submit: opts.onSubmit ?? vi.fn(), cancel: opts.onCancel ?? vi.fn() }),
      },
    });
  }

  describe("initial view", () => {
    it("opens at the month view when picking is day", () => {
      const { container } = renderModal({ picking: "day", selected: DayPeriod.containing(date("2025-03-15")) });
      expect(container.querySelector('[data-testid="month-cell"]')).not.toBeNull();
    });

    it("opens at the week view when picking is week", () => {
      const { container } = renderModal({ picking: "week", selected: WeekPeriod.containing(date("2025-03-15")) });
      expect(container.querySelector('[data-testid="week-cell"]')).not.toBeNull();
    });

    it("opens at the year view when picking is month", () => {
      const { container } = renderModal({ picking: "month", selected: MonthPeriod.containing(date("2025-03-15")) });
      expect(container.querySelector('[data-testid="year-cell"]')).not.toBeNull();
    });

    it("opens at the quarter view when picking is quarter", () => {
      const { container } = renderModal({ picking: "quarter", selected: QuarterPeriod.containing(date("2025-03-15")) });
      expect(container.querySelector('[data-testid="quarter-cell"]')).not.toBeNull();
    });

    it("opens at the decade view when picking is year", () => {
      const { container } = renderModal({ picking: "year", selected: YearPeriod.containing(date("2025-05-15")) });
      expect(container.querySelector('[data-testid="decade-cell"]')).not.toBeNull();
    });
  });

  describe("target click", () => {
    it("submits the clicked period when picking is day", async () => {
      const submit = vi.fn();
      const { container } = renderModal({
        picking: "day",
        onSubmit: submit,
        selected: DayPeriod.containing(date("2025-03-15")),
      });

      const cell = container.querySelector('[data-testid="month-cell"][data-anchor="2025-03-15"]') as HTMLElement;
      await userEvent.click(cell);

      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.mock.calls[0][0].kind).toBe("day");
    });
  });

  describe("descent", () => {
    it("descends from decade to year view for picking=month after a year click", async () => {
      const { container } = renderModal({ picking: "month" });

      // We're already at year view per the initial-view rule, so descent test must drill UP first
      // then click a year cell. Use the title button to ascend to decade.
      const title = container.querySelector('[data-testid="modal-title-button"]') as HTMLElement;
      await userEvent.click(title);

      const yearCell = container.querySelector('[data-testid="decade-cell"]') as HTMLElement;
      await userEvent.click(yearCell);

      expect(container.querySelector('[data-testid="year-cell"]')).not.toBeNull();
    });

    it("descends from year to month view for picking=day after a month click", async () => {
      const { container } = renderModal({ picking: "day" });

      const title = container.querySelector('[data-testid="modal-title-button"]') as HTMLElement;
      await userEvent.click(title);

      const monthCell = container.querySelector('[data-testid="year-cell"]') as HTMLElement;
      await userEvent.click(monthCell);

      expect(container.querySelector('[data-testid="month-cell"]')).not.toBeNull();
    });
  });

  describe("drill up", () => {
    it("ascends from month to year on title click", async () => {
      const { container } = renderModal({ picking: "day" });

      const title = container.querySelector('[data-testid="modal-title-button"]') as HTMLElement;
      await userEvent.click(title);

      expect(container.querySelector('[data-testid="year-cell"]')).not.toBeNull();
    });
  });

  describe("navigation", () => {
    it("moves to the previous outer period when prev is clicked", async () => {
      const { container, getByTestId } = renderModal({
        picking: "day",
        selected: DayPeriod.containing(date("2025-03-15")),
      });

      const before = getByTestId("modal-title-label").textContent;
      await userEvent.click(getByTestId("modal-prev"));
      const after = getByTestId("modal-title-label").textContent;

      expect(after).not.toBe(before);
    });

    it("hides prev when the previous outer period does not overlap bounds", () => {
      const bounds = OpenInterval.from(date("2025-03-01"));
      const { queryByTestId } = renderModal({
        picking: "day",
        selected: DayPeriod.containing(date("2025-03-15")),
        bounds,
      });

      expect(queryByTestId("modal-prev")).toBeNull();
    });
  });
});
```

A shared test helper is referenced: `./testing.ts` exports `provideModalApi(api)`. It must be created in this task as part of the test infrastructure (`src/calendar/ui/testing.ts`).

- [ ] **Step 2: Create testing.ts helper**

```ts
// src/calendar/ui/testing.ts
import { ModalApiInjectionKey } from "@/infrastructure/host/modals/internal/modal-context";

import type { ModalApi } from "@/infrastructure/host/modals";

export function provideModalApi<TResult>(api: ModalApi<TResult>): Record<symbol | string, unknown> {
  return { [ModalApiInjectionKey as unknown as symbol]: api };
}
```

If `ModalApiInjectionKey` is not exported, open `src/infrastructure/host/modals/internal/modal-context.ts` and re-export the injection key for tests by adding a public export to `src/infrastructure/host/modals/index.ts`:

```ts
export { ModalApiInjectionKey } from "./internal/modal-context";
```

If a different export path is in use, update the import in `testing.ts` and the spec's "Modal infrastructure" reference accordingly.

- [ ] **Step 3: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/DatePickerModal.test.ts
```

Expected: failures because `DatePickerModal.vue` does not exist.

- [ ] **Step 4: Implement the modal**

```vue
<!-- src/calendar/ui/DatePickerModal.vue -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { match, P } from "ts-pattern";

import {
  CalendarDate,
  DayPeriod,
  DecadePeriod,
  MonthPeriod,
  OpenInterval,
  Period,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
} from "@/calendar";
import { useModal } from "@/infrastructure/host/modals";

import CalendarDecadeView from "./CalendarDecadeView.vue";
import CalendarMonthView from "./CalendarMonthView.vue";
import CalendarQuarterView from "./CalendarQuarterView.vue";
import CalendarWeekView from "./CalendarWeekView.vue";
import CalendarYearView from "./CalendarYearView.vue";
import { DatePickerInvariantError, type Picking, type View } from "./errors";

const props = defineProps<{
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}>();

const api = useModal<Period>();

function targetView(picking: Picking): View {
  return match(picking)
    .with("day", () => "month" as const)
    .with("week", () => "week" as const)
    .with("month", () => "year" as const)
    .with("quarter", () => "quarter" as const)
    .with("year", () => "decade" as const)
    .exhaustive();
}

function expectedKindFor(picking: Picking): Period["kind"] {
  return picking;
}

function ascend(view: View): View | null {
  return match(view)
    .with("month", () => "year" as const)
    .with("week", () => "year" as const)
    .with("year", () => "decade" as const)
    .with("quarter", () => "decade" as const)
    .with("decade", () => null)
    .exhaustive();
}

const initial: View = targetView(props.picking);

// Defensive narrowing: ignore selected for highlight when kind doesn't match the picking target.
const selectedForHighlight = computed<Period | null>(() => {
  const s = props.selected ?? null;
  if (!s) return null;
  return s.kind === expectedKindFor(props.picking) ? s : null;
});

const refDate = ref<CalendarDate>(props.selected?.anchor ?? CalendarDate.today());
const currentView = ref<View>(initial);

const outerPeriod = computed<Period>(() => {
  return match(currentView.value)
    .with("month", () => MonthPeriod.containing(refDate.value))
    .with("week", () => MonthPeriod.containing(refDate.value))
    .with("year", () => YearPeriod.containing(refDate.value))
    .with("quarter", () => YearPeriod.containing(refDate.value))
    .with("decade", () => DecadePeriod.containing(refDate.value))
    .exhaustive();
}) as unknown as import("vue").ComputedRef<Period>;

const titleLabel = computed(() => {
  return match(currentView.value)
    .with("month", () => outerPeriod.value.format("MMMM YYYY"))
    .with("week", () => outerPeriod.value.format("MMMM YYYY"))
    .with("year", () => outerPeriod.value.format("YYYY"))
    .with("quarter", () => outerPeriod.value.format("YYYY"))
    .with(
      "decade",
      () =>
        `${(outerPeriod.value as DecadePeriod).start.format("YYYY")} – ${(outerPeriod.value as DecadePeriod).end.format("YYYY")}`,
    )
    .exhaustive();
});

function descend(view: View, picking: Picking, cell: Period): { nextView: View; nextRef: CalendarDate } {
  return match([view, picking, cell.kind] as const)
    .with(["decade", "month", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["decade", "quarter", "year"], () => ({ nextView: "quarter" as const, nextRef: cell.anchor }))
    .with(["decade", "day", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["decade", "week", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["year", "day", "month"], () => ({ nextView: "month" as const, nextRef: cell.anchor }))
    .with(["year", "week", "month"], () => ({ nextView: "week" as const, nextRef: cell.anchor }))
    .otherwise(() => {
      throw new DatePickerInvariantError(view, picking, cell.kind);
    });
}

function onCellSelect(cell: Period): void {
  if (currentView.value === targetView(props.picking)) {
    api.submit(cell);
    return;
  }
  const { nextView, nextRef } = descend(currentView.value, props.picking, cell);
  currentView.value = nextView;
  refDate.value = nextRef;
}

function onTitleClick(): void {
  const next = ascend(currentView.value);
  if (next) currentView.value = next;
}

const canPrev = computed(() => {
  const prev = (outerPeriod.value as { previous(): Period }).previous();
  return !props.bounds || props.bounds.overlapsPeriod(prev);
});
const canNext = computed(() => {
  const next = (outerPeriod.value as { next(): Period }).next();
  return !props.bounds || props.bounds.overlapsPeriod(next);
});

function onPrev(): void {
  refDate.value = (outerPeriod.value as { previous(): Period }).previous().anchor;
}
function onNext(): void {
  refDate.value = (outerPeriod.value as { next(): Period }).next().anchor;
}

const titleAscendable = computed(() => ascend(currentView.value) !== null);
</script>

<template>
  <div class="date-picker-modal">
    <header class="date-picker-modal__header">
      <button v-if="canPrev" type="button" data-testid="modal-prev" class="date-picker-modal__nav" @click="onPrev">
        ‹
      </button>
      <span v-else class="date-picker-modal__nav-placeholder" />

      <button
        v-if="titleAscendable"
        type="button"
        data-testid="modal-title-button"
        class="date-picker-modal__title-button"
        @click="onTitleClick"
      >
        <span data-testid="modal-title-label">{{ titleLabel }}</span>
      </button>
      <span v-else class="date-picker-modal__title-static">
        <span data-testid="modal-title-label">{{ titleLabel }}</span>
      </span>

      <button v-if="canNext" type="button" data-testid="modal-next" class="date-picker-modal__nav" @click="onNext">
        ›
      </button>
      <span v-else class="date-picker-modal__nav-placeholder" />
    </header>

    <CalendarMonthView
      v-if="currentView === 'month'"
      :outer-period="outerPeriod as MonthPeriod"
      :selected="selectedForHighlight"
      :bounds="bounds"
      @select="onCellSelect"
    />
    <CalendarWeekView
      v-else-if="currentView === 'week'"
      :outer-period="outerPeriod as MonthPeriod"
      :selected="selectedForHighlight"
      :bounds="bounds"
      @select="onCellSelect"
    />
    <CalendarQuarterView
      v-else-if="currentView === 'quarter'"
      :outer-period="outerPeriod as YearPeriod"
      :selected="selectedForHighlight"
      :bounds="bounds"
      @select="onCellSelect"
    />
    <CalendarYearView
      v-else-if="currentView === 'year'"
      :outer-period="outerPeriod as YearPeriod"
      :selected="selectedForHighlight"
      :bounds="bounds"
      @select="onCellSelect"
    />
    <CalendarDecadeView
      v-else
      :outer-period="outerPeriod as DecadePeriod"
      :selected="selectedForHighlight"
      :bounds="bounds"
      @select="onCellSelect"
    />
  </div>
</template>

<style scoped>
.date-picker-modal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}
.date-picker-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.date-picker-modal__nav,
.date-picker-modal__title-button {
  background: none;
  border: 1px solid var(--background-modifier-border);
  padding: 4px 8px;
  cursor: pointer;
}
.date-picker-modal__nav-placeholder {
  width: 32px;
}
</style>
```

If `ts-pattern`'s `.exhaustive()` complains because the `cell.kind` union is wider than the matched arms, narrow with `as const` tuples explicitly (as written) and confirm via `npm run check:types`. If TS still flags it, use `.otherwise(...)` (as written) for the fallthrough invariant.

- [ ] **Step 5: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/DatePickerModal.test.ts && npm run check:types && npm run check:lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/calendar/ui/DatePickerModal.vue src/calendar/ui/DatePickerModal.test.ts src/calendar/ui/testing.ts
git commit -m "feat(calendar-ui): DatePickerModal view state, descent, and navigation"
```

---

### Task 11: Add invariant-throw coverage for `descend`

**Files:**

- Modify: `src/calendar/ui/DatePickerModal.test.ts`

- [ ] **Step 1: Add failing test**

Append inside the existing `describe("DatePickerModal", () => { ... })`:

```ts
describe("invariants", () => {
  it("throws DatePickerInvariantError when descent receives an impossible (view, picking, cellKind) combination", async () => {
    // Force the modal into a state where view is 'year' but picking is 'quarter'
    // by ascending from the quarter target view.
    // (year + picking=quarter is unreachable via normal UI.)
    // We construct the impossibility by directly calling onCellSelect via component event:
    // easier approach — mount the modal at picking=quarter, ascend to decade, then ascend
    // again — not possible since decade has no parent. So this test exercises descend()
    // through a contrived path: render at picking=quarter, drill up to decade, click a
    // year cell which should descend straight to quarter (valid), then we directly
    // assert that DatePickerModal exposes the invariant by attempting a forbidden flow.
    //
    // Since the invariant is unreachable through normal UI input, this test verifies the
    // descend function in isolation: import it indirectly by re-exporting from the SFC.
    //
    // If exporting descend from the SFC adds noise, mirror the descend table into a
    // separate module-internal helper `descend.ts` and test it there. Adjust the
    // implementation BEFORE writing this test if needed.
    const { descend } = await import("./descend"); // requires Step 2 below

    expect(() => descend("year", "quarter", { kind: "month" } as any)).toThrow(/unreachable descent/);
  });
});
```

- [ ] **Step 2: Extract `descend` into its own module**

Create `src/calendar/ui/descend.ts`:

```ts
import { match } from "ts-pattern";

import type { CalendarDate, Period } from "@/calendar";

import { DatePickerInvariantError, type Picking, type View } from "./errors";

export function descend(view: View, picking: Picking, cell: Period): { nextView: View; nextRef: CalendarDate } {
  return match([view, picking, cell.kind] as const)
    .with(["decade", "month", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["decade", "quarter", "year"], () => ({ nextView: "quarter" as const, nextRef: cell.anchor }))
    .with(["decade", "day", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["decade", "week", "year"], () => ({ nextView: "year" as const, nextRef: cell.anchor }))
    .with(["year", "day", "month"], () => ({ nextView: "month" as const, nextRef: cell.anchor }))
    .with(["year", "week", "month"], () => ({ nextView: "week" as const, nextRef: cell.anchor }))
    .otherwise(() => {
      throw new DatePickerInvariantError(view, picking, cell.kind);
    });
}
```

Then update `DatePickerModal.vue` to import `descend` from this module instead of defining it inline. Remove the inline `descend` function and the now-unused `match`/`P` imports if no longer needed (keep `match` for `targetView`/`ascend`).

- [ ] **Step 3: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/DatePickerModal.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 4: Commit**

```bash
git add src/calendar/ui/descend.ts src/calendar/ui/DatePickerModal.vue src/calendar/ui/DatePickerModal.test.ts
git commit -m "refactor(calendar-ui): extract descend table and cover invariant"
```

---

### Task 12: Add i18n key for the date-picker modal title

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the key**

Insert (preserving alphabetical order within the calendar prefix group):

```json
  "calendar_date_picker_title": "Pick a date",
```

If your project requires a paraglide compile step after editing the messages file, run:

```bash
npm run i18n:compile
```

(or the equivalent script — check `package.json` scripts for the i18n compile command before assuming the name).

- [ ] **Step 2: Verify**

```bash
npm run check:types
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "i18n(calendar-ui): add calendar_date_picker_title"
```

---

### Task 13: `date-picker-modal-definition.ts`

**Files:**

- Create: `src/calendar/ui/date-picker-modal-definition.ts`

- [ ] **Step 1: Implement**

```ts
// src/calendar/ui/date-picker-modal-definition.ts
import type { Component } from "vue";

import type { OpenInterval, Period } from "@/calendar";
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DatePickerModal from "./DatePickerModal.vue";

import type { Picking } from "./errors";

export interface DatePickerModalProps {
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}

export const datePickerModalDefinition: ModalDefinition<DatePickerModalProps, Period> = defineModal({
  component: DatePickerModal as Component,
  title: () => m.calendar_date_picker_title(),
  width: 400,
});
```

No tests — `feedback_no_wiring_tests`.

- [ ] **Step 2: Verify**

```bash
npm run check:types && npm run check:lint
```

- [ ] **Step 3: Commit**

```bash
git add src/calendar/ui/date-picker-modal-definition.ts
git commit -m "feat(calendar-ui): date-picker modal definition"
```

---

### Task 14: `DatePicker.vue` trigger button

**Files:**

- Create: `src/calendar/ui/DatePicker.vue`
- Test: `src/calendar/ui/DatePicker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/calendar/ui/DatePicker.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";

import { AsyncResult } from "@/infrastructure/result";
import { Calendar, DayPeriod, ModalCancelled, MonthPeriod } from "@/calendar"; // ModalCancelled actually lives in infrastructure/host/modals — adjust import
import { ModalService } from "@/infrastructure/host/modals";
import { date, installTestCalendar } from "@/calendar/testing";
import { withServices } from "@/infrastructure/di/testing"; // adapt to project helper

import DatePicker from "./DatePicker.vue";

describe("DatePicker", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  function renderTrigger(opts: {
    modelValue?: any;
    picking?: "day" | "week" | "month" | "quarter" | "year";
    openResult: AsyncResult<any, any>;
  }) {
    const fakeService = { open: vi.fn().mockReturnValue(opts.openResult) } as unknown as ModalService;
    return {
      service: fakeService,
      ...render(DatePicker, {
        props: { modelValue: opts.modelValue ?? null, picking: opts.picking ?? "day" },
        global: withServices([
          [Calendar, new Calendar()],
          [ModalService, fakeService],
        ]),
      }),
    };
  }

  it("shows the placeholder when modelValue is null", () => {
    const { getByRole } = renderTrigger({
      openResult: AsyncResult.fromPromise(Promise.resolve(null as any), () => new Error("never")),
    });

    expect(getByRole("button").textContent).toMatch(/Pick a date|Select/i);
  });

  it("shows a formatted label per picking when modelValue is set", () => {
    const { getByRole } = renderTrigger({
      modelValue: DayPeriod.containing(date("2025-03-15")),
      openResult: AsyncResult.fromPromise(Promise.resolve(null as any), () => new Error("never")),
    });

    expect(getByRole("button").textContent).toMatch(/2025-03-15/);
  });

  it("opens the modal on click", async () => {
    const { service, getByRole } = renderTrigger({
      openResult: AsyncResult.fromPromise(Promise.resolve(null as any), () => new Error("never")),
    });

    await userEvent.click(getByRole("button"));
    expect(service.open).toHaveBeenCalledTimes(1);
  });

  it("updates modelValue when the modal resolves with a Period", async () => {
    const picked = DayPeriod.containing(date("2025-03-15"));
    const result = AsyncResult.fromPromise(Promise.resolve(picked), () => new Error("never")) as any;

    const { getByRole, emitted } = renderTrigger({ openResult: result });

    await userEvent.click(getByRole("button"));
    await Promise.resolve(); // flush microtasks

    const updates = emitted("update:modelValue") as DayPeriod[][];
    expect(updates.at(-1)?.[0].start.toAnchor()).toBe("2025-03-15");
  });

  it("does not update modelValue when the modal is dismissed", async () => {
    // ModalCancelled is the Err type returned by ModalService.open
    const { ModalCancelled: MC } = await import("@/infrastructure/host/modals");
    const result = AsyncResult.fromPromise(Promise.reject(new MC()), (e: unknown) => e as InstanceType<typeof MC>);

    const { getByRole, emitted } = renderTrigger({ openResult: result as any });

    await userEvent.click(getByRole("button"));
    await Promise.resolve();

    expect(emitted("update:modelValue") ?? []).toHaveLength(0);
  });
});
```

If `AsyncResult.fromPromise` doesn't exist or uses a different name, check `src/infrastructure/result/index.ts` and adapt — do NOT invent a new constructor.

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/calendar/ui/DatePicker.test.ts
```

- [ ] **Step 3: Implement**

```vue
<!-- src/calendar/ui/DatePicker.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { match } from "ts-pattern";

import { OpenInterval, type Period } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { datePickerModalDefinition } from "./date-picker-modal-definition";

import type { Picking } from "./errors";

const props = withDefaults(
  defineProps<{
    picking: Picking;
    bounds?: OpenInterval;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { placeholder: undefined, disabled: false },
);

const modelValue = defineModel<Period | null>();

const modals = useService(ModalService);

function previewFor(picking: Picking): string {
  return match(picking)
    .with("day", () => "YYYY-MM-DD")
    .with("week", () => "YYYY-[W]w")
    .with("month", () => "YYYY-MM")
    .with("quarter", () => "YYYY-[Q]Q")
    .with("year", () => "YYYY")
    .exhaustive();
}

const label = computed(() => {
  if (modelValue.value === null || modelValue.value === undefined) {
    return props.placeholder ?? m.calendar_date_picker_title();
  }
  return modelValue.value.format(previewFor(props.picking));
});

async function open(): Promise<void> {
  if (props.disabled) return;
  const result = await modals.open(datePickerModalDefinition, {
    picking: props.picking,
    bounds: props.bounds,
    selected: modelValue.value ?? null,
  });
  result.match({
    ok: (period: Period) => {
      modelValue.value = period;
    },
    err: () => {
      // dismiss — no change
    },
  });
}
</script>

<template>
  <button type="button" class="date-picker-trigger" :disabled="disabled" @click="open">
    {{ label }}
  </button>
</template>

<style scoped>
.date-picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-modifier-form-field);
  cursor: pointer;
}
.date-picker-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

If `AsyncResult.match` returns synchronously on a resolved/rejected promise, the test's `await Promise.resolve()` is enough. If `AsyncResult.match` requires an awaited variant (e.g., `await result.match({...})`), adjust both the implementation and tests accordingly — confirm by reading `src/infrastructure/result/async-result.ts` (or equivalent).

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/calendar/ui/DatePicker.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/calendar/ui/DatePicker.vue src/calendar/ui/DatePicker.test.ts
git commit -m "feat(calendar-ui): DatePicker trigger button"
```

---

### Task 15: `calendarUiModule` and `index.ts` barrel

**Files:**

- Create: `src/calendar/ui/module.ts`
- Create: `src/calendar/ui/index.ts`

- [ ] **Step 1: Implement module**

Check how other modules register modal definitions. Open `src/journals/settings/module.ts` (or the nearest equivalent that wires a modal definition into the host) and mirror its registration pattern. Then implement:

```ts
// src/calendar/ui/module.ts
import type { Module } from "@/infrastructure/di";

import { datePickerModalDefinition } from "./date-picker-modal-definition";

export const calendarUiModule: Module = {
  register(c) {
    // Adapt this body to match the project's modal-definition registration pattern.
    // Most likely: c.register(ModalDefinitionsToken).useValue([datePickerModalDefinition]).
    // If a "slot" pattern (multiBind) is used, use whichever method the existing modules use.
    // Do NOT invent a new registration shape — copy from an existing module.
    void datePickerModalDefinition;
  },
};
```

After identifying the existing pattern, replace the `void` placeholder with the correct registration call. The exact API to use is determined by reading the existing journals-settings or calendar-settings module file.

- [ ] **Step 2: Implement barrel**

```ts
// src/calendar/ui/index.ts
export { default as DatePicker } from "./DatePicker.vue";
export { calendarUiModule } from "./module";
```

- [ ] **Step 3: Verify**

```bash
npm run check:types && npm run check:lint
```

- [ ] **Step 4: Commit**

```bash
git add src/calendar/ui/module.ts src/calendar/ui/index.ts
git commit -m "feat(calendar-ui): calendarUiModule and public barrel"
```

---

### Task 16: Wire `calendarUiModule` in `main.ts`

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Add the import and wire-up**

Open `src/main.ts`. Find the block where other UI modules are composed (likely near `journalsSettingsModule`). Add:

```ts
import { calendarUiModule } from "@/calendar/ui";
```

and include `calendarUiModule` in the module composition in the same way `journalsSettingsModule` is included.

- [ ] **Step 2: Verify**

```bash
npm run check:types && npm run check:lint && npm run test
```

Expected: all green. No new behavioral tests for the wiring (per `feedback_no_wiring_tests`).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(calendar-ui): wire calendarUiModule in main"
```

---

### Task 17: `useAnchorField` composable

**Files:**

- Create: `src/journals/settings/ui/use-anchor-field.ts`
- Test: `src/journals/settings/ui/use-anchor-field.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/journals/settings/ui/use-anchor-field.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
  type AnchorString,
} from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import { useAnchorField } from "./use-anchor-field";

describe("useAnchorField", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("getter", () => {
    it("maps an empty anchor to null", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      expect(field.value).toBeNull();
    });

    it("yields a DayPeriod when picking is day", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      expect(field.value?.kind).toBe("day");
    });

    it("yields a WeekPeriod when picking is week", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "week" });
      expect(field.value?.kind).toBe("week");
    });

    it("yields a MonthPeriod when picking is month", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "month" });
      expect(field.value?.kind).toBe("month");
    });

    it("yields a QuarterPeriod when picking is quarter", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "quarter" });
      expect(field.value?.kind).toBe("quarter");
    });

    it("yields a YearPeriod when picking is year", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "year" });
      expect(field.value?.kind).toBe("year");
    });
  });

  describe("setter", () => {
    it("clears the underlying anchor when assigned null", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      field.value = null;
      expect(anchor.value).toBe("");
    });

    it("writes period.anchor.toAnchor() to the anchor ref", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      field.value = DayPeriod.containing(date("2025-03-20"));
      expect(anchor.value).toBe("2025-03-20");
    });
  });

  describe("picking reactivity", () => {
    it("recomputes the period kind when picking changes", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const picking = ref<"day" | "week">("day");
      const field = useAnchorField({ anchor, picking });

      expect(field.value?.kind).toBe("day");
      picking.value = "week";
      expect(field.value?.kind).toBe("week");
    });
  });

  describe("cross-year week round-trip", () => {
    it("stores the locale doy-day for a week spanning year boundary and reads back the same anchor", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "week" });

      // ISO doy=4 → Thursday is the week-owner day
      field.value = WeekPeriod.containing(date("2025-12-30"));
      const stored = anchor.value;

      // Read it back via a fresh ref
      const reread = ref<AnchorString>(stored);
      const re = useAnchorField({ anchor: reread, picking: "week" });
      expect(re.value?.kind).toBe("week");

      // Writing the same period back yields the same stored anchor
      re.value = WeekPeriod.containing(date("2025-12-30"));
      expect(reread.value).toBe(stored);
    });
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
npm run test -- src/journals/settings/ui/use-anchor-field.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/journals/settings/ui/use-anchor-field.ts
import { computed, toValue, type MaybeRefOrGetter, type Ref, type WritableComputedRef } from "vue";
import { match } from "ts-pattern";

import {
  CalendarDate,
  DayPeriod,
  MonthPeriod,
  QuarterPeriod,
  WeekPeriod,
  YearPeriod,
  type AnchorString,
  type Period,
} from "@/calendar";

export type Picking = "day" | "week" | "month" | "quarter" | "year";

export function useAnchorField(opts: {
  anchor: Ref<AnchorString>;
  picking: MaybeRefOrGetter<Picking>;
}): WritableComputedRef<Period | null> {
  return computed({
    get: () => {
      const a = opts.anchor.value;
      if (!a) return null;
      const picking = toValue(opts.picking);
      const calendarDate = CalendarDate.fromAnchor(a);
      return periodContaining(picking, calendarDate);
    },
    set: (period) => {
      opts.anchor.value = (period ? period.anchor.toAnchor() : "") as AnchorString;
    },
  });
}

function periodContaining(picking: Picking, d: CalendarDate): Period {
  return match(picking)
    .with("day", () => DayPeriod.containing(d))
    .with("week", () => WeekPeriod.containing(d))
    .with("month", () => MonthPeriod.containing(d))
    .with("quarter", () => QuarterPeriod.containing(d))
    .with("year", () => YearPeriod.containing(d))
    .exhaustive();
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/journals/settings/ui/use-anchor-field.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/use-anchor-field.ts src/journals/settings/ui/use-anchor-field.test.ts
git commit -m "feat(journals): useAnchorField AnchorString-Period bridge"
```

---

### Task 18: Refactor `AddJournalModal.vue` to use `DatePicker`

**Files:**

- Modify: `src/journals/settings/ui/AddJournalModal.vue`
- Modify: `src/journals/settings/ui/AddJournalModal.test.ts`

- [ ] **Step 1: Read the current AddJournalModal**

```bash
cat src/journals/settings/ui/AddJournalModal.vue
```

Note the current vee-validate `anchorDate` field, the `anchorRegex` constant, the `m.journal_anchor_format_error()` reference, and the `<UiTextInput v-model="anchorDate" placeholder="YYYY-MM-DD">` markup.

- [ ] **Step 2: Update the tests first**

Open `src/journals/settings/ui/AddJournalModal.test.ts`. Delete any test that asserts "rejects invalid YYYY-MM-DD" or "format error" behavior for the anchor field. Add a single new test asserting that picking a date via `DatePicker` populates `config.anchorDate`. Render the modal with the same DI providers it already uses, plus a fake `ModalService` whose `open` returns an `AsyncResult` of a chosen `DayPeriod`. After clicking the picker trigger and waiting for the microtask, assert that submitting the form passes `{ anchorDate: "<the picked YYYY-MM-DD>" }` to whatever the modal's success path is.

If the existing test file uses a specific render helper or a specific way of asserting "what got submitted," follow that exact pattern. Do not invent a new harness.

- [ ] **Step 3: Run, expect new test failures**

```bash
npm run test -- src/journals/settings/ui/AddJournalModal.test.ts
```

- [ ] **Step 4: Update `AddJournalModal.vue`**

- Remove the `anchorRegex` constant and the `forEachPath(...)` super-refine for anchor format.
- Remove the `[anchorDate, anchorDateAttrs] = defineField("anchorDate")` (vee-validate still tracks the value, but it's no longer rendered via `UiTextInput`).
- Replace the `<UiTextInput v-model="anchorDate" v-bind="anchorDateAttrs" placeholder="YYYY-MM-DD" />` block with:

```vue
<DatePicker v-model="anchorDateModel" picking="day" />
```

- Add the binding:

```ts
import DatePicker from "@/calendar/ui/DatePicker.vue";
import { useAnchorField } from "./use-anchor-field";

const { value: anchorDateValue, setValue: setAnchorDate } = useField<string>("anchorDate"); // or use the existing defineField API equivalent

// Adapt to whichever vee-validate API the file already uses.
// The crucial behavior: anchorDateModel.set() writes back into the vee-validate field.
import { ref, watch } from "vue";

const anchorDateRef = ref<AnchorString>("" as AnchorString);
watch(anchorDateRef, (v) => setAnchorDate(v));
const anchorDateModel = useAnchorField({ anchor: anchorDateRef, picking: () => "day" });
```

The exact integration with vee-validate depends on the file's existing API usage. If `defineField` returns a getter/setter pair, you can wire them directly to a `Ref` and pass that ref into `useAnchorField`. The key contract: `useAnchorField`'s setter must end up writing into vee-validate's tracked value so submission still sees the picked date.

- Remove the field-level error display block (`<span v-for="error of errorBag.anchorDate" ...>`) — the picker can't produce an invalid AnchorString. Keep the schema-level required-when-custom error if present in the form description block.

- [ ] **Step 5: Run tests, expect pass**

```bash
npm run test -- src/journals/settings/ui/AddJournalModal.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui/AddJournalModal.vue src/journals/settings/ui/AddJournalModal.test.ts
git commit -m "refactor(journals): AddJournalModal uses DatePicker for anchorDate"
```

---

### Task 19: Refactor `JournalEditSubpage.vue` — `timeline.start`

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Read the current implementation**

```bash
grep -n "timeline.start\|UiTextInput.*timeline\|anchorRegex\|startError" src/journals/settings/ui/JournalEditSubpage.vue
```

Identify the `<UiTextInput v-model="config.timeline.start" ...>` block, the `startError` computed, and the `anchorRegex`.

- [ ] **Step 2: Update tests**

In `JournalEditSubpage.test.ts`, remove the "rejects invalid YYYY-MM-DD" assertion for `timeline.start`. Add: "selecting a date via the timeline-start picker writes the AnchorString back to config".

- [ ] **Step 3: Update the SFC**

Replace the `timeline.start` text input + trash button block. Add the picking derivation:

```ts
import type { AnchorString } from "@/calendar";
import { computed, toRef } from "vue";

import DatePicker from "@/calendar/ui/DatePicker.vue";
import { useAnchorField, type Picking } from "./use-anchor-field";

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);
const startAnchorRef = computed<AnchorString>({
  get: () => (config.value?.timeline.start ?? ("" as AnchorString)) as AnchorString,
  set: (v) => {
    if (config.value) config.value.timeline.start = v;
  },
});
const startModel = useAnchorField({ anchor: startAnchorRef, picking: startPicking });
```

Note: `useAnchorField` types its `anchor` as `Ref<AnchorString>`, but a `WritableComputedRef<AnchorString>` is structurally compatible. If TypeScript complains, wrap with `toRef(...)` or adjust `useAnchorField`'s signature to `Ref<AnchorString> | WritableComputedRef<AnchorString>`.

Template change:

```vue
<DatePicker v-model="startModel" :picking="startPicking" />
```

Remove the inline `startError` display when the picker is the only input. Keep the `<UiIconButton icon="trash">` next to it, but its click handler now becomes `() => { startModel.value = null }`.

If `config.write.type === "custom"`, the existing logic shows the locked custom anchor and skips rendering the picker — preserve that branch unchanged.

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): JournalEditSubpage.timeline.start uses DatePicker"
```

---

### Task 20: Refactor `JournalEditSubpage.vue` — `timeline.end.date` with bound from `timeline.start`

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Update tests**

Add tests:

- "selecting an end date via the picker writes back to `timeline.end.date`"
- "the end-date picker forbids dates before `timeline.start` (the prev button is hidden)"

Remove "rejects invalid YYYY-MM-DD" for end date.

- [ ] **Step 2: Update the SFC**

In the `v-if="config.timeline.end.kind === 'date'"` branch, replace the text input with:

```ts
import { CalendarDate, OpenInterval } from "@/calendar";

const endAnchorRef = computed<AnchorString>({
  get: () => (config.value?.timeline.end.kind === "date" ? config.value.timeline.end.date : ("" as AnchorString)),
  set: (v) => {
    if (config.value?.timeline.end.kind === "date") config.value.timeline.end.date = v;
  },
});
const endModel = useAnchorField({ anchor: endAnchorRef, picking: startPicking });

const endBounds = computed<OpenInterval | undefined>(() => {
  const start = config.value?.timeline.start;
  if (!start) return undefined;
  return OpenInterval.from(CalendarDate.fromAnchor(start));
});
```

Template:

```vue
<DatePicker v-model="endModel" :picking="startPicking" :bounds="endBounds" />
```

- [ ] **Step 3: Run tests, expect pass**

```bash
npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 4: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): JournalEditSubpage.timeline.end.date uses DatePicker"
```

---

### Task 21: Refactor `JournalEditSubpage.vue` — `numbering.anchorDate`

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Update tests**

Add: "selecting a numbering anchor via the picker writes back to `numbering.anchorDate`". Remove the regex-error case for that field.

- [ ] **Step 2: Update the SFC**

Same pattern:

```ts
const numberingAnchorRef = computed<AnchorString>({
  get: () => (config.value?.numbering.anchorDate ?? ("" as AnchorString)) as AnchorString,
  set: (v) => {
    if (config.value) config.value.numbering.anchorDate = v;
  },
});
const numberingAnchorModel = useAnchorField({ anchor: numberingAnchorRef, picking: startPicking });
```

Template (replacing the existing `<UiTextInput>` for `numbering.anchorDate`):

```vue
<DatePicker v-model="numberingAnchorModel" :picking="startPicking" />
```

- [ ] **Step 3: Run tests, expect pass**

```bash
npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts && npm run check:types && npm run check:lint
```

- [ ] **Step 4: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "refactor(journals): JournalEditSubpage.numbering.anchorDate uses DatePicker"
```

---

### Task 22: Remove unused i18n key and clean up `anchorRegex` constants

**Files:**

- Modify: `messages/en.json`
- Modify: any file still referencing the now-unused i18n keys or anchor regex

- [ ] **Step 1: Find remaining usages**

```bash
grep -rn "journal_anchor_format_error\|anchorRegex" src/
```

Expected: zero usages after Tasks 18–21. If anything remains, fix it (likely a stale import in `AddJournalModal.vue` or `JournalEditSubpage.vue`).

- [ ] **Step 2: Remove the i18n key**

In `messages/en.json`, delete the line:

```json
  "journal_anchor_format_error": "Date must be YYYY-MM-DD.",
```

If your project requires a paraglide recompile after editing messages, run it.

- [ ] **Step 3: Verify**

```bash
npm run check:types && npm run check:lint && npm run test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json
git commit -m "i18n(journals): drop unused journal_anchor_format_error"
```

---

### Task 23: Correct the spec — drop `YearPeriod.quarters()` from "Calendar-layer additions"

**Files:**

- Modify: `docs/superpowers/specs/2026-05-16-v3-calendar-ui-design.md`

- [ ] **Step 1: Update the spec**

Open the spec. Find the "Calendar-layer additions" section. The current text lists two additions:

1. `YearPeriod.quarters()` — **already exists** in `src/calendar/period-year.ts`.
2. `OpenInterval.overlapsPeriod(p: Period): boolean` — added in Task 1.

Replace the section body so only `OpenInterval.overlapsPeriod` remains as an addition. Adjust the surrounding prose accordingly (`This spec adds one method...` instead of `two methods...`).

- [ ] **Step 2: Verify the markdown still renders cleanly**

```bash
git diff docs/superpowers/specs/2026-05-16-v3-calendar-ui-design.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-v3-calendar-ui-design.md
git commit -m "docs(specs): correct calendar-ui spec; YearPeriod.quarters already existed"
```

---

### Task 24: Run the full test suite and smoke E2E

**Files:** none

- [ ] **Step 1: Run full tests**

```bash
npm run test && npm run check:types && npm run check:lint
```

Expected: all green.

- [ ] **Step 2: Run the e2e smoke suite (per `feedback_test_commands` — per-spec)**

```bash
npm run test:e2e:smoke
```

Expected: green. If a smoke flow exercises the journal create / edit forms, manually verify (locally, by loading the plugin into `test-vault`) that the picker opens, navigates, and writes the right `AnchorString` back into journal config.

- [ ] **Step 3: Final review pass**

Walk through each consumer call site by opening the test-vault, creating a journal with `write.type = "week"`, and confirming:

- The `timeline.start` picker opens at the week view.
- Clicking a week submits and stores the locale doy day as the anchor.
- The `timeline.end.date` picker hides "prev" once you'd step into a month entirely before `timeline.start`.

If anything is off, file follow-up tasks rather than amending in-flight commits.

---

## Self-Review (post-write)

**Spec coverage:**

- Date picker trigger → Task 14 ✓
- Modal shell (view state, descent, drill-up, nav) → Tasks 10–11 ✓
- Five granularity views → Tasks 5–9 ✓
- `CalendarGrid` primitive → Task 4 ✓
- `useCalendarGrid` composable → Task 3 ✓
- `useAnchorField` consumer-side bridge → Task 17 ✓
- `DatePickerInvariantError` → Task 2 ✓
- `OpenInterval.overlapsPeriod` (the one real calendar-layer add) → Task 1 ✓
- `YearPeriod.quarters` — already exists, spec-correction in Task 23 ✓
- `calendarUiModule` + `index.ts` → Task 15 ✓
- `main.ts` wiring → Task 16 ✓
- Consumer refactors (4 sites) → Tasks 18–21 ✓
- i18n cleanup → Tasks 12, 22 ✓
- Cross-year week round-trip regression test → Task 17, dedicated test ✓
- E2E smoke → Task 24 ✓

**Placeholder scan:** Two spots reference "adapt to project helper" / "adapt to whichever vee-validate API the file already uses" — these are intentional, not laziness: the harness name (`withServices` vs whatever the project actually exports) and vee-validate's field-API ergonomics differ across files in this repo, and the implementing engineer needs to read the existing code rather than blindly copy a template. Each such note tells the engineer what to read and what behavior to preserve. Not a TBD.

**Type consistency:** `Picking` is defined twice — once in `src/calendar/ui/errors.ts` (Task 2) and once in `src/journals/settings/ui/use-anchor-field.ts` (Task 17). Both have the same five string-literal members. This is intentional: each module owns its public surface and the two values are structurally compatible. If a future task adds a sixth picking value, both definitions must be updated together. (Acceptable cost for the boundary separation.)

`View` lives only in `src/calendar/ui/errors.ts` and `src/calendar/ui/descend.ts` imports it from there. ✓

`Period | null` v-model: consistent across `DatePicker`, `useAnchorField`, modal payload `selected`. ✓

`OpenInterval` as bounds: consistent across `DatePicker.bounds`, modal `bounds`, view `bounds` props, `useCalendarGrid.bounds`. ✓

Emit: each view's `select` event payload is the cell's concrete `Period` subtype (`DayPeriod`/`WeekPeriod`/`MonthPeriod`/`QuarterPeriod`/`YearPeriod`); modal forwards to `useModal<Period>().submit(...)` which is the discriminated union. ✓
