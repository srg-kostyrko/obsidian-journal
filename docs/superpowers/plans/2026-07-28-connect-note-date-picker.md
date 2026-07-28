# Bounded Plugin Date Picker for Connect-Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `<input type="date">` in the connect-note modal with the plugin's own `DatePicker`, picking at the journal's granularity and offering only dates inside the journal's timeline; apply the same timeline bounds to the insert-journal-link flow.

**Architecture:** A new `TimelineService.boundsOf(name)` derives an `OpenInterval` from the same facts `TimelineService.contains()` uses, snapped to whole periods so every clickable cell is connectable. A new pure `pickingForWrite(write)` replaces four copies of the write-type → picker-granularity mapping. The existing `useAnchorField` composable moves from `journals/settings/ui/` to `calendar/ui/` so `journals/notes/ui/` can use it without reaching across sub-features.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, `ts-pattern` for union dispatch, valibot-inferred config types, custom `Option`/`Result` types from `@/infrastructure/result`, Vitest + `@testing-library/vue` + `@testing-library/user-event`.

**Source spec:** `docs/superpowers/specs/2026-07-28-connect-note-date-picker-design.md`

## Global Constraints

- Quality gates for every task: `npm run test`, `npm run check:types`, `npm run check:lint` (npm, **not** pnpm). No e2e for this change.
- Never add `eslint-disable` comments. Fix the code instead.
- `no-non-null-assertion` is ON in production code, OFF in tests. Use `.at()` + `??` rather than `!`.
- Tests are colocated as `*.test.ts` beside the implementation.
- One behavior per test. No `and`/comma-list test names. Express scope with nested `describe()`, never with dashes or colons in a single label.
- Assert observable outcomes, not implementation shape. No whole-object equality on rendered state.
- Only WHY-comments. No comments that restate what the code does, no spec-reference comments.
- Discriminated-union dispatch uses `match().with().exhaustive()` from `ts-pattern`, not `switch`.
- **Inside `src/journals/`, import journal modules by direct submodule path (`../../picking`), never through the `@/journals` barrel** — barrel imports from within the feature create the known import cycle.
- **`pickingForWrite` is NOT exported from the journals barrel.** The design doc says it is; that is superseded here. Main barrels carry public API only, and this helper has no consumer outside `src/journals/`. Everything else in the design doc stands as written.
- No new `en.json` strings. The picker's existing `m.common_pick_a_date()` placeholder covers the empty state.
- Commit to the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.

---

### Task 1: `OpenInterval.unbounded()`

A bounds provider must be able to say "no bound on either side" while still returning an `OpenInterval`, so callers never branch on `OpenInterval | undefined`.

**Files:**

- Modify: `src/calendar/open-interval.ts` (add a static beside `from`/`until`/`between` at lines 9–22)
- Test: `src/calendar/open-interval.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `OpenInterval.unbounded(): OpenInterval` — an interval whose `start` and `end` are both `Option.none()`, so `contains()` is true for every date and `overlapsPeriod()` is true for every period.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/calendar/open-interval.test.ts`, after the existing `describe("from", ...)` block. `date` and `MonthPeriod` are already imported at the top of that file.

```ts
describe("unbounded", () => {
  it("leaves the start open", () => {
    expect(OpenInterval.unbounded().start.isNone()).toBe(true);
  });

  it("leaves the end open", () => {
    expect(OpenInterval.unbounded().end.isNone()).toBe(true);
  });

  it("contains any date", () => {
    expect(OpenInterval.unbounded().contains(date("1999-01-01"))).toBe(true);
  });

  it("overlaps any period", () => {
    expect(OpenInterval.unbounded().overlapsPeriod(MonthPeriod.containing(date("2099-12-01")))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/calendar/open-interval.test.ts`
Expected: FAIL — `OpenInterval.unbounded is not a function`.

- [ ] **Step 3: Add the static**

In `src/calendar/open-interval.ts`, insert directly after the `static from(...)` method (which ends at line 11):

```ts
  static unbounded(): OpenInterval {
    return new OpenInterval(Option.none(), Option.none());
  }
```

`Option` is already imported at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/calendar/open-interval.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/calendar/open-interval.ts src/calendar/open-interval.test.ts
git commit -m "feat(calendar): add an unbounded open interval"
```

---

### Task 2: Move `useAnchorField` into `calendar/ui`

`useAnchorField` is the generic adapter between an `AnchorString` field and a `DatePicker`'s `Period | null` model. It currently lives under `journals/settings/ui/`; Task 7 needs it from `journals/notes/ui/`, and reaching across sub-features is not allowed. It belongs beside `DatePicker.vue`.

This is a pure refactor: the moved test must pass unchanged.

**Files:**

- Move: `src/journals/settings/ui/use-anchor-field.ts` → `src/calendar/ui/use-anchor-field.ts`
- Move: `src/journals/settings/ui/use-anchor-field.test.ts` → `src/calendar/ui/use-anchor-field.test.ts`
- Modify: `src/calendar/ui/index.ts` (barrel export)
- Modify: `src/journals/settings/ui/AddJournalModal.vue:8,19`
- Modify: `src/journals/settings/ui/sections/SequenceSection.vue:20`
- Modify: `src/journals/settings/ui/sections/TimelineSection.vue:5,17`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `useAnchorField(options: { anchor: Ref<AnchorString>; picking: MaybeRefOrGetter<Picking> }): WritableComputedRef<Period | null>`, importable as `import { useAnchorField } from "@/calendar/ui";`. Behavior is unchanged: an empty anchor reads as `null`; assigning `null` writes `""`; assigning a period writes `period.anchor.toAnchor()`.

- [ ] **Step 1: Move both files with git**

```bash
git mv src/journals/settings/ui/use-anchor-field.ts src/calendar/ui/use-anchor-field.ts
git mv src/journals/settings/ui/use-anchor-field.test.ts src/calendar/ui/use-anchor-field.test.ts
```

- [ ] **Step 2: Rewrite the moved implementation**

Replace the entire contents of `src/calendar/ui/use-anchor-field.ts` with the following. The private `periodContaining` helper is dropped in favour of `periodOfKind`, which is already public in `@/calendar` and does exactly the same thing — `Picking` is a subset of `PeriodKind`, so it type-checks directly.

```ts
import { computed, toRaw, toValue, type MaybeRefOrGetter, type Ref, type WritableComputedRef } from "vue";

import { CalendarDate, periodOfKind, type AnchorString, type Period } from "@/calendar";

import type { Picking } from "./errors";

export function useAnchorField(options: {
  anchor: Ref<AnchorString>;
  picking: MaybeRefOrGetter<Picking>;
}): WritableComputedRef<Period | null> {
  return computed({
    get: () => {
      const a = options.anchor.value;
      if (!a) return null;
      return periodOfKind(toValue(options.picking), CalendarDate.fromAnchor(a));
    },
    set: (period) => {
      const raw = period ? toRaw(period) : null;
      const rawAnchor = raw ? toRaw(raw.anchor) : null;
      options.anchor.value = (rawAnchor ? rawAnchor.toAnchor() : "") as AnchorString;
    },
  });
}
```

The moved test file needs no edit — its `import { useAnchorField } from "./use-anchor-field";` is still correct, and it imports `@/calendar` and `@/calendar/testing` by alias.

- [ ] **Step 3: Export it from the calendar UI barrel**

In `src/calendar/ui/index.ts`, add the export. The file becomes:

```ts
export { default as DatePicker } from "./DatePicker.vue";
export type { Picking } from "./errors";
export { useAnchorField } from "./use-anchor-field";
export { usePeriodWindow } from "./use-period-window";
```

- [ ] **Step 4: Point the three consumers at the new location**

In `src/journals/settings/ui/AddJournalModal.vue`, change line 8 to:

```ts
import { DatePicker, useAnchorField } from "@/calendar/ui";
```

and delete line 19 (`import { useAnchorField } from "./use-anchor-field";`).

In `src/journals/settings/ui/sections/SequenceSection.vue`, delete line 20 (`import { useAnchorField } from "../use-anchor-field";`) and add `useAnchorField` to the existing `@/calendar/ui` import in the same file's import block, so it reads:

```ts
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
```

In `src/journals/settings/ui/sections/TimelineSection.vue`, change line 5 to:

```ts
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
```

and delete line 17 (`import { useAnchorField } from "../use-anchor-field";`).

If a consumer's existing `@/calendar/ui` import line does not match the text above verbatim, keep its existing named imports and add `useAnchorField` to them rather than overwriting.

- [ ] **Step 5: Run the affected tests to verify the refactor is behaviour-neutral**

Run: `npx vitest run src/calendar/ui/use-anchor-field.test.ts src/journals/settings/ui`
Expected: PASS, with no test edits.

- [ ] **Step 6: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add -A src/calendar/ui src/journals/settings/ui
git commit -m "refactor(calendar): move the anchor field composable beside the date picker"
```

---

### Task 3: `pickingForWrite`

The write-type → picker-granularity mapping is currently written out four times: `insert-journal-link.flow.ts:20`, `TimelineSection.vue:28`, `SequenceSection.vue:31`, and Task 7 would add a fifth.

No dedicated test: the mapping is an identity map from write type to picking kind, and every branch is exercised by the call-site tests already in the suite. A test here would restate the implementation.

**Files:**

- Create: `src/journals/picking.ts`
- Modify: `src/journals/notes/flows/insert-journal-link.flow.ts:1-27`
- Modify: `src/journals/settings/ui/sections/TimelineSection.vue:28-30`
- Modify: `src/journals/settings/ui/sections/SequenceSection.vue:31-33`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `pickingForWrite(write: JournalWrite): Picking` at `src/journals/picking.ts`. Maps `week`/`month`/`quarter`/`year` to their own names and everything else — `day` and `custom` — to `"day"`. Import it by direct path (`../../picking`, `../../../picking`), never via `@/journals`.

- [ ] **Step 1: Create the module**

Create `src/journals/picking.ts`:

```ts
import { match } from "ts-pattern";

import type { Picking } from "@/calendar/ui";

import type { JournalWrite } from "./config";

export function pickingForWrite(write: JournalWrite): Picking {
  return match(write)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .otherwise(() => "day" as const);
}
```

- [ ] **Step 2: Use it in the insert-journal-link flow**

In `src/journals/notes/flows/insert-journal-link.flow.ts`:

- Delete the local `pickingFor` function (lines 20–27).
- Delete `import { match } from "ts-pattern";` (line 1) and `import type { JournalWrite } from "../../config";` (line 16) — `pickingFor` was their only user.
- Change line 3 from `import type { Picking } from "@/calendar/ui";` to nothing (delete it); `Picking` is no longer named in this file.
- Add `import { pickingForWrite } from "../../picking";` alongside the other `../../` imports.
- Change the `datePickerModal` call (line 49) from `{ picking: pickingFor(config.write) }` to `{ picking: pickingForWrite(config.write) }`.

- [ ] **Step 3: Use it in the two settings sections**

In `src/journals/settings/ui/sections/TimelineSection.vue`, replace lines 28–30 with:

```ts
const startPicking = computed<Picking>(() => (config.value ? pickingForWrite(config.value.write) : "day"));
```

and add `import { pickingForWrite } from "../../../picking";` to the import block.

In `src/journals/settings/ui/sections/SequenceSection.vue`, replace lines 31–33 with:

```ts
const startPicking = computed<Picking>(() => (config.value ? pickingForWrite(config.value.write) : "day"));
```

and add `import { pickingForWrite } from "../../../picking";` to the import block.

- [ ] **Step 4: Run the call-site tests to verify nothing moved**

Run: `npx vitest run src/journals/notes/flows/insert-journal-link.flow.test.ts src/journals/settings/ui/sections`
Expected: PASS, with no test edits. These suites already cover day, week, month, quarter, year and custom writes at the call sites.

- [ ] **Step 5: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/journals/picking.ts src/journals/notes/flows/insert-journal-link.flow.ts src/journals/settings/ui/sections
git commit -m "refactor(journals): share the write-type to picker-granularity mapping"
```

---

### Task 4: Guard `TimelineService.startOf` against an unset start

`startOf` builds `CalendarDate.fromAnchor(c.timeline.start)` with no guard, so a journal with no timeline start yields a `CalendarDate` from `""` — an invalid moment carried through as a garbage date. Its sibling `endOf` guards exactly this case. There is no production caller today, so this is a latent bug; Task 5 is what would trip it.

**Files:**

- Modify: `src/journals/timeline.ts:40-42`
- Test: `src/journals/timeline.test.ts` (the existing `describe("startOf", ...)` block)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `TimelineService.startOf(name: string): Option<CalendarDate>` now returns `Option.none()` when `timeline.start` is `""`. Its two existing behaviors — a real start date, and `none` for an unknown journal — are unchanged.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("startOf", ...)` block in `src/journals/timeline.test.ts`, after `it("returns None for unknown journal", ...)`:

```ts
it("returns None when the timeline has no start", () => {
  const c = buildContainer({
    daily: fixedJournal("daily", { type: "day" }, { timeline: { start: "" as AnchorString, end: { kind: "never" } } }),
  });
  const timeline = c.resolve(TimelineService);
  expect(timeline.startOf("daily").isNone()).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/journals/timeline.test.ts -t "returns None when the timeline has no start"`
Expected: FAIL — the result is `Some` holding a `CalendarDate` built from `""`.

- [ ] **Step 3: Add the guard**

In `src/journals/timeline.ts`, replace the `startOf` method (lines 40–42):

```ts
  startOf(name: string): Option<CalendarDate> {
    return this.#journals
      .get(name)
      .flatMap((c) =>
        c.timeline.start === "" ? Option.none<CalendarDate>() : Option.some(CalendarDate.fromAnchor(c.timeline.start)),
      );
  }
```

`Option` and `CalendarDate` are already imported in this file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/timeline.test.ts`
Expected: PASS, including the pre-existing `startOf` tests.

- [ ] **Step 5: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/journals/timeline.ts src/journals/timeline.test.ts
git commit -m "fix(journals): report no timeline start instead of an invalid date"
```

---

### Task 5: `TimelineService.boundsOf`

The core of "respect the journal timeline". It derives the picker's bounds from the same facts `contains()` uses, **snapped to whole periods**, so the set of clickable cells equals the set of connectable dates.

Why snapping matters: `contains()` accepts a period by its _anchor_, while the calendar grid disables a cell by _overlap_ against the raw bound. Since `e4bf4ebc` every period's anchor **is** its first day (`representative` carries the formatting role instead), so for a **fixed** cycle the two rules already agree and the snapping is an identity — keep it anyway, because it is what makes them agree rather than a coincidence.

Snapping is load-bearing for a **custom-interval** journal. There the picker shows _day_ cells while `contains()` judges the _interval_ the day resolves to. For intervals of 7 days from Jun 1 and a timeline ending Wed 2026-06-03: `contains()` accepts every day in the Jun 1–7 interval (its anchor Jun 1 ≤ Jun 3), but a raw bound at Jun 3 would grey out Jun 4–7. Widening the bound to the interval's end (Jun 7) makes the clickable set equal the connectable set. The lower bound is symmetric.

**Files:**

- Modify: `src/journals/timeline.ts` (add `boundsOf` plus two private helpers)
- Test: `src/journals/timeline.test.ts`

**Interfaces:**

- Consumes: `OpenInterval.unbounded()` (Task 1); `TimelineService.startOf` with the empty-start guard (Task 4).
- Produces: `TimelineService.boundsOf(name: string): OpenInterval` — always returns an interval, never `undefined`. Unset start, `never` end, or unknown journal leaves that side open; both open yields `OpenInterval.unbounded()`.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/journals/timeline.test.ts`, after the existing `describe("endOf", ...)` block. The test calendar installed in `beforeEach` is ISO (`dow: 1, doy: 4`), so a week runs Monday–Sunday with its anchor on Thursday. 2026-06-01 is a Monday.

```ts
describe("boundsOf", () => {
  it("leaves both sides open for an unknown journal", () => {
    const c = buildContainer({});
    const bounds = c.resolve(TimelineService).boundsOf("missing");
    expect(bounds.start.isNone() && bounds.end.isNone()).toBe(true);
  });

  it("leaves the lower side open when the timeline has no start", () => {
    const c = buildContainer({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: "" as AnchorString, end: { kind: "never" } } },
      ),
    });
    expect(c.resolve(TimelineService).boundsOf("daily").start.isNone()).toBe(true);
  });

  it("leaves the upper side open when the timeline never ends", () => {
    const c = buildContainer({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
      ),
    });
    expect(c.resolve(TimelineService).boundsOf("daily").end.isNone()).toBe(true);
  });

  it("bounds a daily journal at its configured start date", () => {
    const c = buildContainer({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
      ),
    });
    const bounds = c.resolve(TimelineService).boundsOf("daily");
    expect(bounds.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2024-01-01");
  });

  it("widens the lower bound to the start of the week a mid-week start falls in", () => {
    const c = buildContainer({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        { timeline: { start: "2026-06-03" as AnchorString, end: { kind: "never" } } },
      ),
    });
    const bounds = c.resolve(TimelineService).boundsOf("weekly");
    expect(bounds.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
  });

  it("extends the upper bound to the end of the week the timeline end falls in", () => {
    const c = buildContainer({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
      ),
    });
    const bounds = c.resolve(TimelineService).boundsOf("weekly");
    expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-07");
  });

  it("keeps the upper bound at the end date when it already closes a period", () => {
    const c = buildContainer({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
      ),
    });
    const bounds = c.resolve(TimelineService).boundsOf("daily");
    expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-03");
  });

  it("bounds a repeats end at the last repeat", () => {
    const c = buildContainer({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "repeats", count: 3 } } },
      ),
    });
    const bounds = c.resolve(TimelineService).boundsOf("daily");
    expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2024-01-03");
  });

  it("agrees with contains at the upper edge", () => {
    const c = buildContainer({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
      ),
    });
    const timeline = c.resolve(TimelineService);
    const bounds = timeline.boundsOf("weekly");
    // Jun 5 sits inside the accepted Jun 1-7 week and is clickable only because #boundEnd
    // widened Jun 3 -> Jun 7. Asserting on a REJECTED week instead would be vacuous: week
    // starts are Jun 1 or Jun 8, so overlapsPeriod cannot tell the two bounds apart.
    expect(timeline.contains("weekly", "2026-06-01" as AnchorString)).toBe(true);
    expect(bounds.overlapsPeriod(DayPeriod.containing(date("2026-06-05")))).toBe(true);
  });

  it("extends a custom journal's upper bound to the end of its final interval", () => {
    const c = buildContainer({
      sprints: customJournal("sprints", "day", 7, "2026-06-01", {
        timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } },
      }),
    });
    const bounds = c.resolve(TimelineService).boundsOf("sprints");
    expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-07");
  });
});
```

These need imports added at the top of `src/journals/timeline.test.ts`: `DayPeriod` from `@/calendar` (join it to the existing `import { CalendarDate } from "@/calendar";`), `date` from `@/calendar/testing` (join it to the existing `import { installTestCalendar } from "@/calendar/testing";`), and `customJournal` from `./testing` (join it to the existing `fixedJournal` import — check its exact signature there).

The "agrees with contains" test asserts two things because the property under test _is_ the agreement between them — a single-sided assertion would not express it. It must assert on the **accepted** side: a test that picks a rejected week passes even with `#boundEnd`'s widening deleted, because week starts straddle the two candidate bounds. Verify the test has teeth by temporarily making `#boundEnd` return `this.endOf(name)` directly and confirming it fails.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/journals/timeline.test.ts`
Expected: FAIL — `timeline.boundsOf is not a function`.

- [ ] **Step 3: Implement `boundsOf`**

In `src/journals/timeline.ts`, add these three methods to `TimelineService` after `endOf`:

```ts
  boundsOf(name: string): OpenInterval {
    const start = this.#boundStart(name);
    const end = this.#boundEnd(name);
    if (start.isSome() && end.isSome()) {
      const between = OpenInterval.between(start.value, end.value);
      // Only hand-edited settings can put the start after the end. Keep the start bound rather
      // than dropping both and offering the whole calendar.
      return between.isOk() ? between.value : OpenInterval.from(start.value);
    }
    if (start.isSome()) return OpenInterval.from(start.value);
    if (end.isSome()) return OpenInterval.until(end.value);
    return OpenInterval.unbounded();
  }

  // Widen to the whole period the start falls in: contains() admits a period that straddles the
  // start date, so a narrower bound would grey out a cell the journal accepts.
  #boundStart(name: string): Option<CalendarDate> {
    return this.startOf(name)
      .flatMap((d) => this.#cycle.anchorOf(name, d))
      .flatMap((a) => this.#cycle.startOf(name, a));
  }

  // Widen to the whole period the end falls in: contains() admits a period by its anchor, so a
  // period straddling the end date is still written and its cell must stay selectable.
  #boundEnd(name: string): Option<CalendarDate> {
    return this.endOf(name)
      .flatMap((d) => this.#cycle.anchorOf(name, d))
      .flatMap((a) => this.#cycle.endOf(name, a));
  }
```

Add `OpenInterval` to the existing `@/calendar` import at the top of the file:

```ts
import { CalendarDate, OpenInterval } from "@/calendar";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/journals/timeline.test.ts`
Expected: PASS, all nine new tests plus the pre-existing suite.

- [ ] **Step 5: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/journals/timeline.ts src/journals/timeline.test.ts
git commit -m "feat(journals): derive picker bounds from the journal timeline"
```

---

### Task 6: Bound the insert-journal-link picker

`InsertJournalLinkFlow` opens the same date picker with no bounds, so it can link to a note outside the journal's timeline.

**Files:**

- Modify: `src/journals/notes/flows/insert-journal-link.flow.ts`
- Test: `src/journals/notes/flows/insert-journal-link.flow.test.ts`

**Interfaces:**

- Consumes: `TimelineService.boundsOf(name)` (Task 5); `pickingForWrite` (Task 3, already wired in this file).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Register the timeline dependencies in the test container**

The flow will inject `TimelineService`, which injects `CycleService`, which injects `JournalsIndex`. The test's `build()` helper registers none of them.

In `src/journals/notes/flows/insert-journal-link.flow.test.ts`, add these registrations to `build()` immediately after the `JournalsRepository` registration:

```ts
c.register(JournalsIndex).useClass(JournalsIndex);
c.register(CycleService).useClass(CycleService);
c.register(TimelineService).useClass(TimelineService);
```

and add the imports beside the existing `import { JournalsRepository } from "../../repository";`:

```ts
import { CycleService } from "../../cycle";
import { JournalsIndex } from "../../journals-index";
import { TimelineService } from "../../timeline";
```

- [ ] **Step 2: Write the failing test**

Add this test to `describe("InsertJournalLinkFlow", ...)` in the same file:

```ts
it("bounds the date picker to the journal timeline", async () => {
  const { flows, modals } = build({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: "2026-06-01" as AnchorString, end: { kind: "never" } } },
    ),
  });
  const promise = flows.invoke(InsertJournalLinkFlow);
  await tick();
  const handle = modals.lastOpen<{ bounds?: OpenInterval }, DayPeriod>();
  handle.submit(DayPeriod.containing(date("2026-06-15")));
  await promise;
  expect(handle.props.bounds?.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
});
```

Add `OpenInterval` to the existing `@/calendar` import (`import { DayPeriod, type OpenInterval } from "@/calendar";`) and `AnchorString` to it as well (`type AnchorString`).

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/journals/notes/flows/insert-journal-link.flow.test.ts`
Expected: FAIL on the new test — `handle.props.bounds` is `undefined`, so the expectation receives `undefined` rather than `"2026-06-01"`. The four pre-existing tests must still pass; if they fail, the container registrations from Step 1 are wrong — fix that before continuing.

- [ ] **Step 4: Pass the bounds through**

In `src/journals/notes/flows/insert-journal-link.flow.ts`:

Add the injected service beside the other fields:

```ts
  readonly #timeline = inject(TimelineService);
```

and the import beside the other `../../` imports:

```ts
import { TimelineService } from "../../timeline";
```

Then change the modal call from:

```ts
const period =
  yield *
  this.#modals
    .open(datePickerModal, { picking: pickingForWrite(config.write) })
    .mapErr(() => new UserAborted("insert-journal-link"));
```

to:

```ts
const period =
  yield *
  this.#modals
    .open(datePickerModal, {
      picking: pickingForWrite(config.write),
      bounds: this.#timeline.boundsOf(journalName),
    })
    .mapErr(() => new UserAborted("insert-journal-link"));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/journals/notes/flows/insert-journal-link.flow.test.ts`
Expected: PASS, all five tests.

- [ ] **Step 6: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/journals/notes/flows/insert-journal-link.flow.ts src/journals/notes/flows/insert-journal-link.flow.test.ts
git commit -m "feat(journals): bound the insert-link date picker to the journal timeline"
```

---

### Task 7: Swap the connect-note date input for the bounded picker

The visible change. Three things happen at once because they cannot be separated without leaving the modal in a state that neither the old nor the new tests describe: the input becomes a `DatePicker`, the default stops being today, and the picker gets the journal's granularity and bounds.

**Files:**

- Modify: `src/journals/notes/ui/ConnectNoteModal.vue`
- Test: `src/journals/notes/ui/ConnectNoteModal.test.ts`

**Interfaces:**

- Consumes: `useAnchorField` from `@/calendar/ui` (Task 2); `pickingForWrite` from `../../picking` (Task 3); `TimelineService.boundsOf` (Task 5).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Register a fake modal service in the test container**

`DatePicker` resolves `ModalService` during setup, so every test that mounts the unconnected form will fail to mount without it.

In `src/journals/notes/ui/ConnectNoteModal.test.ts`, change `buildContainer` to accept and register the fake, and return it alongside the container. Replace the existing `buildContainer` function with:

```ts
function buildContainer(repo: JournalsRepository): { container: Container; modals: FakeModalService } {
  const c = new Container();
  const modals = new FakeModalService();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  return { container: c, modals };
}
```

Add the imports:

```ts
import { DayPeriod } from "@/calendar";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
```

extend the existing `@/calendar/testing` import to `import { installTestCalendar, anchor, date } from "@/calendar/testing";`, and delete `fireEvent` from the `@testing-library/vue` import — nothing uses it after this task.

Every existing `const container = buildContainer(repo);` becomes `const { container } = buildContainer(repo);`, except in the tests that drive the picker, which use `const { container, modals } = buildContainer(repo);`.

- [ ] **Step 2: Add a helper that drives the picker**

Add this beside `mountModal` in the same file. It is an interaction helper, not an assertion wrapper: it clicks the picker trigger, answers the modal, and waits for the trigger label to stop being the placeholder.

```ts
async function pickDate(modals: FakeModalService, when: string): Promise<void> {
  await userEvent.click(screen.getByText(m.common_pick_a_date()));
  modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date(when)));
  await waitFor(() => {
    expect(screen.queryByText(m.common_pick_a_date())).toBeNull();
  });
}
```

Add `waitFor` to the `@testing-library/vue` import.

- [ ] **Step 3: Update the existing tests that now need a date**

Three tests currently rely on the field defaulting to today. With an empty default, `anchor` is undefined, so Connect is disabled and the rename/move rows do not render.

Replace `it("submits a connect command for an unconnected note", ...)` with:

```ts
it("submits a connect command for an unconnected note", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
  const { container, modals } = buildContainer(repo);

  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<ConnectNoteResult> = { submit, cancel };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await pickDate(modals, "2026-06-15");
  await userEvent.click(screen.getByRole("button", { name: m.connect_note_modal_connect() }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", journalName: "daily" }));
});
```

Replace `it("spells out the current and configured folder on the move toggle", ...)` with:

```ts
it("spells out the current and configured folder on the move toggle", async () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { folder: "journals" }) });
  const { container, modals } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await pickDate(modals, "2026-06-15");
  expect(
    screen.getByText(m.connect_note_modal_move_description({ current: "inbox", configured: "journals" })),
  ).toBeTruthy();
});
```

Replace the two out-of-bounds tests. They now submit through the fake, which does not enforce bounds — that is deliberate: it models a date that survives a journal switch, which is the one path by which an out-of-timeline date can still reach the form.

```ts
it("disables Connect when the chosen date is outside the journal timeline", async () => {
  const repo = fakeRepo({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: anchor(""), end: { kind: "date", date: anchor("2026-06-01") } } },
    ),
  });
  const { container, modals } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await pickDate(modals, "2026-09-15");

  const connect = screen.getByRole("button", { name: m.connect_note_modal_connect() });
  expect((connect as HTMLButtonElement).disabled).toBe(true);
});

it("explains that the chosen date is outside the journal timeline", async () => {
  const repo = fakeRepo({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: anchor(""), end: { kind: "date", date: anchor("2026-06-01") } } },
    ),
  });
  const { container, modals } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await pickDate(modals, "2026-09-15");

  expect(screen.getByText(m.connect_note_modal_out_of_bounds())).toBeTruthy();
});
```

- [ ] **Step 4: Write the new failing tests**

Add these to `describe("when the note is not connected", ...)`:

```ts
it("disables Connect until a date is picked", () => {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
  const { container } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  const connect = screen.getByRole("button", { name: m.connect_note_modal_connect() });
  expect((connect as HTMLButtonElement).disabled).toBe(true);
});

it("picks whole weeks for a weekly journal", async () => {
  const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
  const { container, modals } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await userEvent.click(screen.getByText(m.common_pick_a_date()));
  expect(modals.lastOpen<{ picking: string }, DayPeriod>().props.picking).toBe("week");
});

it("bounds the picker to the journal timeline", async () => {
  const repo = fakeRepo({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
    ),
  });
  const { container, modals } = buildContainer(repo);
  const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

  mountModal("inbox/note.md" as VaultPath, container, api);
  await userEvent.click(screen.getByText(m.common_pick_a_date()));
  const bounds = modals.lastOpen<{ bounds?: OpenInterval }, DayPeriod>().props.bounds;
  expect(bounds?.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
});
```

Add `type OpenInterval` to the `@/calendar` import.

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/journals/notes/ui/ConnectNoteModal.test.ts`
Expected: FAIL. The new and rewritten tests fail because no picker trigger renders — `getByText(m.common_pick_a_date())` finds nothing, and "disables Connect until a date is picked" fails because the field still defaults to today.

- [ ] **Step 6: Rewrite the component's script**

In `src/journals/notes/ui/ConnectNoteModal.vue`:

Add the imports:

```ts
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
import { pickingForWrite } from "../../picking";
```

and add `type AnchorString` to the existing `@/calendar` import:

```ts
import { CalendarDate, type AnchorString } from "@/calendar";
```

Replace the state declaration at line 39:

```ts
const dateString = ref(CalendarDate.today().toAnchor());
```

with:

```ts
const dateAnchor = ref<AnchorString>("" as AnchorString);
```

and add, directly below the `move` ref:

```ts
const selectedConfig = computed(() => journals.get(selected.value).getOrUndefined());
const picking = computed<Picking>(() => (selectedConfig.value ? pickingForWrite(selectedConfig.value.write) : "day"));
const bounds = computed(() => timeline.boundsOf(selected.value));
const dateModel = useAnchorField({ anchor: dateAnchor, picking });
```

Change the reset watch at line 44 to watch the new ref:

```ts
watch([dateAnchor, selected], () => {
```

Replace the `anchor` computed (lines 50–56) with:

```ts
const anchor = computed(() => {
  if (!selected.value || !dateAnchor.value) return;
  const resolved = cycle.anchorOf(selected.value, CalendarDate.fromAnchor(dateAnchor.value));
  return resolved.isSome() ? resolved.value : undefined;
});
```

The date is now stored as an anchor string rather than a free-form input value, so the `CalendarDate.parse` round-trip and its `isOk` check are gone. Everything downstream — `occupant`, `configuredPath`, `needRename`, `needMove`, `outOfBounds`, `canConnect`, `connect()` — is unchanged: they all read `anchor.value`, which is still `AnchorString | undefined`.

Keep `outOfBounds` and its row. Bounds make it unreachable through the picker, but it still fires when a date picked for one journal survives a switch to a journal whose timeline excludes it.

- [ ] **Step 7: Swap the template row**

Replace lines 148–151 of `src/journals/notes/ui/ConnectNoteModal.vue`:

```html
<UiSettingRow>
  <template #name>{{ m.connect_note_modal_date_label() }}</template>
  <input v-model="dateString" type="date" :aria-label="m.connect_note_modal_date_label()" />
</UiSettingRow>
```

with:

```html
<UiSettingRow>
  <template #name>{{ m.connect_note_modal_date_label() }}</template>
  <DatePicker v-model="dateModel" :picking="picking" :bounds="bounds" />
</UiSettingRow>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/journals/notes/ui/ConnectNoteModal.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 9: Run the gates and commit**

```bash
npm run check:types && npm run check:lint
git add src/journals/notes/ui/ConnectNoteModal.vue src/journals/notes/ui/ConnectNoteModal.test.ts
git commit -m "feat(journals): pick connect-note dates with the bounded plugin picker"
```

---

### Task 8: Whole-suite verification

Each task ran only its own tests. This confirms nothing elsewhere depended on the moved composable, the removed `pickingFor`, the `startOf` guard, or the connect-note modal's default date.

**Files:**

- Modify: only whatever the run turns up.

**Interfaces:**

- Consumes: every prior task.
- Produces: a green suite.

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: PASS. If a suite outside the touched files fails, fix the cause rather than the assertion, and say which task's change broke it.

- [ ] **Step 2: Run the type and lint gates over the whole repo**

Run: `npm run check:types && npm run check:lint`
Expected: clean. Watch for imports left unused by Task 3's deletions (`match`, `JournalWrite`, `Picking` in the insert-link flow) and Task 7's (`fireEvent` in the modal test) — lint reports these as errors, and they must be deleted, never suppressed.

- [ ] **Step 3: Confirm no journals-barrel import crept in**

Run: `grep -rn '"@/journals"' src/journals/`
Expected: no output. Any hit is an import cycle waiting to abort plugin boot; rewrite it as a direct submodule path.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src
git commit -m "test(journals): settle the suite after the date-picker swap"
```

Skip this step if steps 1–3 needed no changes.

---

## Self-Review

**Spec coverage.** `OpenInterval.unbounded()` → Task 1. `useAnchorField` move plus the `periodOfKind` simplification → Task 2. `pickingForWrite` and its call sites → Task 3 (the spec named two duplicate sites; a third, `SequenceSection.vue:31`, turned up during planning and is folded in). `startOf` empty-start guard → Task 4. `boundsOf` with start-widening, end-snapping, the contradictory-config fallback, and the unbounded default → Task 5. `InsertJournalLinkFlow` bounds → Task 6. `ConnectNoteModal` picker, empty default, retained `outOfBounds` row → Task 7. Every test listed in the spec's Testing section appears in Tasks 1, 4, 5, 6, or 7. `TimelineSection.vue`'s own `endBounds` is deliberately untouched.

**One documented deviation:** the spec exports `pickingForWrite` from the journals barrel; this plan does not, because the helper has no consumer outside `src/journals/` and barrel imports from within the feature are the known cycle risk. Noted in Global Constraints.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `boundsOf(name: string): OpenInterval` is used with that exact signature in Tasks 6 and 7. `pickingForWrite(write: JournalWrite): Picking` takes a write object, not a journal name, at all four call sites. `useAnchorField({ anchor, picking })` keeps its existing option names. `startOf`/`endOf` keep returning `Option<CalendarDate>`. `FakeModalService.lastOpen<TProps, TResult>()` is used with the props type first, matching its declaration in `src/infrastructure/host/modals/testing.ts`.
