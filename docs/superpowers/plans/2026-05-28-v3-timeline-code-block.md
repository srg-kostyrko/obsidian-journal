# v3 Timeline Code Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v2 `calendar-timeline` code block to v3 with four modes (`week`, `month`, `quarter`, `calendar`/full year), built on the existing v3 `notes-calendar` infrastructure and a new pair of reusable notes-aware grid components.

**Architecture:** Add two reusable building blocks under `src/notes-calendar/ui/` (`NotesWeekView`, `NotesMonthView`) that render `NotesCalendarCell`s for day/week/month/quarter/year periods, scoped by shelf via `useShelfScope`, with their own `useCellDecorations` registration and an optional `#header` slot. Add a `src/code-blocks/timeline/` sub-folder with a valibot schema (`{ mode?, shelf? }`), a top-level `TimelineCodeBlock.vue` dispatcher that resolves journal/mode/shelf from the host note via `JournalsIndex` and `ShelvesRepository`, and four thin per-mode wrappers that compute the outer period (`WeekPeriod` / `MonthPeriod` / three `MonthPeriod`s of the quarter / twelve `MonthPeriod`s of the year) and render the new grids. Register the `calendar-timeline` key in `src/code-blocks/module.ts`.

**Tech Stack:** TypeScript, Vue 3 (SFC), valibot, vitest, `@testing-library/vue`, `@testing-library/user-event`, moment.js, ts-pattern, obsidian.

**Reference spec:** `docs/superpowers/specs/2026-05-28-v3-timeline-code-block-design.md`.

**Conventions in this repo (carry through every task):**

- Commit on the current branch (`v3-ai`); never create a new branch.
- Co-located tests: `*.test.ts` lives next to the implementation file.
- No `eslint-disable`. No `Co-Authored-By` trailer. No narrative file-header JSDoc.
- DI: prefer field initializers (`readonly #x = inject(...)`); omit `.lifetime(Lifetime.Container)`.
- Vue components: inline `defineProps<{...}>()`; tests use `@testing-library/vue` + `user-event`; never `@vue/test-utils`.
- Tests: one behavior per test; nested `describe`; black-box assertions (assert observable outcomes, not call counts).
- Discriminated-union dispatch: `match(...).with(...).exhaustive()` (ts-pattern), not `switch`.
- Verification before claiming a task done: `npm test`, `npm run check:types`, `npm run check:lint`.

---

## Task 1 — Add `NotesWeekView` to `notes-calendar/ui/`

Reusable week-row grid: a header row of period badges (month / quarter? / year) above a single row of day cells, with an optional leading week-number cell. The component owns its `useCellDecorations` registration for the visible window.

**Files:**

- Create: `src/notes-calendar/ui/NotesWeekView.vue`
- Create: `src/notes-calendar/ui/NotesWeekView.test.ts`
- Modify: `src/notes-calendar/index.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/notes-calendar/ui/NotesWeekView.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, WeekPeriod } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NotesService, WorkspaceService, type NotesEvents, type VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  OpenDateFlow,
  TimelineService,
  type JournalConfig,
  type JournalEntry,
  type JournalsEvents,
} from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { ActiveEntryViewModel } from "../active-entry";

import NotesWeekView from "./NotesWeekView.vue";

class FakeJournalsIndex {
  events = createNanoEvents();
  entryByPath() {
    return Option.none<JournalEntry>();
  }
  entryByAnchor() {
    return Option.none<JournalEntry>();
  }
  findNext() {
    return Option.none<VaultPath>();
  }
  findPrevious() {
    return Option.none<VaultPath>();
  }
}

class FakeWorkspace {
  events = createNanoEvents();
  openNote() {
    return AsyncResult.ok(undefined);
  }
  activeNote() {
    return Option.none<VaultPath>();
  }
  triggerHoverPreview() {}
  openFileMenu() {}
}

class FakeTimeline {
  contains() {
    return true;
  }
}

class FakeFlows {
  invoke() {
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

interface Harness {
  container: Container;
}

function buildHarness(journals: Record<string, JournalConfig>, shelves: Record<string, ShelfConfig>): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  container.register(JournalsRepository).useValue(JournalsRepository.fromParts(journals, journalsEvents));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  container.register(ShelvesEventsToken).useValue(shelvesEvents);
  container.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelves, shelvesEvents));
  container.register(JournalsIndex).useValue(new FakeJournalsIndex() as unknown as JournalsIndex);
  container.register(WorkspaceService).useValue(new FakeWorkspace() as unknown as WorkspaceService);
  container.register(TimelineService).useValue(new FakeTimeline() as unknown as TimelineService);
  container.register(Flows).useValue(new FakeFlows() as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  return { container };
}

function mount(h: Harness, props: { shelf: string | null; week: WeekPeriod }) {
  return render(NotesWeekView, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

const week = WeekPeriod.containing(CalendarDate.fromAnchor("2026-05-27" as never));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NotesWeekView", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("day cells", () => {
    it("renders one cell per day of the week", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      mount(h, { shelf: null, week });
      const expectedDays = [...week.days()].map((d) => d.format("D"));
      for (const label of expectedDays) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    });
  });

  describe("week-number cell", () => {
    it("renders the week-number cell when scope has a week journal", () => {
      const h = buildHarness(
        {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        {},
      );
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("omits the week-number cell when scope has no week journal", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", () => {
      const h = buildHarness({ monthly: fixedJournal("monthly", { type: "month" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", () => {
      const h = buildHarness({ yearly: fixedJournal("yearly", { type: "year" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", () => {
      const h = buildHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = render(NotesWeekView, {
        props: { shelf: null, week },
        slots: { header: "<div data-testid='custom-header'>X</div>" },
        global: {
          plugins: [
            {
              install(app) {
                provideInjectorOnApp(app, h.container);
              },
            },
          ],
        },
      });
      expect(container.querySelector('[data-testid="custom-header"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-month"]')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail because the file does not exist**

```bash
npm test -- src/notes-calendar/ui/NotesWeekView.test.ts
```

Expected: `Cannot find module './NotesWeekView.vue'`.

- [ ] **Step 3: Create the component**

Create `src/notes-calendar/ui/NotesWeekView.vue`:

```vue
<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod, MonthPeriod, QuarterPeriod, YearPeriod, type Period, type WeekPeriod } from "@/calendar";

import NotesCalendarCell from "./NotesCalendarCell.vue";
import { useShelfScope } from "../use-shelf-scope";
import { useNotesCell } from "../use-notes-cell";
import { useCellDecorations } from "@/decorations";

const props = defineProps<{
  shelf: string | null;
  week: WeekPeriod;
}>();

const scope = useShelfScope(() => props.shelf);

const dayCell = useNotesCell({ journalNames: () => scope.day.value });
const weekCell = useNotesCell({ journalNames: () => scope.week.value });
const monthCell = useNotesCell({ journalNames: () => scope.month.value });
const quarterCell = useNotesCell({ journalNames: () => scope.quarter.value });
const yearCell = useNotesCell({ journalNames: () => scope.year.value });

const rawWeek = computed(() => toRaw(props.week));
const days = computed(() => [...rawWeek.value.days()].map((d) => DayPeriod.containing(d)));
const monthPeriod = computed(() => MonthPeriod.containing(rawWeek.value.anchor));
const quarterPeriod = computed(() => QuarterPeriod.containing(rawWeek.value.anchor));
const yearPeriod = computed(() => YearPeriod.containing(rawWeek.value.anchor));
const showWeekNumber = computed(() => scope.week.value.length > 0);
const showQuarter = computed(() => scope.quarter.value.length > 0);

const allPeriods = computed<readonly Period[]>(() => {
  const periods: Period[] = [...days.value, monthPeriod.value, yearPeriod.value];
  if (showWeekNumber.value) periods.push(rawWeek.value);
  if (showQuarter.value) periods.push(quarterPeriod.value);
  return periods;
});

useCellDecorations(
  () => allPeriods.value,
  () => scope.all.value,
);
</script>

<template>
  <div class="notes-week-view">
    <div class="notes-week-view__header">
      <slot name="header">
        <NotesCalendarCell data-testid="header-month" :period="monthPeriod" :cell="monthCell" />
        <NotesCalendarCell
          v-if="showQuarter"
          data-testid="header-quarter"
          :period="quarterPeriod"
          :cell="quarterCell"
        />
        <NotesCalendarCell data-testid="header-year" :period="yearPeriod" :cell="yearCell" />
      </slot>
    </div>
    <div class="notes-week-view__row">
      <NotesCalendarCell
        v-if="showWeekNumber"
        data-testid="week-number-cell"
        class="notes-week-view__week-number"
        :period="rawWeek"
        :cell="weekCell"
      />
      <NotesCalendarCell v-for="day in days" :key="day.anchor.toAnchor()" :period="day" :cell="dayCell" />
    </div>
  </div>
</template>

<style scoped>
.notes-week-view {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-week-view__header {
  display: flex;
  justify-content: space-around;
  gap: var(--size-2-2);
}
.notes-week-view__row {
  display: flex;
  gap: var(--size-2-1);
}
.notes-week-view__row > * {
  flex: 1;
  text-align: center;
}
.notes-week-view__week-number {
  font-weight: var(--font-bold);
}
</style>
```

- [ ] **Step 4: Re-export the component from the notes-calendar barrel**

Modify `src/notes-calendar/index.ts` — append:

```ts
export { default as NotesWeekView } from "./ui/NotesWeekView.vue";
```

- [ ] **Step 5: Run the tests; expect all pass**

```bash
npm test -- src/notes-calendar/ui/NotesWeekView.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 6: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/ui/NotesWeekView.vue \
        src/notes-calendar/ui/NotesWeekView.test.ts \
        src/notes-calendar/index.ts
git commit -m "feat(notes-calendar): NotesWeekView"
```

---

## Task 2 — Add `NotesMonthView` to `notes-calendar/ui/`

Same shape as `NotesWeekView` but for a full month: header row + 6×7 day grid, optional leading week-number column, and a `hideOutsideDates` prop that marks cells outside the outer month inactive (used by quarter and calendar modes).

**Files:**

- Create: `src/notes-calendar/ui/NotesMonthView.vue`
- Create: `src/notes-calendar/ui/NotesMonthView.test.ts`
- Modify: `src/notes-calendar/index.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/notes-calendar/ui/NotesMonthView.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, MonthPeriod } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NotesService, WorkspaceService, type NotesEvents, type VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  OpenDateFlow,
  TimelineService,
  type JournalConfig,
  type JournalEntry,
  type JournalsEvents,
} from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { ActiveEntryViewModel } from "../active-entry";

import NotesMonthView from "./NotesMonthView.vue";

class FakeJournalsIndex {
  events = createNanoEvents();
  entryByPath() {
    return Option.none<JournalEntry>();
  }
  entryByAnchor() {
    return Option.none<JournalEntry>();
  }
  findNext() {
    return Option.none<VaultPath>();
  }
  findPrevious() {
    return Option.none<VaultPath>();
  }
}

class FakeWorkspace {
  events = createNanoEvents();
  openNote() {
    return AsyncResult.ok(undefined);
  }
  activeNote() {
    return Option.none<VaultPath>();
  }
  triggerHoverPreview() {}
  openFileMenu() {}
}

class FakeTimeline {
  contains() {
    return true;
  }
}

class FakeFlows {
  invoke() {
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

interface Harness {
  container: Container;
}

function buildHarness(journals: Record<string, JournalConfig>, shelves: Record<string, ShelfConfig>): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  container.register(JournalsRepository).useValue(JournalsRepository.fromParts(journals, journalsEvents));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  container.register(ShelvesEventsToken).useValue(shelvesEvents);
  container.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelves, shelvesEvents));
  container.register(JournalsIndex).useValue(new FakeJournalsIndex() as unknown as JournalsIndex);
  container.register(WorkspaceService).useValue(new FakeWorkspace() as unknown as WorkspaceService);
  container.register(TimelineService).useValue(new FakeTimeline() as unknown as TimelineService);
  container.register(Flows).useValue(new FakeFlows() as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  return { container };
}

function mount(h: Harness, props: { shelf: string | null; month: MonthPeriod; hideOutsideDates?: boolean }) {
  return render(NotesMonthView, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

const month = MonthPeriod.containing(CalendarDate.fromAnchor("2026-05-15" as never));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NotesMonthView", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("day grid", () => {
    it("renders one cell per day across the month's weeks", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, month });
      const allDayCells = container.querySelectorAll(".notes-month-view__day");
      // 6 weeks × 7 days = 42 day cells
      expect(allDayCells.length).toBe(42);
    });
  });

  describe("hideOutsideDates", () => {
    it("marks cells outside the outer month inactive when set", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, month, hideOutsideDates: true });
      const outside = container.querySelectorAll(".notes-month-view__day[data-outside]");
      expect(outside.length).toBeGreaterThan(0);
      for (const cell of outside) {
        expect((cell as HTMLElement).dataset.inactive).toBe("true");
      }
    });

    it("does not mark outside cells inactive when not set", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, month });
      const outside = container.querySelectorAll(".notes-month-view__day[data-outside]");
      for (const cell of outside) {
        expect((cell as HTMLElement).dataset.inactive).toBeUndefined();
      }
    });
  });

  describe("week-number column", () => {
    it("renders one week-number cell per row when scope has a week journal", () => {
      const h = buildHarness(
        {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        {},
      );
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
    });

    it("omits the week-number column when scope has no week journal", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });
  });

  describe("header badges", () => {
    it("renders the month and year header badges", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, month });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge only when scope has a quarter journal", () => {
      const h1 = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container: c1 } = mount(h1, { shelf: null, month });
      expect(c1.querySelector('[data-testid="header-quarter"]')).toBeNull();

      cleanup();

      const h2 = buildHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) }, {});
      const { container: c2 } = mount(h2, { shelf: null, month });
      expect(c2.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
npm test -- src/notes-calendar/ui/NotesMonthView.test.ts
```

Expected: `Cannot find module './NotesMonthView.vue'`.

- [ ] **Step 3: Create the component**

Create `src/notes-calendar/ui/NotesMonthView.vue`:

```vue
<script setup lang="ts">
import { computed, toRaw } from "vue";

import { DayPeriod, MonthPeriod, QuarterPeriod, YearPeriod, type Period } from "@/calendar";

import NotesCalendarCell from "./NotesCalendarCell.vue";
import { useShelfScope } from "../use-shelf-scope";
import { useNotesCell, type NotesCellApi } from "../use-notes-cell";
import { useCellDecorations } from "@/decorations";

const props = defineProps<{
  shelf: string | null;
  month: MonthPeriod;
  hideOutsideDates?: boolean;
}>();

const scope = useShelfScope(() => props.shelf);

const dayCell = useNotesCell({ journalNames: () => scope.day.value });
const weekCell = useNotesCell({ journalNames: () => scope.week.value });
const monthCellApi = useNotesCell({ journalNames: () => scope.month.value });
const quarterCellApi = useNotesCell({ journalNames: () => scope.quarter.value });
const yearCellApi = useNotesCell({ journalNames: () => scope.year.value });

const rawMonth = computed(() => toRaw(props.month));
const showWeekNumber = computed(() => scope.week.value.length > 0);
const showQuarter = computed(() => scope.quarter.value.length > 0);

interface WeekRow {
  readonly key: string;
  readonly weekPeriod: ReturnType<MonthPeriod["weeks"]> extends Iterable<infer W> ? W : never;
  readonly days: readonly { period: DayPeriod; isOutside: boolean }[];
}

const rows = computed<readonly WeekRow[]>(() => {
  const out: WeekRow[] = [];
  for (const week of rawMonth.value.weeks()) {
    const days = [...week.days()].map((d) => ({
      period: DayPeriod.containing(d),
      isOutside: !rawMonth.value.contains(d),
    }));
    out.push({ key: week.anchor.toAnchor(), weekPeriod: week, days });
  }
  return out;
});

const monthPeriod = computed(() => rawMonth.value);
const quarterPeriod = computed(() => QuarterPeriod.containing(rawMonth.value.anchor));
const yearPeriod = computed(() => YearPeriod.containing(rawMonth.value.anchor));

const visiblePeriods = computed<readonly Period[]>(() => {
  const periods: Period[] = [monthPeriod.value, yearPeriod.value];
  if (showQuarter.value) periods.push(quarterPeriod.value);
  for (const row of rows.value) {
    if (showWeekNumber.value) periods.push(row.weekPeriod);
    for (const d of row.days) periods.push(d.period);
  }
  return periods;
});

useCellDecorations(
  () => visiblePeriods.value,
  () => scope.all.value,
);

function inactiveCell(): NotesCellApi {
  return {
    open: () => undefined,
    openContextMenu: () => undefined,
    openPreview: () => undefined,
    isActive: () => false,
    isActionable: () => false,
  };
}

const inactiveDay = inactiveCell();
</script>

<template>
  <div class="notes-month-view">
    <div class="notes-month-view__header">
      <slot name="header">
        <NotesCalendarCell data-testid="header-month" :period="monthPeriod" :cell="monthCellApi" />
        <NotesCalendarCell
          v-if="showQuarter"
          data-testid="header-quarter"
          :period="quarterPeriod"
          :cell="quarterCellApi"
        />
        <NotesCalendarCell data-testid="header-year" :period="yearPeriod" :cell="yearCellApi" />
      </slot>
    </div>
    <div class="notes-month-view__grid" :data-with-weeks="showWeekNumber || null">
      <template v-for="row in rows" :key="row.key">
        <NotesCalendarCell
          v-if="showWeekNumber"
          data-testid="week-number-cell"
          class="notes-month-view__week-number"
          :period="row.weekPeriod"
          :cell="weekCell"
        />
        <NotesCalendarCell
          v-for="day in row.days"
          :key="day.period.anchor.toAnchor()"
          class="notes-month-view__day"
          :data-outside="day.isOutside || null"
          :period="day.period"
          :cell="hideOutsideDates && day.isOutside ? inactiveDay : dayCell"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.notes-month-view {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.notes-month-view__header {
  display: flex;
  justify-content: space-around;
  gap: var(--size-2-2);
}
.notes-month-view__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--size-2-1);
}
.notes-month-view__grid[data-with-weeks] {
  grid-template-columns: auto repeat(7, 1fr);
}
.notes-month-view__week-number {
  font-weight: var(--font-bold);
}
.notes-month-view__day[data-outside] {
  color: var(--text-muted);
}
</style>
```

- [ ] **Step 4: Re-export from notes-calendar barrel**

Modify `src/notes-calendar/index.ts` — append:

```ts
export { default as NotesMonthView } from "./ui/NotesMonthView.vue";
```

- [ ] **Step 5: Run the tests; expect all pass**

```bash
npm test -- src/notes-calendar/ui/NotesMonthView.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 6: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/ui/NotesMonthView.vue \
        src/notes-calendar/ui/NotesMonthView.test.ts \
        src/notes-calendar/index.ts
git commit -m "feat(notes-calendar): NotesMonthView"
```

---

## Task 3 — Add the `timeline` block schema

Pure valibot schema; no Vue, no DI.

**Files:**

- Create: `src/code-blocks/timeline/timeline-config.ts`
- Create: `src/code-blocks/timeline/timeline-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/timeline/timeline-config.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
import * as v from "valibot";

import { timelineBlockSchema, type TimelineBlockConfig, type TimelineMode } from "./timeline-config";

describe("timelineBlockSchema", () => {
  it("accepts an empty object", () => {
    const result = v.safeParse(timelineBlockSchema, {});
    expect(result.success).toBe(true);
    if (result.success) expect(result.output).toEqual({});
  });

  it("accepts each valid mode value", () => {
    for (const mode of ["week", "month", "quarter", "calendar"] as const) {
      const result = v.safeParse(timelineBlockSchema, { mode });
      expect(result.success).toBe(true);
      if (result.success) expect(result.output.mode).toBe(mode);
    }
  });

  it("rejects an unknown mode value", () => {
    const result = v.safeParse(timelineBlockSchema, { mode: "decade" });
    expect(result.success).toBe(false);
  });

  it("accepts a shelf string", () => {
    const result = v.safeParse(timelineBlockSchema, { shelf: "work" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.output.shelf).toBe("work");
  });

  it("infers TimelineMode as the picklist union", () => {
    expectTypeOf<TimelineMode>().toEqualTypeOf<"week" | "month" | "quarter" | "calendar">();
  });

  it("infers TimelineBlockConfig with optional fields", () => {
    expectTypeOf<TimelineBlockConfig>().toEqualTypeOf<{
      mode?: TimelineMode | undefined;
      shelf?: string | undefined;
    }>();
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
npm test -- src/code-blocks/timeline/timeline-config.test.ts
```

Expected: `Cannot find module './timeline-config'`.

- [ ] **Step 3: Create the schema file**

Create `src/code-blocks/timeline/timeline-config.ts`:

```ts
import * as v from "valibot";

const timelineModeSchema = v.picklist(["week", "month", "quarter", "calendar"] as const);

export const timelineBlockSchema = v.object({
  mode: v.optional(timelineModeSchema),
  shelf: v.optional(v.string()),
});

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
export type TimelineMode = v.InferOutput<typeof timelineModeSchema>;
```

- [ ] **Step 4: Run the test; expect all pass**

```bash
npm test -- src/code-blocks/timeline/timeline-config.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/code-blocks/timeline/timeline-config.ts \
        src/code-blocks/timeline/timeline-config.test.ts
git commit -m "feat(timeline-block): config schema"
```

---

## Task 4 — Add the per-mode wrapper components

Four thin wrappers, each receiving `refDate` + `shelf` from the dispatcher and rendering `NotesWeekView` or `NotesMonthView` for the right outer period. No tests per the spec (no-wiring-tests rule).

**Files:**

- Create: `src/code-blocks/timeline/ui/TimelineWeek.vue`
- Create: `src/code-blocks/timeline/ui/TimelineMonth.vue`
- Create: `src/code-blocks/timeline/ui/TimelineQuarter.vue`
- Create: `src/code-blocks/timeline/ui/TimelineCalendar.vue`

- [ ] **Step 1: Create `TimelineWeek.vue`**

Create `src/code-blocks/timeline/ui/TimelineWeek.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, WeekPeriod, type AnchorString } from "@/calendar";
import { NotesWeekView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
}>();

const week = computed(() => WeekPeriod.containing(CalendarDate.fromAnchor(props.refDate)));
</script>

<template>
  <div class="timeline-week">
    <NotesWeekView :shelf :week />
  </div>
</template>

<style scoped>
.timeline-week {
  display: flex;
  justify-content: center;
}
.timeline-week > * {
  width: 400px;
}
</style>
```

- [ ] **Step 2: Create `TimelineMonth.vue`**

Create `src/code-blocks/timeline/ui/TimelineMonth.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, type AnchorString } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
}>();

const month = computed(() => MonthPeriod.containing(CalendarDate.fromAnchor(props.refDate)));
</script>

<template>
  <div class="timeline-month">
    <NotesMonthView :shelf :month />
  </div>
</template>

<style scoped>
.timeline-month {
  display: flex;
  justify-content: center;
}
.timeline-month > * {
  width: 400px;
}
</style>
```

- [ ] **Step 3: Create `TimelineQuarter.vue`**

Create `src/code-blocks/timeline/ui/TimelineQuarter.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, QuarterPeriod, type AnchorString, type MonthPeriod } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
}>();

const months = computed<readonly MonthPeriod[]>(() => {
  const quarter = QuarterPeriod.containing(CalendarDate.fromAnchor(props.refDate));
  return [...quarter.months()];
});
</script>

<template>
  <div class="timeline-quarter-container">
    <div class="timeline-quarter">
      <NotesMonthView v-for="month in months" :key="month.anchor.toAnchor()" :shelf :month hide-outside-dates />
    </div>
  </div>
</template>

<style scoped>
.timeline-quarter-container {
  container-type: inline-size;
}
.timeline-quarter {
  --gap: var(--size-4-4);
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(1, 1fr);
}
@container (min-width: 420px) {
  .timeline-quarter {
    grid-template-columns: repeat(2, 1fr);
  }
}
@container (min-width: 630px) {
  .timeline-quarter {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
```

- [ ] **Step 4: Create `TimelineCalendar.vue`**

Create `src/code-blocks/timeline/ui/TimelineCalendar.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, YearPeriod, type AnchorString, type MonthPeriod } from "@/calendar";
import { NotesMonthView } from "@/notes-calendar";

const props = defineProps<{
  refDate: AnchorString;
  shelf: string | null;
}>();

const months = computed<readonly MonthPeriod[]>(() => {
  const year = YearPeriod.containing(CalendarDate.fromAnchor(props.refDate));
  return [...year.months()];
});
</script>

<template>
  <div class="timeline-calendar-container">
    <div class="timeline-calendar">
      <NotesMonthView v-for="month in months" :key="month.anchor.toAnchor()" :shelf :month hide-outside-dates />
    </div>
  </div>
</template>

<style scoped>
.timeline-calendar-container {
  container-type: inline-size;
}
.timeline-calendar {
  --gap: var(--size-4-4);
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(1, 1fr);
}
@container (min-width: 420px) {
  .timeline-calendar {
    grid-template-columns: repeat(2, 1fr);
  }
}
@container (min-width: 630px) {
  .timeline-calendar {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
```

- [ ] **Step 5: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green. (Test suite isn't expected to add any new tests for these wrappers — see no-wiring-tests rule.)

- [ ] **Step 6: Commit**

```bash
git add src/code-blocks/timeline/ui/TimelineWeek.vue \
        src/code-blocks/timeline/ui/TimelineMonth.vue \
        src/code-blocks/timeline/ui/TimelineQuarter.vue \
        src/code-blocks/timeline/ui/TimelineCalendar.vue
git commit -m "feat(timeline-block): per-mode wrappers"
```

---

## Task 5 — Add the top-level `TimelineCodeBlock.vue` dispatcher

Resolves the journal/shelf/mode from `path` and `config`, then dispatches on `mode` via `ts-pattern`.

**Files:**

- Create: `src/code-blocks/timeline/ui/TimelineCodeBlock.vue`
- Create: `src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NotesService, WorkspaceService, type NotesEvents, type VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  OpenDateFlow,
  TimelineService,
  type JournalConfig,
  type JournalEntry,
  type JournalsEvents,
} from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { ActiveEntryViewModel } from "@/notes-calendar";

import TimelineCodeBlock from "./TimelineCodeBlock.vue";

class FakeJournalsIndex {
  byPath = new Map<string, JournalEntry>();
  events = createNanoEvents();
  entryByPath(path: string) {
    return Option.fromNullable(this.byPath.get(path));
  }
  entryByAnchor() {
    return Option.none<JournalEntry>();
  }
  findNext() {
    return Option.none<VaultPath>();
  }
  findPrevious() {
    return Option.none<VaultPath>();
  }
}

class FakeWorkspace {
  events = createNanoEvents();
  openNote() {
    return AsyncResult.ok(undefined);
  }
  activeNote() {
    return Option.none<VaultPath>();
  }
  triggerHoverPreview() {}
  openFileMenu() {}
}

class FakeTimeline {
  contains() {
    return true;
  }
}

class FakeFlows {
  invoke() {
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

interface Harness {
  container: Container;
  index: FakeJournalsIndex;
}

function buildHarness(journals: Record<string, JournalConfig>, shelves: Record<string, ShelfConfig> = {}): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  container.register(JournalsRepository).useValue(JournalsRepository.fromParts(journals, journalsEvents));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  container.register(ShelvesEventsToken).useValue(shelvesEvents);
  container.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelves, shelvesEvents));
  const index = new FakeJournalsIndex();
  container.register(JournalsIndex).useValue(index as unknown as JournalsIndex);
  container.register(WorkspaceService).useValue(new FakeWorkspace() as unknown as WorkspaceService);
  container.register(TimelineService).useValue(new FakeTimeline() as unknown as TimelineService);
  container.register(Flows).useValue(new FakeFlows() as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  return { container, index };
}

function mount(h: Harness, props: { path: string; config: { mode?: string; shelf?: string } }) {
  return render(TimelineCodeBlock, {
    props: { path: props.path as VaultPath, config: props.config },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("TimelineCodeBlock — mode derivation", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  it("derives 'week' mode when the host journal is a day journal", () => {
    const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Daily/2026-05-27.md", config: {} });
    expect(container.querySelector(".timeline-week")).toBeTruthy();
  });

  it("derives 'week' mode when the host journal is a week journal", () => {
    const h = buildHarness({ weekly: fixedJournal("weekly", { type: "week" }) });
    h.index.byPath.set("Weekly/2026-W21.md", {
      journalName: "weekly",
      anchor: "2026-05-25" as AnchorString,
      path: "Weekly/2026-W21.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Weekly/2026-W21.md", config: {} });
    expect(container.querySelector(".timeline-week")).toBeTruthy();
  });

  it("derives 'month' mode when the host journal is a month journal", () => {
    const h = buildHarness({ monthly: fixedJournal("monthly", { type: "month" }) });
    h.index.byPath.set("Monthly/2026-05.md", {
      journalName: "monthly",
      anchor: "2026-05-01" as AnchorString,
      path: "Monthly/2026-05.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Monthly/2026-05.md", config: {} });
    expect(container.querySelector(".timeline-month")).toBeTruthy();
  });

  it("derives 'quarter' mode when the host journal is a quarter journal", () => {
    const h = buildHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) });
    h.index.byPath.set("Quarterly/2026-Q2.md", {
      journalName: "quarterly",
      anchor: "2026-04-01" as AnchorString,
      path: "Quarterly/2026-Q2.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Quarterly/2026-Q2.md", config: {} });
    expect(container.querySelector(".timeline-quarter")).toBeTruthy();
  });

  it("derives 'calendar' mode when the host journal is a year journal", () => {
    const h = buildHarness({ yearly: fixedJournal("yearly", { type: "year" }) });
    h.index.byPath.set("Yearly/2026.md", {
      journalName: "yearly",
      anchor: "2026-01-01" as AnchorString,
      path: "Yearly/2026.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Yearly/2026.md", config: {} });
    expect(container.querySelector(".timeline-calendar")).toBeTruthy();
  });

  it("uses config.mode over the derived mode", () => {
    const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    const { container } = mount(h, { path: "Daily/2026-05-27.md", config: { mode: "month" } });
    expect(container.querySelector(".timeline-month")).toBeTruthy();
    expect(container.querySelector(".timeline-week")).toBeNull();
  });

  it("falls back to 'week' when the host note is not connected to any journal", () => {
    const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) });
    const { container } = mount(h, { path: "Random/Note.md", config: {} });
    expect(container.querySelector(".timeline-week")).toBeTruthy();
  });
});

describe("TimelineCodeBlock — shelf derivation", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  it("derives the shelf from the host journal when config.shelf is absent", () => {
    const h = buildHarness(
      {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
        otherDaily: fixedJournal("otherDaily", { type: "day" }),
      },
      {
        work: { name: "work", journals: ["daily", "weekly"] },
        home: { name: "home", journals: ["otherDaily"] },
      },
    );
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, { path: "Daily/2026-05-27.md", config: {} });
    // 'work' shelf has a weekly journal, so the week-number cell renders
    expect(screen.getAllByTestId("week-number-cell").length).toBeGreaterThan(0);
  });

  it("uses config.shelf over the derived shelf", () => {
    const h = buildHarness(
      {
        daily: fixedJournal("daily", { type: "day" }),
        otherWeekly: fixedJournal("otherWeekly", { type: "week" }),
      },
      {
        work: { name: "work", journals: ["daily"] },
        home: { name: "home", journals: ["otherWeekly"] },
      },
    );
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, { path: "Daily/2026-05-27.md", config: { shelf: "home" } });
    // 'home' shelf has the weekly journal, so the week-number cell renders
    expect(screen.getAllByTestId("week-number-cell").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
npm test -- src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts
```

Expected: `Cannot find module './TimelineCodeBlock.vue'`.

- [ ] **Step 3: Create the dispatcher component**

Create `src/code-blocks/timeline/ui/TimelineCodeBlock.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import { match } from "ts-pattern";

import { Clock, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { type CodeBlockProps } from "@/infrastructure/host";
import { JournalsRepository, JournalsIndex, type JournalConfig } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import TimelineCalendar from "./TimelineCalendar.vue";
import TimelineMonth from "./TimelineMonth.vue";
import TimelineQuarter from "./TimelineQuarter.vue";
import TimelineWeek from "./TimelineWeek.vue";

import type { TimelineBlockConfig, TimelineMode } from "../timeline-config";

const { path, config } = defineProps<CodeBlockProps<TimelineBlockConfig>>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const shelves = useService(ShelvesRepository);

const entry = computed(() => index.entryByPath(path));

const journal = computed<JournalConfig | null>(() =>
  entry.value.flatMap((e) => journals.get(e.journalName)).getOr(null as unknown as JournalConfig),
);

const refDate = computed<AnchorString>(() =>
  entry.value.match({
    some: (e) => e.anchor,
    none: () => Clock.now().format("YYYY-MM-DD") as AnchorString,
  }),
);

const derivedMode = computed<TimelineMode>(() => {
  const j = journal.value;
  if (!j) return "week";
  return match(j.write.type)
    .with("day", "week", () => "week" as const)
    .with("month", () => "month" as const)
    .with("quarter", () => "quarter" as const)
    .with("year", () => "calendar" as const)
    .with("custom", () => "week" as const)
    .exhaustive();
});

const mode = computed<TimelineMode>(() => config.mode ?? derivedMode.value);

const derivedShelf = computed<string | null>(() => {
  const j = journal.value;
  if (!j) return null;
  const owning = [...shelves.find().list()].find((shelf) => shelf.journals.includes(j.name));
  return owning?.name ?? null;
});

const shelf = computed<string | null>(() => (config.shelf !== undefined ? config.shelf : derivedShelf.value));
</script>

<template>
  <TimelineWeek v-if="mode === 'week'" :ref-date="refDate" :shelf="shelf" />
  <TimelineMonth v-else-if="mode === 'month'" :ref-date="refDate" :shelf="shelf" />
  <TimelineQuarter v-else-if="mode === 'quarter'" :ref-date="refDate" :shelf="shelf" />
  <TimelineCalendar v-else :ref-date="refDate" :shelf="shelf" />
</template>
```

- [ ] **Step 4: Run the test; expect all pass**

```bash
npm test -- src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/code-blocks/timeline/ui/TimelineCodeBlock.vue \
        src/code-blocks/timeline/ui/TimelineCodeBlock.test.ts
git commit -m "feat(timeline-block): top-level dispatcher"
```

---

## Task 6 — Define and register the `calendar-timeline` code block

Wire the new definition into the existing code-blocks module so the markdown processor for `calendar-timeline` is registered at boot.

**Files:**

- Create: `src/code-blocks/timeline/timeline-block.ts`
- Modify: `src/code-blocks/module.ts`

- [ ] **Step 1: Create the definition**

Create `src/code-blocks/timeline/timeline-block.ts`:

```ts
import { defineCodeBlock } from "@/infrastructure/host";

import { timelineBlockSchema } from "./timeline-config";
import TimelineCodeBlock from "./ui/TimelineCodeBlock.vue";

export const timelineCodeBlock = defineCodeBlock({
  keys: ["calendar-timeline"],
  schema: timelineBlockSchema,
  component: TimelineCodeBlock,
  cssClass: ["journal-timeline-code-block"],
});
```

- [ ] **Step 2: Register in the code-blocks module**

Modify `src/code-blocks/module.ts` — add the import and the registration:

```ts
import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";
import { navigationCodeBlock } from "./nav/nav-block";
import { timelineCodeBlock } from "./timeline/timeline-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(timelineCodeBlock);
  },
};
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all green; new tests from Tasks 1, 2, 3, 5 included.

- [ ] **Step 4: Verify type-check and lint**

```bash
npm run check:types && npm run check:lint
```

Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/timeline/timeline-block.ts \
        src/code-blocks/module.ts
git commit -m "feat(timeline-block): register calendar-timeline code block"
```

---

## Final verification

After Task 6 is committed, run all quality gates once more and confirm:

- [ ] `npm test` — full suite green
- [ ] `npm run check:types` — green
- [ ] `npm run check:lint` — green
- [ ] `git log --oneline -7` shows six new commits in order (`NotesWeekView`, `NotesMonthView`, `config schema`, `per-mode wrappers`, `top-level dispatcher`, `register calendar-timeline code block`).

If anything's off (a test failure, lint complaint, or missing commit), fix on the current branch with a follow-up commit — do not amend earlier commits.
