# Calendar Period Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@/calendar` a small set of period operations — a kind→period factory and Self-preserving traversal — and route the five hand-rolled dispatch sites through them.

**Architecture:** Three pure functions in `src/calendar/period.ts`: `periodOfKind(kind, date)` (a `Record<PeriodKind, …>` lookup table returning the real `Period` union), and generic `advance(period, steps)` / `window(focus, before, after)` built on the existing `next()`/`previous()`. Callers that key on a narrower vocabulary (`ButtonLevel`, `JournalWrite`, custom-intervals config) map to `PeriodKind` at their own edge. `cycle.ts` deletes its private duck-typed `PERIOD_CTORS`/`PeriodLike` and consumes the export; `period-for-journal` keeps its own `match(write)` (the `custom → day` rule is real domain logic — not fused).

**Tech Stack:** TypeScript, Vitest, ts-pattern, valibot, Vue 3 SFCs. Quality gate every task: `npm run test`, `npm run check:types`, `npm run check:lint`.

**Domain vocabulary:** see `CONTEXT.md` → _Calendar periods_ (`periodOfKind`, _period window_, `advance`).

---

## File structure

| File                                                                  | Responsibility                     | Change                                                       |
| --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `src/calendar/period.ts`                                              | period vocabulary + operations     | **add** `periodOfKind`, `advance`, `window`                  |
| `src/calendar/period.test.ts`                                         | interface tests for the operations | **create**                                                   |
| `src/calendar/index.ts`                                               | barrel                             | **export** the three functions                               |
| `src/journals/cycle.ts`                                               | journal cycle engine               | **delete** `PeriodLike` + `PERIOD_CTORS`; use `periodOfKind` |
| `src/code-blocks/nav/period-for-journal.ts`                           | write→period (keeps `custom→day`)  | arms call `periodOfKind`                                     |
| `src/views/toolbar-items/button/ui/ButtonItem.vue`                    | toolbar button                     | `periodFor`→`periodOfKind`; step loop→`advance`              |
| `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`     | period badges                      | `XxxPeriod.containing`→`periodOfKind`                        |
| `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`           | month grid                         | window loop→`window()`                                       |
| `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`             | week grid                          | window loop→`window()`                                       |
| `src/views/blocks/custom-intervals/custom-intervals-block.ts`         | block schema                       | `window` field → `PeriodKind` subset + legacy transform      |
| `src/views/blocks/custom-intervals/window-resolution.ts`              | window→range                       | `periodOfKind`; `WindowKind`→subset                          |
| `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue` | config dropdown                    | option values `current-*`→bare                               |
| custom-intervals `*.test.ts` (×3)                                     | block tests                        | update fixtures; add legacy-parse test                       |

---

## Task 1: `periodOfKind` factory

**Files:**

- Modify: `src/calendar/period.ts`
- Modify: `src/calendar/index.ts`
- Test: `src/calendar/period.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/calendar/period.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { periodOfKind } from "./period";
import { periodKinds } from "./period";
import { date, installTestCalendar } from "./testing";

describe("periodOfKind", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns a period tagged with the requested kind", () => {
    for (const kind of periodKinds) {
      expect(periodOfKind(kind, date("2025-03-14")).kind).toBe(kind);
    }
  });

  it("returns the period containing the given date", () => {
    expect(periodOfKind("month", date("2025-03-14")).start.toAnchor()).toBe("2025-03-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/calendar/period.test.ts`
Expected: FAIL — `periodOfKind` is not exported by `./period`.

- [ ] **Step 3: Write minimal implementation**

In `src/calendar/period.ts`, change the concrete-period imports from type-only to value imports and add the factory. Replace the existing import block:

```ts
import type { CalendarDate } from "./calendar-date";
import type { DayPeriod } from "./period-day";
import type { DecadePeriod } from "./period-decade";
import type { MonthPeriod } from "./period-month";
import type { QuarterPeriod } from "./period-quarter";
import type { WeekPeriod } from "./period-week";
import type { YearPeriod } from "./period-year";
```

with:

```ts
import { DayPeriod } from "./period-day";
import { DecadePeriod } from "./period-decade";
import { MonthPeriod } from "./period-month";
import { QuarterPeriod } from "./period-quarter";
import { WeekPeriod } from "./period-week";
import { YearPeriod } from "./period-year";

import type { CalendarDate } from "./calendar-date";
```

Then, below the `Period` type alias at the bottom of the file, add:

```ts
const PERIOD_OF_KIND: Record<PeriodKind, (date: CalendarDate) => Period> = {
  day: (d) => DayPeriod.containing(d),
  week: (d) => WeekPeriod.containing(d),
  month: (d) => MonthPeriod.containing(d),
  quarter: (d) => QuarterPeriod.containing(d),
  year: (d) => YearPeriod.containing(d),
  decade: (d) => DecadePeriod.containing(d),
};

export function periodOfKind(kind: PeriodKind, date: CalendarDate): Period {
  return PERIOD_OF_KIND[kind](date);
}
```

> Note: the classes are referenced only inside the closures, so the value imports are accessed lazily — no module-init ordering hazard, and `period-*.ts` import `PeriodBase` type-only so there is no runtime cycle back into `period.ts`.

- [ ] **Step 4: Add the barrel export**

In `src/calendar/index.ts`, change the line:

```ts
export { periodKinds, type Period, type PeriodKind, type PeriodBase } from "./period";
```

to:

```ts
export { periodKinds, periodOfKind, type Period, type PeriodKind, type PeriodBase } from "./period";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/calendar/period.test.ts`
Expected: PASS (both `periodOfKind` tests).

- [ ] **Step 6: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/calendar/period.ts src/calendar/period.test.ts src/calendar/index.ts
git commit -m "feat(calendar): add periodOfKind factory"
```

---

## Task 2: `advance` + `window` traversal

**Files:**

- Modify: `src/calendar/period.ts`
- Modify: `src/calendar/index.ts`
- Test: `src/calendar/period.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calendar/period.test.ts` (inside the top-level, after the `periodOfKind` block):

```ts
describe("advance", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns the same period for zero steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, 0).start.toAnchor()).toBe("2025-03-01");
  });

  it("steps forward for positive steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, 2).start.toAnchor()).toBe("2025-05-01");
  });

  it("steps backward for negative steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, -2).start.toAnchor()).toBe("2025-01-01");
  });
});

describe("window", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns before + after + 1 periods", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1)).toHaveLength(4);
  });

  it("places the focus at index `before`", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1)[2].start.toAnchor()).toBe("2025-03-01");
  });

  it("spans from `before` prior to `after` after, in order", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1).map((p) => p.start.toAnchor())).toEqual([
      "2025-01-01",
      "2025-02-01",
      "2025-03-01",
      "2025-04-01",
    ]);
  });

  it("returns just the focus for a zero window", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 0, 0).map((p) => p.start.toAnchor())).toEqual(["2025-03-01"]);
  });
});
```

Add `advance, window` to the existing import from `./period` at the top of the file:

```ts
import { advance, periodOfKind, window } from "./period";
```

(Remove the now-duplicate `periodOfKind` import line from Task 1 — keep a single combined import. Leave the separate `import { periodKinds } from "./period";` line as-is or merge it in too.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/calendar/period.test.ts`
Expected: FAIL — `advance` / `window` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/calendar/period.ts`, add (after `periodOfKind`):

```ts
export function advance<P extends PeriodBase<P>>(period: P, steps: number): P {
  let cursor = period;
  const magnitude = Math.abs(steps);
  for (let i = 0; i < magnitude; i += 1) {
    cursor = steps < 0 ? cursor.previous() : cursor.next();
  }
  return cursor;
}

export function window<P extends PeriodBase<P>>(focus: P, before: number, after: number): P[] {
  const out: P[] = [];
  let cursor = advance(focus, -before);
  for (let i = 0; i < before + after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
}
```

- [ ] **Step 4: Add the barrel exports**

In `src/calendar/index.ts`, update the period export line to:

```ts
export { advance, periodKinds, periodOfKind, window, type Period, type PeriodKind, type PeriodBase } from "./period";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/calendar/period.test.ts`
Expected: PASS (all `advance` and `window` tests).

- [ ] **Step 6: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/calendar/period.ts src/calendar/period.test.ts src/calendar/index.ts
git commit -m "feat(calendar): add Self-preserving advance and window"
```

---

## Task 3: Consolidate `cycle.ts` onto `periodOfKind`

The journal cycle engine already grew this factory privately (`PERIOD_CTORS`) typed against a duck-typed `PeriodLike`. Replace it with the real export. Behavior must be identical — the existing `cycle.test.ts` is the safety net.

**Files:**

- Modify: `src/journals/cycle.ts`
- Test: `src/journals/cycle.test.ts` (existing — run unchanged)

- [ ] **Step 1: Run the existing cycle tests (green baseline)**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: PASS. This is the regression baseline for this task.

- [ ] **Step 2: Replace the private table with the export**

In `src/journals/cycle.ts`:

a) Update the calendar import (line 3-4). Replace:

```ts
import { CalendarDate, DayPeriod, DecadePeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString, PeriodKind } from "@/calendar";
```

with:

```ts
import { CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar";
```

b) Delete the `PeriodLike` interface and the `PERIOD_CTORS` constant (the `interface PeriodLike { … }` block and `const PERIOD_CTORS: Record<PeriodKind, …> = { … };`).

c) Replace every `PERIOD_CTORS[c.period](X)` with `periodOfKind(c.period, X)`. There are four occurrences:

- `anchorOf`: `const period = PERIOD_CTORS[c.period](date);` → `const period = periodOfKind(c.period, date);`
- `nextAnchor`: `const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));` → `const period = periodOfKind(c.period, CalendarDate.fromAnchor(from));`
- `previousAnchor`: same shape as `nextAnchor` → `periodOfKind(c.period, CalendarDate.fromAnchor(from))`
- `startOf`: `PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor)).start` → `periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).start`
- `endOf`: `PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor)).end` → `periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).end`

> `c.period` is a `MomentDurationUnit` (`day|week|month|quarter|year`), a subset of `PeriodKind`, so it is assignable to `periodOfKind`'s first parameter with no cast. `.next()`/`.previous()`/`.start`/`.end`/`.anchor` are all on `PeriodBase`, so the real `Period` union satisfies every call site the old `PeriodLike` did.

- [ ] **Step 3: Run the cycle tests to verify unchanged behavior**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: PASS (same set as Step 1 — behavior preserved).

- [ ] **Step 4: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. (`check:types` confirms `PeriodKind` is no longer an unused import.)

- [ ] **Step 5: Commit**

```bash
git add src/journals/cycle.ts
git commit -m "refactor(journals): consume calendar periodOfKind in cycle engine"
```

---

## Task 4: `ButtonItem.vue` — drop the `as Period` casts

**Files:**

- Modify: `src/views/toolbar-items/button/ui/ButtonItem.vue`

There are no unit tests for this SFC; `check:types` + the integration via `views` tests guard it. The change is mechanical and type-narrowing.

- [ ] **Step 1: Replace `periodFor` and its imports**

a) Update imports (lines 6-7). Replace:

```ts
import { CalendarDate, DayPeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString, Period } from "@/calendar";
```

with:

```ts
import { advance, CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar";
```

b) Replace the `periodFor` function:

```ts
function periodFor(level: ButtonLevel, date: CalendarDate): Period {
  return match(level)
    .with("day", () => DayPeriod.containing(date) as Period)
    .with("week", () => WeekPeriod.containing(date) as Period)
    .with("month", () => MonthPeriod.containing(date) as Period)
    .with("quarter", () => QuarterPeriod.containing(date) as Period)
    .with("year", () => YearPeriod.containing(date) as Period)
    .exhaustive();
}
```

with:

```ts
function periodFor(level: ButtonLevel, date: CalendarDate): Period {
  return periodOfKind(level, date);
}
```

> Keep `import type { Period }`? No — `Period` is now only the return annotation of `periodFor`. Drop the explicit annotation and the import: change the signature to `function periodFor(level: ButtonLevel, date: CalendarDate)` and let it infer `Period`. (Removed from the import in step (a).) `ButtonLevel` (`day|week|month|quarter|year`) is assignable to `PeriodKind`.

- [ ] **Step 2: Replace the navigate-step loop**

In the `fire` function's `navigate-step` arm, replace:

```ts
    .with({ type: "navigate-step" }, (action) => {
      const date = CalendarDate.fromAnchor(context.refDate.value);
      let cursor = periodFor(action.unit, date);
      const direction = match(action.direction)
        .with("prev", () => -1)
        .with("next", () => 1)
        .exhaustive();
      const amount = action.amount;
      for (let index = 0; index < amount; index += 1) {
        cursor = direction < 0 ? (cursor as { previous(): Period }).previous() : (cursor as { next(): Period }).next();
      }
      context.setRefDate(cursor.anchor.toAnchor());
    })
```

with:

```ts
    .with({ type: "navigate-step" }, (action) => {
      const date = CalendarDate.fromAnchor(context.refDate.value);
      const direction = match(action.direction)
        .with("prev", () => -1)
        .with("next", () => 1)
        .exhaustive();
      const cursor = advance(periodFor(action.unit, date), direction * action.amount);
      context.setRefDate(cursor.anchor.toAnchor());
    })
```

- [ ] **Step 2.5: Confirm `periodFor` is still needed**

`periodFor` is now a one-line forward to `periodOfKind`, but it is still called from the `current` action arm (`periodFor(level, CalendarDate.today())`) and from `navigate-step`. Keep it as a local alias mapping `ButtonLevel`→period — it documents that a button level _is_ a period kind. (Per "minimal expressive APIs", inlining both call sites to `periodOfKind(...)` and deleting `periodFor` is equally acceptable — pick one; do not leave a one-liner used by a single caller.)

- [ ] **Step 3: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. No `as Period` casts remain in this file (verify: `grep -n "as Period" src/views/toolbar-items/button/ui/ButtonItem.vue` → no matches).

- [ ] **Step 4: Commit**

```bash
git add src/views/toolbar-items/button/ui/ButtonItem.vue
git commit -m "refactor(views): use periodOfKind/advance in toolbar button, drop casts"
```

---

## Task 5: Month/Week calendar blocks — use `window()`

**Files:**

- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`
- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`

- [ ] **Step 1: Replace the loop in `MonthCalendarBlock.vue`**

a) Imports — replace:

```ts
import { CalendarDate, MonthPeriod } from "@/calendar";
```

with:

```ts
import { CalendarDate, periodOfKind, window } from "@/calendar";

import type { MonthPeriod } from "@/calendar";
```

b) Replace the `months` computed:

```ts
const months = computed<readonly MonthPeriod[]>(() => {
  const focus = MonthPeriod.containing(CalendarDate.fromAnchor(viewContext.refDate.value));
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  const out: MonthPeriod[] = [];
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
```

with:

```ts
const months = computed<readonly MonthPeriod[]>(() => {
  const focus = periodOfKind("month", CalendarDate.fromAnchor(viewContext.refDate.value)) as MonthPeriod;
  return window(focus, props.config.before, props.config.after);
});
```

> `periodOfKind` returns the `Period` union; the `as MonthPeriod` narrows it so `window` infers `MonthPeriod[]` (the literal `"month"` guarantees it at runtime). If you prefer no cast, keep `MonthPeriod.containing(...)` for the focus and import `MonthPeriod` as a value — `window` still preserves the type. Pick one; do not leave both an unused import and a cast.

- [ ] **Step 2: Replace the loop in `WeekCalendarBlock.vue`**

a) Imports — replace:

```ts
import { CalendarDate, WeekPeriod } from "@/calendar";
```

with:

```ts
import { CalendarDate, periodOfKind, window } from "@/calendar";

import type { WeekPeriod } from "@/calendar";
```

b) Replace the `weeks` computed:

```ts
const weeks = computed<readonly WeekPeriod[]>(() => {
  const focus = WeekPeriod.containing(CalendarDate.fromAnchor(viewContext.refDate.value));
  let cursor = focus;
  for (let i = 0; i < props.config.before; i += 1) cursor = cursor.previous();
  const out: WeekPeriod[] = [];
  for (let i = 0; i < props.config.before + props.config.after + 1; i += 1) {
    out.push(cursor);
    cursor = cursor.next();
  }
  return out;
});
```

with:

```ts
const weeks = computed<readonly WeekPeriod[]>(() => {
  const focus = periodOfKind("week", CalendarDate.fromAnchor(viewContext.refDate.value)) as WeekPeriod;
  return window(focus, props.config.before, props.config.after);
});
```

- [ ] **Step 3: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue
git commit -m "refactor(views): build calendar-block windows with calendar.window"
```

---

## Task 6: custom-intervals — `PeriodKind` config + back-compatible parse

The block config stores `window: "current-week" | … | "current-year"`. Move it to the `PeriodKind` subset (`"week" | "month" | "quarter" | "year"`) so `window-resolution` can call `periodOfKind` directly, while keeping stored beta data readable via a valibot transform that normalizes legacy `current-*` values on parse.

**Files:**

- Modify: `src/views/blocks/custom-intervals/custom-intervals-block.ts`
- Modify: `src/views/blocks/custom-intervals/window-resolution.ts`
- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue`
- Test: `src/views/blocks/custom-intervals/window-resolution.test.ts`
- Test: `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`
- Test: `src/views/blocks/custom-intervals/CustomIntervalsBlockConfig.test.ts`

- [ ] **Step 1: Rewrite `window-resolution.ts` and its test (test-first)**

Update `src/views/blocks/custom-intervals/window-resolution.test.ts` — change the window argument from `"current-week"` to `"week"` (and any other `current-*` literals in that file to their bare form). For example:

```ts
const r = resolveWindow("week", "2026-05-29" as AnchorString);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/blocks/custom-intervals/window-resolution.test.ts`
Expected: FAIL — `resolveWindow` still expects `"current-week"` (type error / wrong dispatch).

- [ ] **Step 3: Rewrite `window-resolution.ts`**

Replace the whole file with:

```ts
import { CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar/types";

export const windowKinds = ["week", "month", "quarter", "year"] as const;
export type WindowKind = (typeof windowKinds)[number];

export interface ResolvedWindow {
  readonly start: AnchorString;
  readonly end: AnchorString;
}

export function resolveWindow(window: WindowKind, refDate: AnchorString): ResolvedWindow {
  const period = periodOfKind(window, CalendarDate.fromAnchor(refDate));
  return { start: period.start.toAnchor(), end: period.end.toAnchor() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/blocks/custom-intervals/window-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the block schema with a legacy-tolerant transform**

In `src/views/blocks/custom-intervals/custom-intervals-block.ts`:

a) Add the import (top of file):

```ts
import { windowKinds } from "./window-resolution";
```

b) Replace the `window` schema field (line 12):

```ts
  window: v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const),
```

with:

```ts
  window: v.union([
    v.picklist(windowKinds),
    v.pipe(
      v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const),
      v.transform((legacy) => legacy.replace("current-", "") as (typeof windowKinds)[number]),
    ),
  ]),
```

c) Replace the default (line 25):

```ts
  defaultConfig: { window: "current-month", hideEmpty: true },
```

with:

```ts
  defaultConfig: { window: "month", hideEmpty: true },
```

> Output type of the field is now `"week" | "month" | "quarter" | "year"`. Any stored beta config holding `"current-month"` parses through the second union branch and is normalized to `"month"` — no settings reset, no data loss.

- [ ] **Step 6: Update the config dropdown**

In `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue`, change the four option values (lines 26-29) from the `current-*` form to the bare form; leave the i18n calls untouched (they already pass the bare period name):

```html
<option value="week">{{ m.view_block_config_window_current({ period: "week" }) }}</option>
<option value="month">{{ m.view_block_config_window_current({ period: "month" }) }}</option>
<option value="quarter">{{ m.view_block_config_window_current({ period: "quarter" }) }}</option>
<option value="year">{{ m.view_block_config_window_current({ period: "year" }) }}</option>
```

- [ ] **Step 7: Update the block/config tests + add a legacy-parse test**

a) In `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts` and `CustomIntervalsBlockConfig.test.ts`, replace every `window: "current-month"` / `"current-quarter"` literal with its bare form (`"month"` / `"quarter"`). In `CustomIntervalsBlockConfig.test.ts`, the assertion `expect(onChange).toHaveBeenLastCalledWith({ window: "current-quarter", hideEmpty: true })` becomes `{ window: "quarter", hideEmpty: true }`, and the dropdown-change trigger must select value `"quarter"`.

b) Add a back-compat test to `CustomIntervalsBlockConfig.test.ts` (co-located with the schema it guards). Use the block's config schema to assert a legacy value normalizes:

```ts
import * as v from "valibot";

import { customIntervalsBlock } from "./custom-intervals-block";

it("normalizes a legacy current-* window value to the bare period kind", () => {
  const parsed = v.parse(customIntervalsBlock.schema, { window: "current-quarter", hideEmpty: false });
  expect(parsed.window).toBe("quarter");
});
```

> Confirm the exported symbol name (`customIntervalsBlock`) and the `.schema` accessor against `custom-intervals-block.ts`; adjust the import/accessor to match the actual `defineViewBlock`/`defineCodeBlock` export shape in that file.

- [ ] **Step 8: Run the custom-intervals tests**

Run: `npm run test -- src/views/blocks/custom-intervals`
Expected: PASS, including the new legacy-parse test.

- [ ] **Step 9: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/views/blocks/custom-intervals
git commit -m "refactor(views): store custom-intervals window as PeriodKind with legacy parse"
```

---

## Task 7: Remaining dispatch sites — `period-for-journal` and `PeriodButtonsItem`

**Files:**

- Modify: `src/code-blocks/nav/period-for-journal.ts`
- Modify: `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`

- [ ] **Step 1: Run the existing `period-for-journal` test (baseline, if present)**

Run: `npm run test -- src/code-blocks/nav` (run whatever tests exist there)
Expected: PASS — baseline for the unchanged `custom → day` behavior.

- [ ] **Step 2: Route `period-for-journal` arms through `periodOfKind` — keep the `match(write)`**

This file keys on `JournalWrite` and carries the real `custom → day` rule. Do **not** fuse it into the factory; only replace the per-arm constructors. Replace the file body:

```ts
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
import type { JournalWrite } from "@/journals";

export function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => DayPeriod.containing(date))
    .with({ type: "week" }, () => WeekPeriod.containing(date))
    .with({ type: "month" }, () => MonthPeriod.containing(date))
    .with({ type: "quarter" }, () => QuarterPeriod.containing(date))
    .with({ type: "year" }, () => YearPeriod.containing(date))
    .with({ type: "custom" }, () => DayPeriod.containing(date))
    .exhaustive();
}
```

with:

```ts
import { match } from "ts-pattern";

import { CalendarDate, periodOfKind, type AnchorString, type Period } from "@/calendar";
import type { JournalWrite } from "@/journals";

export function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => periodOfKind("day", date))
    .with({ type: "week" }, () => periodOfKind("week", date))
    .with({ type: "month" }, () => periodOfKind("month", date))
    .with({ type: "quarter" }, () => periodOfKind("quarter", date))
    .with({ type: "year" }, () => periodOfKind("year", date))
    .with({ type: "custom" }, () => periodOfKind("day", date))
    .exhaustive();
}
```

> The `custom → day` mapping stays visible in its own arm — the domain decision is preserved, the concrete constructors are gone.

- [ ] **Step 3: Convert `PeriodButtonsItem.vue` badge construction**

In `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`:

a) Imports — replace:

```ts
import { CalendarDate, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
```

with:

```ts
import { CalendarDate, periodOfKind } from "@/calendar";
import type { Period } from "@/calendar";
```

b) Replace the four `add(...)` calls (lines 46-49):

```ts
add("week", WeekPeriod.containing(date), scope.week.value, "[W]ww YYYY");
add("month", MonthPeriod.containing(date), scope.month.value, "MMM YYYY");
add("quarter", QuarterPeriod.containing(date), scope.quarter.value, "[Q]Q YYYY");
add("year", YearPeriod.containing(date), scope.year.value, "YYYY");
```

with:

```ts
add("week", periodOfKind("week", date), scope.week.value, "[W]ww YYYY");
add("month", periodOfKind("month", date), scope.month.value, "MMM YYYY");
add("quarter", periodOfKind("quarter", date), scope.quarter.value, "[Q]Q YYYY");
add("year", periodOfKind("year", date), scope.year.value, "YYYY");
```

> `PeriodKey` (`week|month|quarter|year`) ⊂ `PeriodKind`, so the literals type-check directly.

- [ ] **Step 4: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/period-for-journal.ts src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue
git commit -m "refactor: route remaining kind->period dispatch through periodOfKind"
```

---

## Task 8: Final sweep

- [ ] **Step 1: Confirm no stray `XxxPeriod.containing` dispatch or casts remain in the migrated sites**

Run:

```bash
grep -rn "as Period" src --include=*.ts --include=*.vue | grep -v test
grep -rn "PERIOD_CTORS\|PeriodLike" src
```

Expected: no matches (the dispatch casts and the private table are gone). Remaining `XxxPeriod.containing` calls in statically-typed sites (`NotesMonthView`, `DatePickerModal`, the per-class internals, Timeline components using `.months()`) are intentional and out of scope — they are not kind-dispatch.

- [ ] **Step 2: Full quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 3: Final commit (if the sweep changed anything; otherwise skip)**

```bash
git add -A
git commit -m "chore(calendar): finalize periodOfKind migration"
```

---

## Self-review notes

- **Scope coverage:** the five dispatch sites named in the design (cycle.ts, ButtonItem, window-resolution, period-for-journal, PeriodButtonsItem) each have a task; the two window-loop sites (Month/Week blocks) are Task 5. Timeline `.months()` sites are explicitly out of scope (already deep).
- **Type consistency:** function names are stable across tasks — `periodOfKind`, `advance`, `window`. `windowKinds`/`WindowKind` (Task 6) is the custom-intervals-local subset, distinct from the calendar-wide `periodKinds`/`PeriodKind`.
- **Migration safety:** the custom-intervals schema change (Task 6) is back-compatible via a valibot `v.union` + `v.transform`; no separate data-migration step and no settings reset for existing beta `data.json`.
- **Open verification point (Task 6 Step 7b):** the exact exported symbol of the block definition and its `.schema` accessor must be confirmed against `custom-intervals-block.ts` before writing the legacy-parse test — adjust the import to match `defineViewBlock`/`defineCodeBlock`'s shape.
- **`window` identifier (Tasks 2, 5):** the `window` function lexically shadows the DOM global inside any module that imports it. The importing files here (`period.ts`, the two calendar blocks) do not reference global `window`, so this is safe. If `check:lint` flags it (e.g. a `no-shadow`/`no-restricted-globals` rule), rename the export to `periodWindow` everywhere (function, barrel export, the three call sites in `period.test.ts`, MonthCalendarBlock, WeekCalendarBlock) and update `CONTEXT.md`.
