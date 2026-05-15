# v3 Journal Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four journal-domain services (`TimelineService`, `CycleService`, `NumberingService`, `FrontmatterService`) and the `VaultSubscriptionService` that drives `JournalsIndex`, per `docs/superpowers/specs/2026-05-15-v3-journal-entity-design.md`.

**Architecture:** Service-style. Each service is a singleton DI binding that takes a `journalName` and reads its config through `SettingsService.getCollection`. Cycle and bounds values are built per-call (allocation-cheap). Numbering caches results per-anchor and invalidates on `JournalsIndex.journalDirty`. `VaultSubscriptionService` is the only writer to `JournalsIndex`.

**Tech Stack:** TypeScript, valibot (schemas), `ts-pattern` (discriminated-union dispatch), Vitest (tests). DI via `@/infrastructure/di`. Result/Option from `@/infrastructure/result`. Calendar primitives from `@/calendar`.

**Quality gates per task:** `npm run test`, `npm run check:types`, `npm run check:lint`. All must pass before committing.

**Conventions to follow** (from project memory):

- Tests colocated as `*.test.ts`.
- One behavior per `it`; nested `describe` for scope.
- Use `expectTypeOf` for type assertions; never `@ts-expect-error`.
- Black-box assertions: observable outcomes, no spy-of-internal-method tests.
- DI: `readonly #x = inject(Token)` at field declaration. Omit `.lifetime(Lifetime.Container)` (Container is default).
- Errors live in `errors.ts`. Never declare `Error` subclasses inline.
- No `eslint-disable` comments. No `Co-Authored-By` in commit messages.
- Use `attempt.in(this, function*)` for multi-step Result/AsyncResult pipelines.
- Use `match(value).with(...).exhaustive()` for discriminated-union dispatch.

**API gotchas to know up front:**

- **`Option` has no `unwrap()` method.** Narrow via `assert(opt.isSome())` (then `opt.value`) or use `.match({ some, none })`. Tests below use the assert-then-`.value` pattern matching existing project tests. Where the plan reads `.unwrap()` for brevity, translate to the narrowing pattern at write time.
- **`Result` has no `unwrap()` method either.** Same pattern: `assert(r.isOk())` then `r.value`.
- **`AsyncResult` is thenable** — `await asyncResult` returns a `Result<T, E>`. There is no `.toPromise()`. Where the plan shows `.toPromise()`, replace with `await`.
- **DI multi-binding** for `SliceDefinitionToken` / `CollectionDefinitionToken` uses plain `c.register(Token).useValue(definition)` — no `.asMulti()` call (the token itself is configured as multi).
- **`CalendarDate.parse(s)`** returns `Result<CalendarDate, ParseError>`. In tests, narrow with `assert(parsed.isOk())` then `parsed.value`.

**Reusable test helper** (place in `src/journals/testing.ts` from Task 8 onward):

```ts
import { assert } from "vitest";
import type { Option } from "@/infrastructure/result";

export function unwrap<T>(opt: Option<T>): T {
  assert(opt.isSome(), "expected Some");
  return opt.value;
}
```

Tests in subsequent tasks may use this helper instead of inline `assert + .value`. Where the plan shows `.unwrap()` on an `Option`, call `unwrap(opt)` from the helper.

---

## Task 1: Extend `JournalEntry` with `endDate` / `numbers`; add `entryByAnchor` to `JournalsIndex`

**Files:**

- Modify: `src/journals/types.ts`
- Modify: `src/journals/journals-index.ts`
- Modify: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Extend `JournalEntry` type**

`src/journals/types.ts`:

```ts
import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
}

export interface JournalsIndexEvents {
  entryChanged: (event: { entry: JournalEntry; kind: "added" | "removed" }) => void;
  journalDirty: (event: { journalName: string }) => void;
}
```

- [ ] **Step 2: Write failing tests for `entryByAnchor`**

Append to `src/journals/journals-index.test.ts`:

```ts
describe("entryByAnchor", () => {
  it("returns the full entry when the anchor is registered", () => {
    const index = new JournalsIndex();
    const e = entry("daily", "2022-01-01", "Daily/2022-01-01.md");
    index.register(e);
    const result = index.entryByAnchor("daily", a("2022-01-01"));
    assert(result.isSome());
    expect(result.value).toEqual(e);
  });

  it("returns None for an unknown journal", () => {
    const index = new JournalsIndex();
    expect(index.entryByAnchor("missing", a("2022-01-01")).isNone()).toBe(true);
  });

  it("returns None for an unregistered anchor", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-01", "Daily/2022-01-01.md"));
    expect(index.entryByAnchor("daily", a("2022-01-02")).isNone()).toBe(true);
  });

  it("returns the entry with endDate when registered with one", () => {
    const index = new JournalsIndex();
    const e: JournalEntry = {
      journalName: "sprints",
      anchor: a("2022-01-01"),
      path: p("Sprints/S1.md"),
      endDate: a("2022-01-21"),
    };
    index.register(e);
    const result = index.entryByAnchor("sprints", a("2022-01-01"));
    assert(result.isSome());
    expect(result.value.endDate).toBe(a("2022-01-21"));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- src/journals/journals-index.test.ts`
Expected: 4 failures, "entryByAnchor is not a function" or equivalent.

- [ ] **Step 4: Implement `entryByAnchor`**

In `src/journals/journals-index.ts`, add this method after `entryByPath`:

```ts
entryByAnchor(journalName: string, anchor: AnchorString): Option<JournalEntry> {
  const journalIndex = this.#journals.get(journalName);
  if (!journalIndex) return Option.none();
  return journalIndex.get(anchor).flatMap((path) => Option.fromNullable(this.#byPath.get(path)));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/journals/journals-index.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/types.ts src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): extend JournalEntry and add entryByAnchor query"
```

---

## Task 2: Create errors file

**Files:**

- Create: `src/journals/errors.ts`

- [ ] **Step 1: Create errors file**

`src/journals/errors.ts`:

```ts
export class JournalsError extends Error {
  override name = "JournalsError";
}

export class JournalNotFoundError extends JournalsError {
  override name = "JournalNotFoundError";

  constructor(readonly journalName: string) {
    super(`Journal not found: ${journalName}`);
  }
}
```

No tests — per [[feedback_no_trivial_tests]], `instanceof`-only error tests are forbidden. These errors will be tested through the services that raise them.

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/errors.ts
git commit -m "feat(journals): add JournalsError base and JournalNotFoundError"
```

---

## Task 3: Add `JournalConfig` non-numbering schema and `FrontmatterFields`

**Files:**

- Create: `src/journals/config.ts`

- [ ] **Step 1: Write the schema**

`src/journals/config.ts`:

```ts
import * as v from "valibot";

import type { AnchorString } from "@/calendar";

const anchorString = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"), v.brand("AnchorString"));

const writeFixed = v.object({
  type: v.picklist(["day", "week", "month", "quarter", "year"]),
});

const writeCustom = v.object({
  type: v.literal("custom"),
  every: v.picklist(["day", "week", "month", "quarter", "year"]),
  duration: v.pipe(v.number(), v.integer(), v.minValue(1)),
  anchorDate: anchorString,
});

const writeSchema = v.union([writeFixed, writeCustom]);

const timelineEnd = v.union([
  v.object({ kind: v.literal("never") }),
  v.object({ kind: v.literal("date"), date: anchorString }),
  v.object({ kind: v.literal("repeats"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
]);

const timelineSchema = v.object({
  start: anchorString,
  end: timelineEnd,
});

const frontmatterFieldsSchema = v.object({
  dateField: v.pipe(v.string(), v.minLength(1)),
  startDateField: v.pipe(v.string(), v.minLength(1)),
  endDateField: v.pipe(v.string(), v.minLength(1)),
  addStartDate: v.boolean(),
  addEndDate: v.boolean(),
});

export type FixedWriteIntervals = v.InferOutput<typeof writeFixed>;
export type WriteCustom = v.InferOutput<typeof writeCustom>;
export type JournalWrite = v.InferOutput<typeof writeSchema>;
export type JournalTimeline = v.InferOutput<typeof timelineSchema>;
export type FrontmatterFields = v.InferOutput<typeof frontmatterFieldsSchema>;

export const FRONTMATTER_NAME_KEY = "journal";

// Schema continues in Task 4 / Task 5 once numbering is defined.
export const _schemaParts = { writeSchema, timelineSchema, frontmatterFieldsSchema, anchorString };
```

The `_schemaParts` export is a temporary holder so later tasks can compose into the final `JournalConfig` schema without re-declaring the parts.

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/config.ts
git commit -m "feat(journals): add write, timeline, and frontmatter schemas"
```

---

## Task 4: Add `NumberingSource` / `JournalNumberingConfig` schema with uniqueness

**Files:**

- Modify: `src/journals/config.ts`

- [ ] **Step 1: Append numbering schemas**

Add to `src/journals/config.ts`:

```ts
const numberingReset = v.union([
  v.object({ kind: v.literal("never") }),
  v.object({ kind: v.literal("after"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
]);

const numberingSource = v.object({
  variable: v.pipe(v.string(), v.minLength(1)),
  frontmatterKey: v.pipe(v.string(), v.minLength(1)),
  anchorValue: v.pipe(v.number(), v.integer()),
  reset: numberingReset,
});

const numberingSchema = v.pipe(
  v.object({
    enabled: v.boolean(),
    anchorDate: anchorString,
    allowBefore: v.boolean(),
    sources: v.array(numberingSource),
  }),
  v.check(
    (value) => new Set(value.sources.map((s) => s.variable)).size === value.sources.length,
    "numbering source `variable` values must be unique",
  ),
  v.check(
    (value) => new Set(value.sources.map((s) => s.frontmatterKey)).size === value.sources.length,
    "numbering source `frontmatterKey` values must be unique",
  ),
);

export type NumberingReset = v.InferOutput<typeof numberingReset>;
export type NumberingSource = v.InferOutput<typeof numberingSource>;
export type JournalNumberingConfig = v.InferOutput<typeof numberingSchema>;

// Update the holder:
export const _schemaParts = { writeSchema, timelineSchema, frontmatterFieldsSchema, numberingSchema, anchorString };
```

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/config.ts
git commit -m "feat(journals): add numbering schema with uniqueness checks"
```

---

## Task 5: Combine into `JournalConfig` collection definition

**Files:**

- Modify: `src/journals/config.ts`

- [ ] **Step 1: Add the combined schema and collection**

Replace the `_schemaParts` export in `src/journals/config.ts` with:

```ts
const journalConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  write: writeSchema,
  timeline: timelineSchema,
  dateFormat: v.pipe(v.string(), v.minLength(1)),
  frontmatter: frontmatterFieldsSchema,
  numbering: numberingSchema,
});

export type JournalConfig = v.InferOutput<typeof journalConfigSchema>;

import { defineCollection } from "@/settings";

export const journalConfigCollection = defineCollection(
  "journals",
  journalConfigSchema,
  (id) => journalDefaultsFor({ type: "day" }, id), // journalDefaultsFor in Task 6
);
```

(Move the `defineCollection` import to the top of the file with the others.)

The `journalDefaultsFor` reference produces an unresolved-symbol error until Task 6 — that's expected. The lint/type check at the end of this task will fail; do not commit until Task 6.

- [ ] **Step 2: Skip checks for now; proceed to Task 6**

Do not run checks or commit. Task 6 supplies `journalDefaultsFor`.

---

## Task 6: Implement `journalDefaultsFor`

**Files:**

- Modify: `src/journals/config.ts`

- [ ] **Step 1: Add the function above the collection definition**

In `src/journals/config.ts`, before the `journalConfigCollection` export:

```ts
const DATE_FORMATS: Record<JournalWrite["type"], string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  custom: "YYYY-MM-DD",
};

const EMPTY_ANCHOR = "" as AnchorString;

export function journalDefaultsFor(write: JournalWrite, name = ""): JournalConfig {
  const numberingForCustom: JournalNumberingConfig = {
    enabled: true,
    anchorDate: write.type === "custom" ? write.anchorDate : EMPTY_ANCHOR,
    allowBefore: false,
    sources: [
      {
        variable: "index",
        frontmatterKey: "journal-index",
        anchorValue: 1,
        reset: { kind: "never" },
      },
    ],
  };

  const numberingForFixed: JournalNumberingConfig = {
    enabled: false,
    anchorDate: EMPTY_ANCHOR,
    allowBefore: false,
    sources: [],
  };

  return {
    name,
    write,
    timeline: { start: EMPTY_ANCHOR, end: { kind: "never" } },
    dateFormat: DATE_FORMATS[write.type],
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: write.type === "custom" ? numberingForCustom : numberingForFixed,
  };
}
```

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/config.ts
git commit -m "feat(journals): add JournalConfig collection and type-aware defaults"
```

---

## Task 7: Add `JournalCycle` types and `buildCycle`

**Files:**

- Create: `src/journals/cycle.ts`

- [ ] **Step 1: Write the value-side of cycle**

`src/journals/cycle.ts`:

```ts
import { match } from "ts-pattern";

import type { AnchorString, PeriodKind } from "@/calendar";

import type { JournalWrite } from "./config";

export type JournalCycle =
  | { readonly kind: "fixed"; readonly period: PeriodKind }
  | {
      readonly kind: "custom";
      readonly every: PeriodKind;
      readonly duration: number;
      readonly anchor: AnchorString;
    };

export function buildCycle(write: JournalWrite): JournalCycle {
  return match(write)
    .with({ type: "custom" }, (w) => ({
      kind: "custom" as const,
      every: w.every,
      duration: w.duration,
      anchor: w.anchorDate,
    }))
    .otherwise((w) => ({ kind: "fixed" as const, period: w.type }));
}
```

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/cycle.ts
git commit -m "feat(journals): add JournalCycle value type and buildCycle"
```

---

## Task 8: `CycleService` skeleton + `anchorOf` for fixed variant

**Files:**

- Modify: `src/journals/cycle.ts`
- Create: `src/journals/cycle.test.ts`
- Create: `src/journals/testing.ts` (stub for fake settings)

- [ ] **Step 1: Add fake-settings helper**

`src/journals/testing.ts`:

```ts
import { assert, vi } from "vitest";

import type { Option } from "@/infrastructure/result";
import type { SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor } from "./config";

import type { JournalConfig, JournalWrite } from "./config";

export function unwrap<T>(opt: Option<T>): T {
  assert(opt.isSome(), "expected Some");
  return opt.value;
}

export function fakeSettings(journals: Record<string, JournalConfig>): SettingsService {
  return {
    getCollection: vi.fn((collection) => {
      if (collection === journalConfigCollection) {
        return {
          entries: journals,
          add: vi.fn(),
          remove: vi.fn(),
          get: (id: string) => journals[id],
        };
      }
      throw new Error(`unexpected collection: ${collection.key}`);
    }),
  } as unknown as SettingsService;
}

export function fixedJournal(name: string, write: JournalWrite, overrides: Partial<JournalConfig> = {}): JournalConfig {
  return { ...journalDefaultsFor(write, name), ...overrides };
}
```

- [ ] **Step 2: Write failing test for `anchorOf` (fixed)**

`src/journals/cycle.test.ts`:

```ts
import { Container } from "@/infrastructure/di";
import { CalendarDate } from "@/calendar";
import { JournalsIndex } from "./journals-index";
import { describe, expect, it } from "vitest";

import { CycleService } from "./cycle";
import { fakeSettings, fixedJournal } from "./testing";
import { SettingsService } from "@/settings";

function buildContainer(journals: Parameters<typeof fakeSettings>[0]) {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  return c;
}

describe("CycleService", () => {
  describe("anchorOf", () => {
    describe("fixed daily", () => {
      it("returns the date itself as the anchor", async () => {
        const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
        const cycle = await c.resolve(CycleService);
        const result = cycle.anchorOf("daily", CalendarDate.parse("2022-03-15").unwrap());
        expect(result.isSome() && result.value).toBe("2022-03-15");
      });

      it("returns None for an unknown journal", async () => {
        const c = buildContainer({});
        const cycle = await c.resolve(CycleService);
        expect(cycle.anchorOf("missing", CalendarDate.parse("2022-03-15").unwrap()).isNone()).toBe(true);
      });
    });

    describe("fixed weekly", () => {
      it("returns the year-correct anchor for a week spanning a year boundary", async () => {
        const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });
        const cycle = await c.resolve(CycleService);
        // Week containing 2020-12-30 (Wed) — that week owns Dec 30 in 2020 year.
        const result = cycle.anchorOf("weekly", CalendarDate.parse("2020-12-30").unwrap());
        expect(result.isSome() && result.value.startsWith("2020")).toBe(true);
      });
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: failures (CycleService not yet exporting `anchorOf` or constructor doesn't accept DI yet).

- [ ] **Step 4: Implement `CycleService` skeleton with `anchorOf` for fixed**

Add to `src/journals/cycle.ts`:

```ts
import { CalendarDate, DayPeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { JournalsIndex } from "./journals-index";
import { journalConfigCollection } from "./config";

import type { JournalConfig } from "./config";

const PERIOD_CTORS: Record<PeriodKind, (d: CalendarDate) => { anchor: CalendarDate }> = {
  day: DayPeriod.containing,
  week: WeekPeriod.containing,
  month: MonthPeriod.containing,
  quarter: QuarterPeriod.containing,
  year: YearPeriod.containing,
  decade: (d) => ({ anchor: d }), // unused by cycles, present for exhaustiveness
};

export class CycleService {
  readonly #settings = inject(SettingsService);
  readonly #index = inject(JournalsIndex);

  anchorOf(name: string, date: CalendarDate): Option<AnchorString> {
    return this.#cycleFor(name).flatMap((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => {
          const period = PERIOD_CTORS[c.period](date);
          return Option.some(period.anchor.toAnchor());
        })
        .with({ kind: "custom" }, () => Option.none<AnchorString>()) // implemented in Task 9
        .exhaustive(),
    );
  }

  #cycleFor(name: string): Option<JournalCycle> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    return Option.fromNullable(config).map((c: JournalConfig) => buildCycle(c.write));
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts src/journals/testing.ts
git commit -m "feat(journals): CycleService.anchorOf for fixed variant"
```

---

## Task 9: `CycleService.anchorOf` for custom variant + month-end clipping

**Files:**

- Modify: `src/journals/cycle.ts`
- Modify: `src/journals/cycle.test.ts`
- Modify: `src/journals/testing.ts`

- [ ] **Step 1: Add custom-journal builder**

In `src/journals/testing.ts`, append:

```ts
import type { AnchorString } from "@/calendar";

export function customJournal(
  name: string,
  every: NonNullable<JournalWrite extends { every: infer E } ? E : never>,
  duration: number,
  anchorDate: string,
  overrides: Partial<JournalConfig> = {},
): JournalConfig {
  const base = journalDefaultsFor({ type: "custom", every, duration, anchorDate: anchorDate as AnchorString }, name);
  return { ...base, ...overrides };
}
```

- [ ] **Step 2: Write failing test for custom `anchorOf`**

Append to `src/journals/cycle.test.ts`:

```ts
describe("custom monthly", () => {
  it("lands on the configured anchor for dates inside the first step", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = await c.resolve(CycleService);
    const result = cycle.anchorOf("s", CalendarDate.parse("2024-01-20").unwrap());
    expect(result.isSome() && result.value).toBe("2024-01-15");
  });

  it("steps forward to the next anchor for a date past the first interval end", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = await c.resolve(CycleService);
    const result = cycle.anchorOf("s", CalendarDate.parse("2024-02-20").unwrap());
    expect(result.isSome() && result.value).toBe("2024-02-15");
  });

  it("clips month-end when anchor is the 30th and target month is February", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-30") });
    const cycle = await c.resolve(CycleService);
    const result = cycle.anchorOf("s", CalendarDate.parse("2024-02-28").unwrap());
    expect(result.isSome() && result.value).toBe("2024-02-29"); // leap year
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: 3 failures.

- [ ] **Step 4: Implement custom `anchorOf` with month-end clipping**

In `src/journals/cycle.ts`, add a helper and replace the custom branch:

```ts
import { localMoment } from "@/calendar/calendar"; // may need to widen the calendar barrel; if not exported, import via @/calendar internals path or extend the barrel in this task

function customStepForward(anchor: AnchorString, every: PeriodKind, duration: number): AnchorString {
  const m = localMoment(anchor, "YYYY-MM-DD", true);
  if (every === "month" && m.date() > 28) {
    const monthEnd = m.clone().endOf("month");
    const delta = monthEnd.diff(m, "days");
    const nextEnd = monthEnd.clone().add(duration, "month").endOf("month");
    return nextEnd.clone().subtract(delta, "days").format("YYYY-MM-DD") as AnchorString;
  }
  return m.clone().add(duration, every).format("YYYY-MM-DD") as AnchorString;
}

function customStepBackward(anchor: AnchorString, every: PeriodKind, duration: number): AnchorString {
  const m = localMoment(anchor, "YYYY-MM-DD", true);
  if (every === "month" && m.date() > 28) {
    const monthEnd = m.clone().endOf("month");
    const delta = monthEnd.diff(m, "days");
    const prevEnd = monthEnd.clone().subtract(duration, "month").endOf("month");
    return prevEnd.clone().add(delta, "days").format("YYYY-MM-DD") as AnchorString;
  }
  return m.clone().subtract(duration, every).format("YYYY-MM-DD") as AnchorString;
}
```

Replace the custom-branch placeholder in `anchorOf` with:

```ts
.with({ kind: "custom" }, (c) => {
  // Walk forward from anchor by step until the next-step start is past `date`.
  let current = c.anchor;
  let nextStart = customStepForward(current, c.every, c.duration);
  const target = date.toAnchor();
  if (target < c.anchor) {
    // Walk backwards
    while (target < current) {
      current = customStepBackward(current, c.every, c.duration);
    }
    return Option.some(current);
  }
  while (nextStart <= target) {
    current = nextStart;
    nextStart = customStepForward(current, c.every, c.duration);
  }
  return Option.some(current);
})
```

If `localMoment` isn't exported from `@/calendar`, add it to the barrel as part of this task; mark the addition in the commit message.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts src/journals/testing.ts src/calendar/index.ts
git commit -m "feat(journals): CycleService.anchorOf for custom variant with month-end clipping"
```

---

## Task 10: `CycleService` next/previous anchors (both variants)

**Files:**

- Modify: `src/journals/cycle.ts`
- Modify: `src/journals/cycle.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/cycle.test.ts`:

```ts
describe("nextAnchor", () => {
  it("returns the next week anchor for fixed weekly", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const fromMon = cycle.anchorOf("w", CalendarDate.parse("2024-03-04").unwrap()).unwrap();
    const next = cycle.nextAnchor("w", fromMon);
    expect(next.isSome() && next.value).toBe("2024-03-11");
  });

  it("returns next anchor for custom monthly", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = await c.resolve(CycleService);
    const next = cycle.nextAnchor("s", "2024-01-15" as AnchorString);
    expect(next.isSome() && next.value).toBe("2024-02-15");
  });

  it("returns None for an unknown journal", async () => {
    const c = buildContainer({});
    const cycle = await c.resolve(CycleService);
    expect(cycle.nextAnchor("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
  });
});

describe("previousAnchor", () => {
  it("returns the previous week anchor for fixed weekly", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const fromMon = cycle.anchorOf("w", CalendarDate.parse("2024-03-04").unwrap()).unwrap();
    const prev = cycle.previousAnchor("w", fromMon);
    expect(prev.isSome() && prev.value).toBe("2024-02-26");
  });

  it("returns previous anchor for custom monthly", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = await c.resolve(CycleService);
    const prev = cycle.previousAnchor("s", "2024-02-15" as AnchorString);
    expect(prev.isSome() && prev.value).toBe("2024-01-15");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: 5 failures (methods not defined).

- [ ] **Step 3: Implement `nextAnchor` and `previousAnchor`**

In `src/journals/cycle.ts`, add to `CycleService`:

```ts
nextAnchor(name: string, from: AnchorString): Option<AnchorString> {
  return this.#cycleFor(name).map((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));
        return period.anchor.toAnchor(); // placeholder — replaced below
      })
      .otherwise(() => from), // placeholder
  );
}
```

Replace with the correct implementation that uses Period's `next()`:

```ts
nextAnchor(name: string, from: AnchorString): Option<AnchorString> {
  return this.#cycleFor(name).flatMap((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));
        // PERIOD_CTORS returns `{ anchor }` only — extend it to expose `next()` and `previous()`.
        return Option.some((period as { next(): { anchor: CalendarDate } }).next().anchor.toAnchor());
      })
      .with({ kind: "custom" }, (c) => {
        // Extension-aware step is added in Task 11. For now, pure step.
        return Option.some(customStepForward(from, c.every, c.duration));
      })
      .exhaustive(),
  );
}

previousAnchor(name: string, from: AnchorString): Option<AnchorString> {
  return this.#cycleFor(name).flatMap((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(from));
        return Option.some((period as { previous(): { anchor: CalendarDate } }).previous().anchor.toAnchor());
      })
      .with({ kind: "custom" }, (c) => Option.some(customStepBackward(from, c.every, c.duration)))
      .exhaustive(),
  );
}
```

Update `PERIOD_CTORS` typing so the returned object exposes `next` / `previous`:

```ts
type PeriodLike = { anchor: CalendarDate; next(): PeriodLike; previous(): PeriodLike };
const PERIOD_CTORS: Record<PeriodKind, (d: CalendarDate) => PeriodLike> = {
  day: DayPeriod.containing,
  week: WeekPeriod.containing,
  month: MonthPeriod.containing,
  quarter: QuarterPeriod.containing,
  year: YearPeriod.containing,
  decade: DecadePeriod.containing,
};
```

(Import `DecadePeriod` from `@/calendar`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts
git commit -m "feat(journals): CycleService nextAnchor and previousAnchor"
```

---

## Task 11: `CycleService` extension awareness for custom variant

**Files:**

- Modify: `src/journals/cycle.ts`
- Modify: `src/journals/cycle.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/cycle.test.ts`:

```ts
describe("custom variant extension awareness", () => {
  it("nextAnchor after an extended interval starts at endDate + 1 day", async () => {
    const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
    const index = await c.resolve(JournalsIndex);
    index.register({
      journalName: "s",
      anchor: "2024-01-01" as AnchorString,
      path: "S/1.md" as VaultPath,
      endDate: "2024-01-14" as AnchorString, // extended through Jan 14 instead of Jan 7
    });
    const cycle = await c.resolve(CycleService);
    const next = cycle.nextAnchor("s", "2024-01-01" as AnchorString);
    expect(next.isSome() && next.value).toBe("2024-01-15");
  });
});
```

(Add `import type { VaultPath } from "@/infrastructure/host";` if not present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: failure — `nextAnchor` returns `2024-01-08` instead of `2024-01-15`.

- [ ] **Step 3: Update custom-variant `nextAnchor` to consult index**

In `src/journals/cycle.ts`, replace the custom branch of `nextAnchor`:

```ts
.with({ kind: "custom" }, (c) => {
  const stored = this.#index.entryByAnchor(name, from);
  if (stored.isSome() && stored.value.endDate !== undefined) {
    const m = localMoment(stored.value.endDate, "YYYY-MM-DD", true).add(1, "day");
    return Option.some(m.format("YYYY-MM-DD") as AnchorString);
  }
  return Option.some(customStepForward(from, c.every, c.duration));
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts
git commit -m "feat(journals): CycleService.nextAnchor honors custom extensions"
```

---

## Task 12: `CycleService.startOf` and `endOf` (both variants, extension-aware)

**Files:**

- Modify: `src/journals/cycle.ts`
- Modify: `src/journals/cycle.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/cycle.test.ts`:

```ts
describe("startOf and endOf", () => {
  it("returns the anchor's period start/end for fixed weekly", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const anchor = cycle.anchorOf("w", CalendarDate.parse("2024-03-06").unwrap()).unwrap();
    const start = cycle.startOf("w", anchor);
    const end = cycle.endOf("w", anchor);
    expect(start.isSome() && start.value.toAnchor()).toBe("2024-03-04");
    expect(end.isSome() && end.value.toAnchor()).toBe("2024-03-10");
  });

  it("returns the anchor and computed end for custom monthly", async () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = await c.resolve(CycleService);
    const start = cycle.startOf("s", "2024-01-15" as AnchorString);
    const end = cycle.endOf("s", "2024-01-15" as AnchorString);
    expect(start.isSome() && start.value.toAnchor()).toBe("2024-01-15");
    expect(end.isSome() && end.value.toAnchor()).toBe("2024-02-14");
  });

  it("returns the stored endDate for custom anchor with extension", async () => {
    const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
    const index = await c.resolve(JournalsIndex);
    index.register({
      journalName: "s",
      anchor: "2024-01-01" as AnchorString,
      path: "S/1.md" as VaultPath,
      endDate: "2024-01-14" as AnchorString,
    });
    const cycle = await c.resolve(CycleService);
    const end = cycle.endOf("s", "2024-01-01" as AnchorString);
    expect(end.isSome() && end.value.toAnchor()).toBe("2024-01-14");
  });

  it("returns None for unknown journal", async () => {
    const c = buildContainer({});
    const cycle = await c.resolve(CycleService);
    expect(cycle.startOf("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    expect(cycle.endOf("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: failures.

- [ ] **Step 3: Implement `startOf` and `endOf`**

In `src/journals/cycle.ts`, add to `CycleService`:

```ts
startOf(name: string, anchor: AnchorString): Option<CalendarDate> {
  return this.#cycleFor(name).map((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor));
        return (period as { start: CalendarDate }).start;
      })
      .with({ kind: "custom" }, () => CalendarDate.fromAnchor(anchor))
      .exhaustive(),
  );
}

endOf(name: string, anchor: AnchorString): Option<CalendarDate> {
  return this.#cycleFor(name).map((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const period = PERIOD_CTORS[c.period](CalendarDate.fromAnchor(anchor));
        return (period as { end: CalendarDate }).end;
      })
      .with({ kind: "custom" }, (c) => {
        const stored = this.#index.entryByAnchor(name, anchor);
        if (stored.isSome() && stored.value.endDate !== undefined) {
          return CalendarDate.fromAnchor(stored.value.endDate);
        }
        const next = customStepForward(anchor, c.every, c.duration);
        const end = localMoment(next, "YYYY-MM-DD", true).subtract(1, "day");
        return CalendarDate.fromAnchor(end.format("YYYY-MM-DD") as AnchorString);
      })
      .exhaustive(),
  );
}
```

Update `PERIOD_CTORS` (the `PeriodLike` type) to include `start` and `end`:

```ts
type PeriodLike = {
  anchor: CalendarDate;
  start: CalendarDate;
  end: CalendarDate;
  next(): PeriodLike;
  previous(): PeriodLike;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts
git commit -m "feat(journals): CycleService startOf and endOf with custom extensions"
```

---

## Task 13: `CycleService.offsets` and `countRepeats`

**Files:**

- Modify: `src/journals/cycle.ts`
- Modify: `src/journals/cycle.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/cycle.test.ts`:

```ts
describe("offsets", () => {
  it("returns +day-from-start, -day-to-end for a date inside a weekly anchor", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const off = cycle.offsets("w", CalendarDate.parse("2024-03-06").unwrap()); // Wed of Mon-start week
    expect(off.isSome() && off.value).toEqual([3, -4]); // day 3, 4 days remaining
  });

  it("returns None for unknown journal", async () => {
    const c = buildContainer({});
    const cycle = await c.resolve(CycleService);
    expect(cycle.offsets("missing", CalendarDate.parse("2024-01-01").unwrap()).isNone()).toBe(true);
  });
});

describe("countRepeats", () => {
  it("counts intervals between two anchors for fixed weekly", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const result = cycle.countRepeats("w", "2024-01-01" as AnchorString, "2024-01-22" as AnchorString);
    expect(result.isSome() && result.value).toBe(3);
  });

  it("returns symmetric count regardless of order (absolute value)", async () => {
    const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
    const cycle = await c.resolve(CycleService);
    const fwd = cycle.countRepeats("w", "2024-01-01" as AnchorString, "2024-01-22" as AnchorString).unwrap();
    const bwd = cycle.countRepeats("w", "2024-01-22" as AnchorString, "2024-01-01" as AnchorString).unwrap();
    expect(Math.abs(fwd)).toBe(Math.abs(bwd));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: failures.

- [ ] **Step 3: Implement `offsets` and `countRepeats`**

In `src/journals/cycle.ts`, add to `CycleService`:

```ts
offsets(name: string, date: CalendarDate): Option<readonly [positive: number, negative: number]> {
  return this.anchorOf(name, date).flatMap((anchor) =>
    this.startOf(name, anchor).flatMap((start) =>
      this.endOf(name, anchor).map((end) => {
        const d = localMoment(date.toAnchor(), "YYYY-MM-DD", true);
        const startM = localMoment(start.toAnchor(), "YYYY-MM-DD", true);
        const endM = localMoment(end.toAnchor(), "YYYY-MM-DD", true);
        return [d.diff(startM, "days") + 1, d.diff(endM, "days") - 1] as const;
      }),
    ),
  );
}

countRepeats(name: string, from: AnchorString, to: AnchorString): Option<number> {
  return this.#cycleFor(name).map((cycle) =>
    match(cycle)
      .with({ kind: "fixed" }, (c) => {
        const a = localMoment(from, "YYYY-MM-DD", true);
        const b = localMoment(to, "YYYY-MM-DD", true);
        return Math.ceil(b.diff(a, c.period));
      })
      .with({ kind: "custom" }, (c) => {
        // Step from `from` toward `to` until we cross it; sign follows direction.
        let current = from;
        let count = 0;
        if (from <= to) {
          while (current < to) {
            const next = customStepForward(current, c.every, c.duration);
            if (next > to) break;
            current = next;
            count++;
          }
          return count;
        }
        while (current > to) {
          const prev = customStepBackward(current, c.every, c.duration);
          if (prev < to) break;
          current = prev;
          count++;
        }
        return -count;
      })
      .exhaustive(),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts
git commit -m "feat(journals): CycleService offsets and countRepeats"
```

---

## Task 14: `TimelineService` (all methods)

**Files:**

- Create: `src/journals/timeline.ts`
- Create: `src/journals/timeline.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { TimelineService } from "./timeline";
import { fakeSettings, fixedJournal, customJournal } from "./testing";

function build(journals: Parameters<typeof fakeSettings>[0]) {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  return c;
}

describe("TimelineService", () => {
  describe("contains", () => {
    it("returns true for anchor >= start when end.kind is never", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const tl = await c.resolve(TimelineService);
      expect(tl.contains("d", "2024-06-15" as AnchorString)).toBe(true);
    });

    it("returns false for anchor before start", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const tl = await c.resolve(TimelineService);
      expect(tl.contains("d", "2023-12-31" as AnchorString)).toBe(false);
    });

    it("returns false for anchor after end.date", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "2024-06-30" as AnchorString },
            },
          },
        ),
      });
      const tl = await c.resolve(TimelineService);
      expect(tl.contains("d", "2024-07-01" as AnchorString)).toBe(false);
    });

    it("returns false once `count` repeats elapsed", async () => {
      const c = build({
        w: fixedJournal(
          "w",
          { type: "week" },
          {
            timeline: { start: "2024-01-01" as AnchorString, end: { kind: "repeats", count: 3 } },
          },
        ),
      });
      const tl = await c.resolve(TimelineService);
      expect(tl.contains("w", "2024-01-22" as AnchorString)).toBe(false); // 3rd anchor is 2024-01-15
      expect(tl.contains("w", "2024-01-15" as AnchorString)).toBe(true);
    });

    it("returns false for unknown journal", async () => {
      const c = build({});
      const tl = await c.resolve(TimelineService);
      expect(tl.contains("missing", "2024-01-01" as AnchorString)).toBe(false);
    });
  });

  describe("startOf and endOf", () => {
    it("startOf returns the start CalendarDate", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const tl = await c.resolve(TimelineService);
      const start = tl.startOf("d");
      expect(start.isSome() && start.value.toAnchor()).toBe("2024-01-01");
    });

    it("endOf returns None for end.kind === never", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const tl = await c.resolve(TimelineService);
      expect(tl.endOf("d").isNone()).toBe(true);
    });

    it("endOf returns Some(date) for end.kind === date", async () => {
      const c = build({
        d: fixedJournal(
          "d",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "2024-06-30" as AnchorString },
            },
          },
        ),
      });
      const tl = await c.resolve(TimelineService);
      const end = tl.endOf("d");
      expect(end.isSome() && end.value.toAnchor()).toBe("2024-06-30");
    });

    it("endOf returns the computed end for end.kind === repeats", async () => {
      const c = build({
        w: fixedJournal(
          "w",
          { type: "week" },
          {
            timeline: { start: "2024-01-01" as AnchorString, end: { kind: "repeats", count: 3 } },
          },
        ),
      });
      const tl = await c.resolve(TimelineService);
      const end = tl.endOf("w");
      expect(end.isSome() && end.value.toAnchor()).toBe("2024-01-21"); // 3rd anchor ends Sun Jan 21
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/timeline.test.ts`
Expected: failures (TimelineService doesn't exist).

- [ ] **Step 3: Implement `TimelineService`**

`src/journals/timeline.ts`:

```ts
import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { journalConfigCollection } from "./config";

import type { AnchorString } from "@/calendar";

export class TimelineService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);

  contains(name: string, anchor: AnchorString): boolean {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    if (!config) return false;
    if (anchor < config.timeline.start) return false;
    return match(config.timeline.end)
      .with({ kind: "never" }, () => true)
      .with({ kind: "date" }, ({ date }) => anchor <= date)
      .with({ kind: "repeats" }, ({ count }) => {
        const repeats = this.#cycle.countRepeats(name, config.timeline.start, anchor);
        return repeats.isSome() && repeats.value < count;
      })
      .exhaustive();
  }

  startOf(name: string): Option<CalendarDate> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    return Option.fromNullable(config).map((c) => CalendarDate.fromAnchor(c.timeline.start));
  }

  endOf(name: string): Option<CalendarDate> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    if (!config) return Option.none();
    return match(config.timeline.end)
      .with({ kind: "never" }, () => Option.none<CalendarDate>())
      .with({ kind: "date" }, ({ date }) => Option.some(CalendarDate.fromAnchor(date)))
      .with({ kind: "repeats" }, ({ count }) => {
        const startAnchorOpt = this.#cycle.anchorOf(name, CalendarDate.fromAnchor(config.timeline.start));
        if (startAnchorOpt.isNone()) return Option.none<CalendarDate>();
        let current = startAnchorOpt.value;
        for (let i = 1; i < count; i++) {
          const next = this.#cycle.nextAnchor(name, current);
          if (next.isNone()) return Option.none<CalendarDate>();
          current = next.value;
        }
        return this.#cycle.endOf(name, current);
      })
      .exhaustive();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/timeline.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/timeline.ts src/journals/timeline.test.ts
git commit -m "feat(journals): TimelineService contains/startOf/endOf"
```

---

## Task 15: `NumberingService` — single-source cases (enabled, allowBefore, reset.never, reset.after)

**Files:**

- Create: `src/journals/numbering.ts`
- Create: `src/journals/numbering.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/numbering.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { customJournal, fakeSettings, fixedJournal } from "./testing";

function build(journals: Parameters<typeof fakeSettings>[0]) {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  return c;
}

describe("NumberingService", () => {
  describe("assignNumbers — single source", () => {
    it("returns None when enabled is false", async () => {
      const c = build({ w: fixedJournal("w", { type: "week" }) }); // fixed defaults: enabled false
      const n = await c.resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for unknown journal", async () => {
      const c = build({});
      const n = await c.resolve(NumberingService);
      expect(n.assignNumbers("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns anchorValue at the anchorDate for reset.never", async () => {
      const c = build({ s: customJournal("s", "week", 1, "2024-01-01") }); // default source: anchorValue=1 reset.never
      const n = await c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-01" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 1 });
    });

    it("returns monotonically increasing values for reset.never", async () => {
      const c = build({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = await c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-15" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 3 }); // 1 + 2 weeks
    });

    it("returns None for anchor before anchorDate when allowBefore is false", async () => {
      const c = build({ s: customJournal("s", "week", 1, "2024-01-15") });
      const n = await c.resolve(NumberingService);
      expect(n.assignNumbers("s", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("cycles values for reset.after { count: 3 }", async () => {
      const c = build({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "after", count: 3 },
              },
            ],
          },
        }),
      });
      const n = await c.resolve(NumberingService);
      expect(n.assignNumbers("s", "2024-01-01" as AnchorString).unwrap()).toEqual({ index: 1 });
      expect(n.assignNumbers("s", "2024-01-08" as AnchorString).unwrap()).toEqual({ index: 2 });
      expect(n.assignNumbers("s", "2024-01-15" as AnchorString).unwrap()).toEqual({ index: 3 });
      expect(n.assignNumbers("s", "2024-01-22" as AnchorString).unwrap()).toEqual({ index: 1 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: failures.

- [ ] **Step 3: Implement `NumberingService` single-source**

`src/journals/numbering.ts`:

```ts
import { match } from "ts-pattern";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { journalConfigCollection } from "./config";
import { JournalsIndex } from "./journals-index";

import type { NumberingSource } from "./config";

export class NumberingService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);
  readonly #index = inject(JournalsIndex);

  assignNumbers(name: string, anchor: AnchorString): Option<Readonly<Record<string, number>>> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    if (!config) return Option.none();
    const numbering = config.numbering;
    if (!numbering.enabled) return Option.none();
    if (!numbering.allowBefore && anchor < numbering.anchorDate) return Option.none();

    const stepsOpt = this.#cycle.countRepeats(name, numbering.anchorDate, anchor);
    if (stepsOpt.isNone()) return Option.none();
    const stepsInnermost = stepsOpt.value;

    return Option.some(this.#cascade(numbering.sources, stepsInnermost));
  }

  #cascade(sources: readonly NumberingSource[], stepsInnermost: number): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    // sources ordered outer → inner; innermost is sources[sources.length - 1].
    let innerStepsAccumulator = stepsInnermost;
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i]!;
      const steps = i === sources.length - 1 ? stepsInnermost : innerStepsAccumulator;
      const raw = source.anchorValue + steps;
      const value = match(source.reset)
        .with({ kind: "never" }, () => raw)
        .with({ kind: "after" }, ({ count }) => ((raw - source.anchorValue) % count) + source.anchorValue)
        .exhaustive();
      result[source.variable] = value;
      // Outer source advances by floor(steps / inner.reset.count) — when inner has reset.kind === "after".
      innerStepsAccumulator = match(source.reset)
        .with({ kind: "after" }, ({ count }) => Math.floor(steps / count))
        .with({ kind: "never" }, () => 0)
        .exhaustive();
    }
    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/numbering.ts src/journals/numbering.test.ts
git commit -m "feat(journals): NumberingService single-source cascade"
```

---

## Task 16: `NumberingService` — multi-source cascade

**Files:**

- Modify: `src/journals/numbering.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/numbering.test.ts`:

```ts
describe("assignNumbers — multi-source cascade", () => {
  it("release stays at anchorValue for 6 sprints, then advances", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [
            { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
            {
              variable: "sprint",
              frontmatterKey: "journal-sprint",
              anchorValue: 1,
              reset: { kind: "after", count: 6 },
            },
          ],
        },
      }),
    });
    const n = await c.resolve(NumberingService);
    expect(n.assignNumbers("s", "2024-01-01" as AnchorString).unwrap()).toEqual({ release: 4711, sprint: 1 });
    expect(n.assignNumbers("s", "2024-01-29" as AnchorString).unwrap()).toEqual({ release: 4711, sprint: 5 });
    expect(n.assignNumbers("s", "2024-02-05" as AnchorString).unwrap()).toEqual({ release: 4711, sprint: 6 });
    expect(n.assignNumbers("s", "2024-02-12" as AnchorString).unwrap()).toEqual({ release: 4712, sprint: 1 });
  });

  it("outer source stays at anchorValue when inner reset is never", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [
            { variable: "phase", frontmatterKey: "journal-phase", anchorValue: 1, reset: { kind: "never" } },
            { variable: "n", frontmatterKey: "journal-n", anchorValue: 1, reset: { kind: "never" } },
          ],
        },
      }),
    });
    const n = await c.resolve(NumberingService);
    expect(n.assignNumbers("s", "2024-01-29" as AnchorString).unwrap()).toEqual({ phase: 1, n: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

The implementation from Task 15 already handles multi-source via the `innerStepsAccumulator` loop. If tests don't pass, debug the `#cascade` algorithm.

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/journals/numbering.test.ts
git commit -m "test(journals): cover multi-source numbering cascade"
```

---

## Task 17: `NumberingService` — stored-basis optimization

**Files:**

- Modify: `src/journals/numbering.ts`
- Modify: `src/journals/numbering.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/numbering.test.ts`:

```ts
import type { VaultPath } from "@/infrastructure/host";

describe("assignNumbers — stored-basis", () => {
  it("uses a stored entry's numbers as basis to skip walking back to anchorDate", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2020-01-06") });
    const index = await c.resolve(JournalsIndex);
    // Register a stored entry far ahead, with explicit numbers.
    index.register({
      journalName: "s",
      anchor: "2024-01-01" as AnchorString,
      path: "S/X.md" as VaultPath,
      numbers: { index: 200 },
    });
    const n = await c.resolve(NumberingService);
    // Querying close to the stored entry uses it as basis.
    expect(n.assignNumbers("s", "2024-01-08" as AnchorString).unwrap()).toEqual({ index: 201 });
  });
});
```

- [ ] **Step 2: Run test to verify it passes or document why it doesn't**

The current implementation always walks from `anchorDate`. Without the optimization, the test may still pass (correct result) but slowly. To make the optimization observable as a test, also assert: when querying a date one step from the stored entry's anchor, the result differs from the non-stored case only if the stored numbers don't match the cascade.

Replace the test with an assertion that the stored numbers override the computed cascade:

```ts
it("returns numbers based on stored entry when stored numbers differ from computed cascade", async () => {
  const c = build({ s: customJournal("s", "week", 1, "2020-01-06") });
  const index = await c.resolve(JournalsIndex);
  // Compute the cascade-default for 2024-01-01 (would be a large value from anchor).
  const n = await c.resolve(NumberingService);
  const computed = n.assignNumbers("s", "2024-01-08" as AnchorString).unwrap();
  expect(computed.index).toBeGreaterThan(200); // cascade value

  // Now register a stored entry that breaks the cascade and re-query.
  index.register({
    journalName: "s",
    anchor: "2024-01-01" as AnchorString,
    path: "S/X.md" as VaultPath,
    numbers: { index: 200 },
  });
  // Cache will need clearing — this test will pass after Task 18 (cache invalidation).
  // For Task 17, manually instantiate a fresh service:
  const c2 = build({ s: customJournal("s", "week", 1, "2020-01-06") });
  const index2 = await c2.resolve(JournalsIndex);
  index2.register({
    journalName: "s",
    anchor: "2024-01-01" as AnchorString,
    path: "S/X.md" as VaultPath,
    numbers: { index: 200 },
  });
  const n2 = await c2.resolve(NumberingService);
  const withBasis = n2.assignNumbers("s", "2024-01-08" as AnchorString).unwrap();
  expect(withBasis).toEqual({ index: 201 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: the `withBasis` assertion fails (returns cascade-from-anchorDate, not from stored basis).

- [ ] **Step 4: Implement stored-basis optimization**

In `src/journals/numbering.ts`, prepend to `assignNumbers` before the cycle-count call:

```ts
// Stored-basis optimization
const previousEntry = this.#index.findPrevious(name, anchor);
const numbersBasis = previousEntry
  .flatMap((path) => this.#index.entryByPath(path))
  .flatMap((entry) => Option.fromNullable(entry.numbers).map((numbers) => ({ anchor: entry.anchor, numbers })));

if (numbersBasis.isSome()) {
  const stepsFromBasisOpt = this.#cycle.countRepeats(name, numbersBasis.value.anchor, anchor);
  if (stepsFromBasisOpt.isSome()) {
    return Option.some(this.#cascadeFromBasis(numbering.sources, numbersBasis.value.numbers, stepsFromBasisOpt.value));
  }
}
```

Add a `#cascadeFromBasis` helper:

```ts
#cascadeFromBasis(
  sources: readonly NumberingSource[],
  basis: Readonly<Record<string, number>>,
  stepsFromBasis: number,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  let innerStepsAccumulator = stepsFromBasis;
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i]!;
    const steps = i === sources.length - 1 ? stepsFromBasis : innerStepsAccumulator;
    const basisValue = basis[source.variable] ?? source.anchorValue;
    const raw = basisValue + steps;
    const value = match(source.reset)
      .with({ kind: "never" }, () => raw)
      .with({ kind: "after" }, ({ count }) =>
        ((raw - source.anchorValue) % count + count) % count + source.anchorValue,
      )
      .exhaustive();
    result[source.variable] = value;
    innerStepsAccumulator = match(source.reset)
      .with({ kind: "after" }, ({ count }) => Math.floor(steps / count))
      .with({ kind: "never" }, () => 0)
      .exhaustive();
  }
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/numbering.ts src/journals/numbering.test.ts
git commit -m "feat(journals): NumberingService uses stored entries as cascade basis"
```

---

## Task 18: `NumberingService` — per-anchor cache with `journalDirty` invalidation

**Files:**

- Modify: `src/journals/numbering.ts`
- Modify: `src/journals/numbering.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/journals/numbering.test.ts`:

```ts
describe("cache invalidation", () => {
  it("recomputes after journalDirty is emitted", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2024-01-01") });
    const n = await c.resolve(NumberingService);
    const index = await c.resolve(JournalsIndex);

    const initial = n.assignNumbers("s", "2024-01-08" as AnchorString).unwrap();
    expect(initial).toEqual({ index: 2 });

    // Register a stored entry that becomes the new basis.
    index.register({
      journalName: "s",
      anchor: "2024-01-01" as AnchorString,
      path: "S/X.md" as VaultPath,
      numbers: { index: 100 },
    });
    await Promise.resolve(); // flush microtask so journalDirty fires.

    const recomputed = n.assignNumbers("s", "2024-01-08" as AnchorString).unwrap();
    expect(recomputed).toEqual({ index: 101 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: the `recomputed` assertion fails (cache still has the initial value).

Note: this test will only fail once a cache is introduced. Before the cache existed, every call recomputed and would return the new value. To make the test meaningful, **the cache is introduced and the invalidation tested together** — skip the "verify failure" step if no cache exists yet, and proceed directly to implementing both.

- [ ] **Step 3: Add cache + invalidation**

In `src/journals/numbering.ts`, add to the class:

```ts
readonly #cache = new Map<string, { fp: string; values: Map<AnchorString, Readonly<Record<string, number>> | null> }>();

constructor() {
  this.#index.events.on("journalDirty", ({ journalName }) => {
    this.#cache.delete(journalName);
  });
}
```

Wrap `assignNumbers` with cache lookup/store:

```ts
assignNumbers(name: string, anchor: AnchorString): Option<Readonly<Record<string, number>>> {
  const config = this.#settings.getCollection(journalConfigCollection).get(name);
  if (!config) return Option.none();
  const numbering = config.numbering;
  const fp = JSON.stringify(numbering);

  let bucket = this.#cache.get(name);
  if (bucket && bucket.fp !== fp) {
    this.#cache.delete(name);
    bucket = undefined;
  }
  if (!bucket) {
    bucket = { fp, values: new Map() };
    this.#cache.set(name, bucket);
  }
  const cached = bucket.values.get(anchor);
  if (cached !== undefined) {
    return cached === null ? Option.none() : Option.some(cached);
  }

  const result = this.#compute(name, anchor, numbering);
  bucket.values.set(anchor, result.isSome() ? result.value : null);
  return result;
}

#compute(name: string, anchor: AnchorString, numbering: JournalConfig["numbering"]): Option<Readonly<Record<string, number>>> {
  if (!numbering.enabled) return Option.none();
  if (!numbering.allowBefore && anchor < numbering.anchorDate) return Option.none();
  // ... rest of the original assignNumbers body (stored-basis + cascade)
}
```

Move the original assignNumbers body into `#compute`. Update imports for `JournalConfig`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/numbering.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/numbering.ts src/journals/numbering.test.ts
git commit -m "feat(journals): NumberingService caches per-anchor and invalidates on journalDirty"
```

---

## Task 19: `FrontmatterService.parseEntry`

**Files:**

- Create: `src/journals/frontmatter.ts`
- Create: `src/journals/frontmatter.test.ts`
- Modify: `src/journals/types.ts` (add `JournalMetadata`)

- [ ] **Step 1: Add `JournalMetadata` to types**

Append to `src/journals/types.ts`:

```ts
export interface JournalMetadata {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
}
```

- [ ] **Step 2: Write failing tests for `parseEntry`**

`src/journals/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { customJournal, fakeSettings, fixedJournal } from "./testing";

function build(journals: Parameters<typeof fakeSettings>[0]) {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  return c;
}

describe("FrontmatterService.parseEntry", () => {
  it("returns Some(entry) for a valid frontmatter with the daily journal", async () => {
    const c = build({ daily: fixedJournal("daily", { type: "day" }) });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.parseEntry("D/2024-01-01.md" as VaultPath, { journal: "daily", "journal-date": "2024-01-01" });
    expect(result.isSome() && result.value).toEqual({
      journalName: "daily",
      anchor: "2024-01-01",
      path: "D/2024-01-01.md",
    });
  });

  it("returns None when journal key is missing", async () => {
    const c = build({ daily: fixedJournal("daily", { type: "day" }) });
    const fm = await c.resolve(FrontmatterService);
    expect(fm.parseEntry("X.md" as VaultPath, { "journal-date": "2024-01-01" }).isNone()).toBe(true);
  });

  it("returns None when the journal does not exist in settings", async () => {
    const c = build({});
    const fm = await c.resolve(FrontmatterService);
    expect(fm.parseEntry("X.md" as VaultPath, { journal: "missing", "journal-date": "2024-01-01" }).isNone()).toBe(
      true,
    );
  });

  it("returns None when the date field is invalid", async () => {
    const c = build({ daily: fixedJournal("daily", { type: "day" }) });
    const fm = await c.resolve(FrontmatterService);
    expect(fm.parseEntry("X.md" as VaultPath, { journal: "daily", "journal-date": "not-a-date" }).isNone()).toBe(true);
  });

  it("includes endDate when present", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: true,
        },
      }),
    });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.parseEntry("S/1.md" as VaultPath, {
      journal: "s",
      "journal-date": "2024-01-01",
      "journal-end-date": "2024-01-14",
    });
    expect(result.isSome() && result.value.endDate).toBe("2024-01-14");
  });

  it("ignores invalid endDate but keeps the entry", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: true,
        },
      }),
    });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.parseEntry("S/1.md" as VaultPath, {
      journal: "s",
      "journal-date": "2024-01-01",
      "journal-end-date": "not-a-date",
    });
    expect(result.isSome() && result.value.endDate).toBeUndefined();
  });

  it("includes numbers dictionary keyed by source variable", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2024-01-01") }); // default source: variable=index frontmatterKey=journal-index
    const fm = await c.resolve(FrontmatterService);
    const result = fm.parseEntry("S/1.md" as VaultPath, {
      journal: "s",
      "journal-date": "2024-01-01",
      "journal-index": 5,
    });
    expect(result.isSome() && result.value.numbers).toEqual({ index: 5 });
  });

  it("includes only present numbers (partial coverage)", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [
            { variable: "release", frontmatterKey: "journal-release", anchorValue: 1, reset: { kind: "never" } },
            {
              variable: "sprint",
              frontmatterKey: "journal-sprint",
              anchorValue: 1,
              reset: { kind: "after", count: 6 },
            },
          ],
        },
      }),
    });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.parseEntry("S/1.md" as VaultPath, {
      journal: "s",
      "journal-date": "2024-01-01",
      "journal-sprint": 3,
    });
    expect(result.isSome() && result.value.numbers).toEqual({ sprint: 3 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: failures (FrontmatterService doesn't exist).

- [ ] **Step 4: Implement `parseEntry`**

`src/journals/frontmatter.ts`:

```ts
import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { FRONTMATTER_NAME_KEY, journalConfigCollection } from "./config";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import type { JournalEntry } from "./types";

export class FrontmatterService {
  readonly #settings = inject(SettingsService);

  parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<JournalEntry> {
    const journalName = frontmatter[FRONTMATTER_NAME_KEY];
    if (typeof journalName !== "string") return Option.none();
    const config = this.#settings.getCollection(journalConfigCollection).get(journalName);
    if (!config) return Option.none();

    const rawDate = frontmatter[config.frontmatter.dateField];
    if (typeof rawDate !== "string") return Option.none();
    const parsed = CalendarDate.parse(rawDate);
    if (!parsed.isOk()) return Option.none();
    const anchor = parsed.value.toAnchor();

    const rawEnd = frontmatter[config.frontmatter.endDateField];
    let endDate: AnchorString | undefined;
    if (typeof rawEnd === "string") {
      const endParsed = CalendarDate.parse(rawEnd);
      if (endParsed.isOk()) endDate = endParsed.value.toAnchor();
    }

    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const value = frontmatter[source.frontmatterKey];
      if (typeof value === "number" && Number.isFinite(value)) {
        numbers[source.variable] = value;
      }
    }

    const entry: JournalEntry = {
      journalName,
      anchor,
      path,
      ...(endDate !== undefined ? { endDate } : {}),
      ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
    };
    return Option.some(entry);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/frontmatter.ts src/journals/frontmatter.test.ts src/journals/types.ts
git commit -m "feat(journals): FrontmatterService.parseEntry"
```

---

## Task 20: `FrontmatterService.buildMetadata` and `writeMutator`

**Files:**

- Modify: `src/journals/frontmatter.ts`
- Modify: `src/journals/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/frontmatter.test.ts`:

```ts
describe("FrontmatterService.buildMetadata", () => {
  it("returns Err(JournalNotFoundError) for unknown journal", async () => {
    const c = build({});
    const fm = await c.resolve(FrontmatterService);
    const result = fm.buildMetadata("missing", "2024-01-01" as AnchorString);
    expect(result.isErr() && result.error.constructor.name).toBe("JournalNotFoundError");
  });

  it("returns metadata with numbers for an enabled journal", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2024-01-01") });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.buildMetadata("s", "2024-01-08" as AnchorString);
    expect(result.isOk() && result.value).toEqual({
      journalName: "s",
      anchor: "2024-01-08",
      numbers: { index: 2 },
    });
  });

  it("omits endDate when cycle's endOf matches the default", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2024-01-01") });
    const fm = await c.resolve(FrontmatterService);
    const result = fm.buildMetadata("s", "2024-01-01" as AnchorString);
    expect(result.isOk() && result.value.endDate).toBeUndefined();
  });
});

describe("FrontmatterService.writeMutator", () => {
  it("writes journal name and date field", async () => {
    const c = build({ daily: fixedJournal("daily", { type: "day" }) });
    const fm = await c.resolve(FrontmatterService);
    const mutator = fm
      .writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
      })
      .unwrap();
    const result: Record<string, unknown> = {};
    mutator(result);
    expect(result["journal"]).toBe("daily");
    expect(result["journal-date"]).toBe("2024-01-01");
  });

  it("writes startDate when addStartDate is true", async () => {
    const c = build({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        {
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: true,
            addEndDate: false,
          },
        },
      ),
    });
    const fm = await c.resolve(FrontmatterService);
    const mutator = fm
      .writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
      })
      .unwrap();
    const result: Record<string, unknown> = {};
    mutator(result);
    expect(result["journal-start-date"]).toBe("2024-01-01");
  });

  it("writes endDate when an extension is present even if addEndDate is false", async () => {
    const c = build({
      s: customJournal("s", "week", 1, "2024-01-01", {
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
      }),
    });
    const fm = await c.resolve(FrontmatterService);
    const mutator = fm
      .writeMutator("s", {
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        endDate: "2024-01-14" as AnchorString,
      })
      .unwrap();
    const result: Record<string, unknown> = {};
    mutator(result);
    expect(result["journal-end-date"]).toBe("2024-01-14");
  });

  it("writes each numbering source's frontmatterKey when present, deletes when absent", async () => {
    const c = build({ s: customJournal("s", "week", 1, "2024-01-01") });
    const fm = await c.resolve(FrontmatterService);
    const mutator = fm
      .writeMutator("s", {
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        numbers: { index: 42 },
      })
      .unwrap();
    const result: Record<string, unknown> = { "journal-index": 99 };
    mutator(result);
    expect(result["journal-index"]).toBe(42);

    // Same mutator with missing number deletes the key.
    const mutator2 = fm
      .writeMutator("s", {
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
      })
      .unwrap();
    const result2: Record<string, unknown> = { "journal-index": 99 };
    mutator2(result2);
    expect("journal-index" in result2).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: failures (methods not defined).

- [ ] **Step 3: Implement `buildMetadata` and `writeMutator`**

In `src/journals/frontmatter.ts`, add to class:

```ts
import { Err, Ok, Result } from "@/infrastructure/result";

import { JournalNotFoundError } from "./errors";
import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";

import type { JournalMetadata } from "./types";

// ... existing imports

export class FrontmatterService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);
  readonly #numbering = inject(NumberingService);
  readonly #index = inject(JournalsIndex);

  // ... parseEntry from Task 19

  buildMetadata(name: string, anchor: AnchorString): Result<JournalMetadata, JournalNotFoundError> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    if (!config) return new Err(new JournalNotFoundError(name));

    const numbers = this.#numbering.assignNumbers(name, anchor);

    // endDate is included only when a stored entry has an extension recorded.
    // The cycle's endOf returns the extension if present; to detect "is this an
    // extension?" we look directly at the stored entry.
    const storedEntry = this.#index.entryByAnchor(name, anchor);
    const endDate = storedEntry.isSome() ? storedEntry.value.endDate : undefined;

    const metadata: JournalMetadata = {
      journalName: name,
      anchor,
      ...(endDate !== undefined ? { endDate } : {}),
      ...(numbers.isSome() ? { numbers: numbers.value } : {}),
    };
    return new Ok(metadata);
  }

  writeMutator(
    name: string,
    metadata: JournalMetadata,
  ): Result<(fm: Record<string, unknown>) => void, JournalNotFoundError> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name);
    if (!config) return new Err(new JournalNotFoundError(name));
    const fields = config.frontmatter;
    const cycleService = this.#cycle;

    return new Ok((fm: Record<string, unknown>) => {
      fm[FRONTMATTER_NAME_KEY] = name;
      fm[fields.dateField] = metadata.anchor;

      if (fields.addStartDate) {
        const start = cycleService.startOf(name, metadata.anchor);
        if (start.isSome()) fm[fields.startDateField] = start.value.toAnchor();
      } else {
        delete fm[fields.startDateField];
      }

      const hasExtension = metadata.endDate !== undefined;
      if (fields.addEndDate || hasExtension) {
        fm[fields.endDateField] =
          metadata.endDate ??
          cycleService
            .endOf(name, metadata.anchor)
            .map((d) => d.toAnchor())
            .unwrapOr("");
      } else {
        delete fm[fields.endDateField];
      }

      for (const source of config.numbering.sources) {
        const value = metadata.numbers?.[source.variable];
        if (value === undefined) delete fm[source.frontmatterKey];
        else fm[source.frontmatterKey] = value;
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/frontmatter.ts src/journals/frontmatter.test.ts
git commit -m "feat(journals): FrontmatterService.buildMetadata and writeMutator"
```

---

## Task 21: `VaultSubscriptionService` — initial walk + `metadata-changed`

**Files:**

- Create: `src/journals/vault-subscription.ts`
- Create: `src/journals/vault-subscription.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/vault-subscription.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { InternalObsidianAppToken } from "@/infrastructure/host";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import type { VaultPath, NotesEvents } from "@/infrastructure/host";
import { NotesService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { VaultSubscriptionService } from "./vault-subscription";
import { fakeSettings, fixedJournal } from "./testing";

interface FakeNotesService {
  events: Subscribable<NotesEvents>;
  emit: TypedEmitter<NotesEvents>;
  allMarkdownNotes: () => VaultPath[];
}

function fakeNotes(paths: VaultPath[]): FakeNotesService {
  const emitter = createNanoEvents<NotesEvents>();
  return {
    events: emitter,
    emit: emitter,
    allMarkdownNotes: () => paths,
  };
}

function fakeApp(frontmatterByPath: Record<string, Record<string, unknown>>): { vault: any; metadataCache: any } {
  return {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path in frontmatterByPath ? { path, constructor: { name: "TFile" } } : null,
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => ({ frontmatter: frontmatterByPath[file.path] ?? null }),
    },
  };
}

function build(
  journals: Parameters<typeof fakeSettings>[0],
  notesPaths: VaultPath[],
  frontmatterByPath: Record<string, Record<string, unknown>>,
) {
  const notes = fakeNotes(notesPaths);
  const app = fakeApp(frontmatterByPath);
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(InternalObsidianAppToken).useValue(app as never);
  c.register(LoggerFactoryToken).useValue({
    named: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  } as never);
  c.register(VaultSubscriptionService).useClass(VaultSubscriptionService);
  return { c, notes };
}

// TFile workaround: parseEntry doesn't care about TFile prototype — just call mocked methods.

describe("VaultSubscriptionService", () => {
  it("populates JournalsIndex with parseable notes during initialize", async () => {
    const { c } = build({ daily: fixedJournal("daily", { type: "day" }) }, ["D/2024-01-01.md" as VaultPath], {
      "D/2024-01-01.md": { journal: "daily", "journal-date": "2024-01-01" },
    });
    const sub = await c.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = await c.resolve(JournalsIndex);
    expect(index.entryByPath("D/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  it("registers a newly-parseable note on metadata-changed", async () => {
    const fmMap: Record<string, Record<string, unknown>> = {};
    const { c, notes } = build({ daily: fixedJournal("daily", { type: "day" }) }, [], fmMap);
    const sub = await c.resolve(VaultSubscriptionService);
    await sub.initialize();

    fmMap["D/X.md"] = { journal: "daily", "journal-date": "2024-01-02" };
    notes.emit.emit("metadata-changed", "D/X.md" as VaultPath);

    const index = await c.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);
  });

  it("unregisters a note when its frontmatter no longer parses", async () => {
    const fmMap: Record<string, Record<string, unknown>> = {
      "D/X.md": { journal: "daily", "journal-date": "2024-01-02" },
    };
    const { c, notes } = build({ daily: fixedJournal("daily", { type: "day" }) }, ["D/X.md" as VaultPath], fmMap);
    const sub = await c.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = await c.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);

    fmMap["D/X.md"] = {}; // strip journal key
    notes.emit.emit("metadata-changed", "D/X.md" as VaultPath);

    expect(index.entryByPath("D/X.md" as VaultPath).isNone()).toBe(true);
  });
});
```

The test's fake `app` skips the `instanceof TFile` check that `notes-service.ts` uses — we'll adapt the production code to use a duck-type check on `path` for testability, or wrap the file-resolution in a small helper that's mockable. Use the latter: introduce a `#resolveFrontmatter(path): Record<string, unknown> | undefined` private method that the production code calls; the test setup gives a `getAbstractFileByPath` that returns a plain object with a `path` field, and the production code's TFile check is replaced by `instanceof TFile || (typeof file === "object" && file !== null && "path" in file)` — only if testing requires it. Alternative: use `vi.mock("obsidian")` to stub TFile. Choose whichever is simpler.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: failures (service doesn't exist).

- [ ] **Step 3: Implement `VaultSubscriptionService`**

`src/journals/vault-subscription.ts`:

```ts
import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, NotesService } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";

import type { VaultPath } from "@/infrastructure/host";

export class VaultSubscriptionService {
  readonly #notes = inject(NotesService);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("vault-subscription");
  readonly #unsubscribes: Array<() => void> = [];

  initialize(): AsyncResult<void, never> {
    for (const path of this.#notes.allMarkdownNotes()) {
      this.#scan(path);
    }

    this.#unsubscribes.push(this.#notes.events.on("metadata-changed", (path) => this.#scan(path)));

    return AsyncResult.ok(undefined);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }

  #scan(path: VaultPath): void {
    const fm = this.#readFrontmatter(path);
    if (!fm) {
      this.#index.unregister(path);
      return;
    }
    const entry = this.#frontmatter.parseEntry(path, fm);
    if (entry.isSome()) {
      this.#index.register(entry.value);
    } else {
      this.#index.unregister(path);
      this.#logger.debug("frontmatter not parseable", { path });
    }
  }

  #readFrontmatter(path: VaultPath): Record<string, unknown> | undefined {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) && !(file && typeof file === "object" && "path" in file)) return undefined;
    return this.#app.metadataCache.getFileCache(file as TFile)?.frontmatter ?? undefined;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/vault-subscription.ts src/journals/vault-subscription.test.ts
git commit -m "feat(journals): VaultSubscriptionService initial walk and metadata-changed handler"
```

---

## Task 22: `VaultSubscriptionService` — rename and delete events

**Files:**

- Modify: `src/journals/vault-subscription.ts`
- Modify: `src/journals/vault-subscription.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/vault-subscription.test.ts`:

```ts
it("transfers path on rename", async () => {
  const { c, notes } = build({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath], {
    "D/A.md": { journal: "daily", "journal-date": "2024-01-01" },
  });
  const sub = await c.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = await c.resolve(JournalsIndex);

  notes.emit.emit("renamed", { from: "D/A.md" as VaultPath, to: "D/B.md" as VaultPath });

  expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  expect(index.entryByPath("D/B.md" as VaultPath).isSome()).toBe(true);
});

it("unregisters on delete", async () => {
  const { c, notes } = build({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath], {
    "D/A.md": { journal: "daily", "journal-date": "2024-01-01" },
  });
  const sub = await c.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = await c.resolve(JournalsIndex);

  notes.emit.emit("deleted", "D/A.md" as VaultPath);

  expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
});

it("does not register on created (waits for metadata-changed)", async () => {
  const { c, notes } = build({ daily: fixedJournal("daily", { type: "day" }) }, [], {});
  const sub = await c.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = await c.resolve(JournalsIndex);

  notes.emit.emit("created", { path: "D/A.md", basename: "A", folder: "D" } as never);
  expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: rename/delete failures.

- [ ] **Step 3: Add rename and delete subscriptions**

In `src/journals/vault-subscription.ts`, append to the `initialize()` subscription list:

```ts
this.#unsubscribes.push(
  this.#notes.events.on("metadata-changed", (path) => this.#scan(path)),
  this.#notes.events.on("renamed", ({ from, to }) => this.#index.transferPath(from, to)),
  this.#notes.events.on("deleted", (path) => this.#index.unregister(path)),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/vault-subscription.ts src/journals/vault-subscription.test.ts
git commit -m "feat(journals): VaultSubscriptionService handles renamed and deleted"
```

---

## Task 23: DI module + main.ts wiring

**Files:**

- Modify: `src/journals/module.ts`
- Modify: `src/main.ts`
- Delete: `src/journals/journals-index.test.ts` references to the old module-only test (if any)

- [ ] **Step 1: Replace `journalsIndexModule` with `journalsModule`**

`src/journals/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken, CollectionDefinitionToken } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { TimelineService } from "./timeline";
import { VaultSubscriptionService } from "./vault-subscription";
import { journalConfigCollection } from "./config";

export const journalsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(journalConfigCollection);
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
  },
};
```

The `CollectionDefinitionToken` is a multi-binding token; plain `.useValue(...)` is sufficient (no `.asMulti()` call). Pattern matches `calendarSettingsModule` for `SliceDefinitionToken`.

- [ ] **Step 2: Update `src/main.ts`**

```ts
import { getLanguage, Notice, Plugin } from "obsidian";

import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { journalsModule } from "@/journals/module";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { settingsModule, SettingsService } from "@/settings";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    initLocale(getLanguage());

    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(settingsModule);
    container.addModule(CalendarModule);
    container.addModule(calendarSettingsModule);
    container.addModule(journalsModule);
    await container.autoLoad();

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(`Journal: failed to load settings — ${init.error.message}`);
      await container.dispose();
      return;
    }

    await container.resolve(VaultSubscriptionService).initialize().toPromise();

    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
```

- [ ] **Step 3: Run all tests and checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Manual smoke test in Obsidian dev environment**

Run: `npm run dev`
Expected: dev build succeeds. Manual: load plugin in Obsidian test vault, confirm no errors in console, confirm JournalsIndex populates from existing notes.

(If no v3-shaped settings exist, the plugin will start with an empty collection — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/journals/module.ts src/main.ts
git commit -m "feat(journals): wire journalsModule and vault subscription bootstrap"
```

---

## Task 24: Public barrel

**Files:**

- Create: `src/journals/index.ts`

- [ ] **Step 1: Add public barrel (public API only)**

`src/journals/index.ts`:

```ts
export { CycleService } from "./cycle";
export { TimelineService } from "./timeline";
export { NumberingService } from "./numbering";
export { FrontmatterService, FRONTMATTER_NAME_KEY } from "./frontmatter";
export { VaultSubscriptionService } from "./vault-subscription";
export { JournalsIndex } from "./journals-index";

export { journalsModule } from "./module";
export { journalConfigCollection, journalDefaultsFor } from "./config";

export type {
  FixedWriteIntervals,
  WriteCustom,
  JournalWrite,
  JournalTimeline,
  FrontmatterFields,
  NumberingReset,
  NumberingSource,
  JournalNumberingConfig,
  JournalConfig,
} from "./config";
export type { JournalEntry, JournalMetadata, JournalsIndexEvents } from "./types";
export type { JournalCycle } from "./cycle";

export { JournalsError, JournalNotFoundError } from "./errors";
```

Per [[feedback_barrel_files]], do not re-export `testing.ts` here.

- [ ] **Step 2: Run type and lint checks**

Run: `npm run check:types && npm run check:lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/journals/index.ts
git commit -m "feat(journals): expose public barrel"
```

---

## Plan completion checklist

After all 24 tasks land:

- [ ] All `npm run test` pass.
- [ ] `npm run check:types` clean.
- [ ] `npm run check:lint` clean.
- [ ] `npm run build` produces a working bundle.
- [ ] Spot-check: opening the plugin against a vault with v3-shaped settings populates JournalsIndex without errors.
- [ ] Spec cross-check: every "Open follow-ups" item is documented as a future spec (not silently implemented here).

If any item fails, fix in a follow-up commit on the same branch before merging.
