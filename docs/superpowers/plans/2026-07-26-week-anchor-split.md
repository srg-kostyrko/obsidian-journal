# Week Anchor / Representative Day Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `Period.anchor`'s two fused roles so a weekly note's stored `journal-date` is the week's start, while `{{date}}` keeps rendering the mid-week representative day that makes `YYYY` resolve to the week-year.

**Architecture:** `PeriodBase` gains a `representative: CalendarDate` field; `format()` routes through it. Five period types set `representative = anchor` and are unaffected. `WeekPeriod` keeps `representative` at the doy day and moves `anchor` to the week start. Two `{{date}}` binding sites repoint to a new `CycleService.representativeOf`. The tasks are ordered so the two live defects are fixed first as standalone changes, then the model change lands additively, and only the last model task flips week behavior.

**Tech Stack:** TypeScript, Vue 3 SFCs, vitest + @testing-library/vue, moment (via the `Calendar` wrapper), ts-pattern, valibot, paraglide i18n, WebdriverIO for e2e.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-week-anchor-split-design.md`. Read it before starting.
- **No template-rendered string may change.** `{{date}}`, `{{start_date}}`, `{{end_date}}` and all filenames must render byte-identically before and after, for all six period kinds and custom intervals. The single deliberate visible change is the week-picker range label (Task 1).
- Test commands are npm, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. E2E: `npm run test:e2e:migration`.
- Every task ends with the full unit suite green. No task may leave a red test for a later task to fix.
- Conventional commit messages. **Never** add a `Co-Authored-By` trailer.
- Commit to the current branch (`v3-ai`). Do not create branches.
- No `eslint-disable` comments — fix the code instead.
- Tests: colocate `*.test.ts` beside the implementation; one behavior per test; subject+verb test names; no "and"/comma-list names; assert observable outcomes.
- Any test touching week boundaries MUST call `installTestCalendar()` from `@/calendar/testing` in `beforeEach` and its `teardown()` in `afterEach`. Without it the ambient moment locale decides dow/doy and the test is non-deterministic.
- i18n: add strings to `messages/en.json` only, then run `npm run compile:i18n`. `src/i18n/paraglide` is generated and git-ignored — never stage it. New copy follows `docs/2026-07-13-ux-text-audit.md` §A: sentence case, en-US.

---

### Task 1: Fix the week-picker range label

The week picker renders each week's date range starting from the anchor rather than the week start, so under ISO every week displays as a four-day span beginning Thursday (`Jun 11 – Jun 14` for the week of Mon Jun 8 – Sun Jun 14). Independent of the model change; fix it first.

**Files:**

- Modify: `src/calendar/ui/CalendarWeekView.vue:46`
- Test: `src/calendar/ui/CalendarWeekView.test.ts:94-102` (replace the existing loose test)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Replace the loose cell-label test with a precise one**

In `src/calendar/ui/CalendarWeekView.test.ts`, replace this entire `describe` block:

```ts
describe("cell label", () => {
  it("renders the week number and date range in the cell text", () => {
    const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
    mount({ outerPeriod, selected: null });

    const cells = screen.getAllByTestId("week-cell");
    const marchCell = cells.find((c) => /Mar/i.test(c.textContent ?? ""));
    expect(marchCell?.textContent).toMatch(/W\d+/);
    expect(marchCell?.textContent).toMatch(/Mar \d+/i);
  });
});
```

with:

```ts
describe("cell label", () => {
  it("renders the week number in the cell text", () => {
    const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
    mount({ outerPeriod, selected: null });

    const marchCell = screen.getAllByTestId("week-cell").find((c) => /Mar/i.test(c.textContent ?? ""));
    expect(marchCell?.textContent).toMatch(/W\d+/);
  });

  it("renders the week's full first-to-last-day span in the cell text", () => {
    const outerPeriod = MonthPeriod.containing(date("2025-03-15"));
    mount({ outerPeriod, selected: null });

    const texts = screen.getAllByTestId("week-cell").map((c) => c.textContent ?? "");
    expect(texts.some((t) => t.includes("Mar 10 – Mar 16"))).toBe(true);
  });
});
```

The separator is an en dash (`–`, U+2013), matching the template. The week of Mon 2025-03-10 – Sun 2025-03-16 is the ISO week containing 2025-03-15.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/calendar/ui/CalendarWeekView.test.ts`
Expected: the span test FAILS — the rendered text is `Mar 13 – Mar 16` (anchor Thursday), not `Mar 10 – Mar 16`. The week-number test passes.

- [ ] **Step 3: Render the range from the week's start**

In `src/calendar/ui/CalendarWeekView.vue`, change line 46 from:

```vue
<span>{{ cell.period.format("MMM D") }} – {{ (cell.period as WeekPeriod).end.format("MMM D") }}</span>
```

to:

```vue
<span>
          {{ (cell.period as WeekPeriod).start.format("MMM D") }} –
          {{ (cell.period as WeekPeriod).end.format("MMM D") }}
        </span>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/calendar/ui/CalendarWeekView.test.ts`
Expected: PASS

If the span test now fails on whitespace, the multi-line template introduced newlines into `textContent`. Assert against a whitespace-normalized string instead:

```ts
const texts = screen.getAllByTestId("week-cell").map((c) => (c.textContent ?? "").replace(/\s+/g, " "));
```

- [ ] **Step 5: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/calendar/ui/CalendarWeekView.vue src/calendar/ui/CalendarWeekView.test.ts
git commit -m "fix(calendar): render the week picker range from the week's first day

The cell label formatted its left-hand date through period.format(), which
routes to the anchor, so every week displayed as a four-day span starting on
the representative day."
```

---

### Task 2: Normalize the filename-to-anchor round trip

`candidateFor` uses the date parsed out of a filename directly as the anchor, with no period normalization. For a weekly journal with the default `YYYY-[W]w` format, the anchor renders `2026-W1` but parses back to the week start, which is not the canonical anchor — so `AutoAttachService` stamps a non-canonical `journal-date` and `parseEntry` immediately rejects the note. Independent live bug; also a prerequisite for Task 5.

**Files:**

- Modify: `src/journals/notes/note-path.ts:96-106`
- Test: `src/journals/notes/note-path.test.ts` (new `describe` block)

**Interfaces:**

- Consumes: `CycleService.anchorOf(name: string, date: CalendarDate): Option<AnchorString>` (already exists, `src/journals/cycle.ts:123`).
- Produces: `NotePathService.candidateFor` now guarantees a canonical anchor or `Option.none()`. Task 5 adds a second test against this guarantee.

- [ ] **Step 1: Write the failing test**

Append to `src/journals/notes/note-path.test.ts`:

```ts
describe("NotePathService.candidateFor weekly round trip", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("resolves a weekly note name to the journal's canonical anchor", () => {
    const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
    const c = buildContainer(repo);

    const result = c.resolve(NotePathService).candidateFor("weekly", "2026-W1.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-01-01");
  });
});
```

Add `installTestCalendar` to the existing `@/calendar/testing` import at the top of the file:

```ts
import { anchor, installTestCalendar } from "@/calendar/testing";
```

Weekly journal defaults are `nameTemplate: "{{date}}"` and `dateFormat: "YYYY-[W]w"` (`src/journals/config.ts:166,175`), so a weekly note for ISO week 1 of 2026 is named `2026-W1.md`. Under ISO that week runs Mon 2025-12-29 – Sun 2026-01-04, and today's canonical anchor is Thu 2026-01-01.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/journals/notes/note-path.test.ts`
Expected: FAIL — received `"2025-12-29"`. `parseDate` resolves `2026-W1` to the week start and `candidateFor` uses it verbatim.

- [ ] **Step 3: Resolve the parsed date through the cycle**

In `src/journals/notes/note-path.ts`, change:

```ts
    const dateBinding = bindings.get("date");
    let anchor: AnchorString;
    if (dateBinding?.kind === "date") {
      anchor = dateBinding.value.toAnchor();
    } else {
```

to:

```ts
    const dateBinding = bindings.get("date");
    let anchor: AnchorString;
    if (dateBinding?.kind === "date") {
      // A coarse format (e.g. a week's "YYYY-[W]w") parses back to some day inside the
      // period, not necessarily the period's canonical anchor. Resolve it, or the note
      // attaches with a date parseEntry will reject.
      const resolved = this.#cycle.anchorOf(name, dateBinding.value);
      if (resolved.isNone()) return Option.none();
      anchor = resolved.value;
    } else {
```

`this.#cycle` is already injected on `NotePathService` (`note-path.ts:22`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/journals/notes/note-path.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green. `auto-attach.test.ts` exercises this path — if anything there goes red, the fixture journal's canonical anchor changed and the expectation needs updating, not the implementation.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/note-path.ts src/journals/notes/note-path.test.ts
git commit -m "fix(journals): resolve a parsed note name to the canonical anchor

candidateFor used the date parsed out of a filename verbatim. With a coarse
date format the parsed value lands somewhere inside the period rather than on
its anchor, so auto-attach stamped a journal-date that parseEntry rejects and
the note never indexed."
```

---

### Task 3: Add `Period.representative`

A pure addition. Every period type gains the field; for weeks it holds exactly what `anchor` holds today, so no behavior changes. `format()` moves onto it so that Task 5's anchor flip cannot alter any rendered string.

**Files:**

- Modify: `src/calendar/period.ts:13-25`
- Modify: `src/calendar/period-day.ts`, `period-week.ts`, `period-month.ts`, `period-quarter.ts`, `period-year.ts`, `period-decade.ts`
- Test: `src/calendar/period-week.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `PeriodBase.representative: CalendarDate` on all six period classes. Tasks 4 and 5 depend on this field existing.

- [ ] **Step 1: Write the failing test**

Add to `src/calendar/period-week.test.ts`, after the existing `describe("anchor", ...)` block:

```ts
describe("representative", () => {
  it("is the Thursday inside the week under ISO 8601", () => {
    expect(WeekPeriod.containing(date("2025-03-10")).representative.toAnchor()).toBe("2025-03-13");
  });

  it("is the Friday inside a Sunday-start week under dow=0, doy=6", () => {
    teardown();
    ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

    expect(WeekPeriod.containing(date("2025-03-14")).representative.toAnchor()).toBe("2025-03-14");
  });
});
```

Add `installTestCalendar` to the existing import if it is not already there — it is, at line 4.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/calendar/period-week.test.ts`
Expected: FAIL — `representative` is undefined.

- [ ] **Step 3: Add the field to the interface**

In `src/calendar/period.ts`, change the `PeriodBase` interface:

```ts
export interface PeriodBase<Self> {
  readonly kind: PeriodKind;
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly anchor: CalendarDate;
  readonly representative: CalendarDate;

  next(): Self;
  previous(): Self;
  contains(d: CalendarDate): boolean;
  isSame(other: Self): boolean;
  days(): Iterable<CalendarDate>;
  format(pattern: string): string;
}
```

- [ ] **Step 4: Implement it on the five non-week periods**

In `src/calendar/period-day.ts`, add the field declaration after `readonly anchor: CalendarDate;`:

```ts
  readonly representative: CalendarDate;
```

and in the constructor, after `this.anchor = date;`:

```ts
this.representative = date;
```

then change `format`:

```ts
  format(pattern: string): string {
    return this.representative.format(pattern);
  }
```

In each of `period-month.ts`, `period-quarter.ts`, `period-year.ts`, and `period-decade.ts`, make the same three edits: add the `readonly representative: CalendarDate;` declaration next to `anchor`, add `this.representative = this.start;` immediately after the existing `this.anchor = this.start;`, and change `format` to return `this.representative.format(pattern)`.

- [ ] **Step 5: Implement it on WeekPeriod without changing behavior**

In `src/calendar/period-week.ts`, add the declaration after `readonly anchor: CalendarDate;`:

```ts
  readonly representative: CalendarDate;
```

and in the constructor, after `this.anchor = CalendarDate._fromMoment(anchor);`:

```ts
this.representative = this.anchor;
```

then change `format`:

```ts
  format(pattern: string): string {
    return this.representative.format(pattern);
  }
```

`anchor` still holds the doy day at this point — the split happens in Task 5.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/calendar/`
Expected: PASS, with no changes to any existing assertion.

- [ ] **Step 7: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/calendar/period.ts src/calendar/period-day.ts src/calendar/period-week.ts src/calendar/period-month.ts src/calendar/period-quarter.ts src/calendar/period-year.ts src/calendar/period-decade.ts src/calendar/period-week.test.ts
git commit -m "feat(calendar): add Period.representative for formatting

Introduces the field that will carry the formatting role once anchor returns
to the week start, and routes format() through it. representative equals
anchor for every period type at this point, so nothing changes yet."
```

---

### Task 4: Repoint the representative-day consumers

Three call sites want the representative day rather than the identity anchor. They are behaviorally identical today, which is exactly why they must be repointed now — after Task 5 they would silently regress.

**Files:**

- Modify: `src/journals/cycle.ts` (add `representativeOf` after `startOf`, around line 186)
- Modify: `src/journals/notes/note-path.ts:121-129`
- Modify: `src/code-blocks/nav/nav-row-context.ts:47-59`
- Modify: `src/notes-calendar/ui/NotesWeekView.vue:43-45`
- Test: `src/journals/cycle.test.ts`

**Interfaces:**

- Consumes: `PeriodBase.representative` (Task 3).
- Produces: `CycleService.representativeOf(name: string, anchor: AnchorString): Option<CalendarDate>` — returns the period's representative day for fixed cycles, the anchor itself for custom cycles, and `Option.none()` for an unknown journal.

- [ ] **Step 1: Write the failing test**

Add this block **inside** the existing top-level `describe("CycleService", ...)` in `src/journals/cycle.test.ts`, as a sibling of `describe("anchorOf", ...)`. Nesting it there inherits the file's `installTestCalendar()` setup; a new top-level describe would not have it and the week assertions would be locale-dependent.

`buildContainer` in this file takes the journals record directly (not a repository), and `unwrap`, `fixedJournal`, and `customJournal` are already imported at lines 13-13. `AnchorString` is imported as a type and existing tests pass anchors as `"..." as AnchorString` (e.g. line 114) — match that.

```ts
describe("representativeOf", () => {
  it("returns the week's representative day for a weekly journal", () => {
    const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });

    const result = c.resolve(CycleService).representativeOf("weekly", "2025-03-10" as AnchorString);

    expect(unwrap(result).toAnchor()).toBe("2025-03-13");
  });

  it("returns the anchor itself for a monthly journal", () => {
    const c = buildContainer({ monthly: fixedJournal("monthly", { type: "month" }) });

    const result = c.resolve(CycleService).representativeOf("monthly", "2025-03-01" as AnchorString);

    expect(unwrap(result).toAnchor()).toBe("2025-03-01");
  });

  it("returns the interval start for a custom journal", () => {
    const c = buildContainer({ sprints: customJournal("sprints", "week", 2, "2024-01-01") });

    const result = c.resolve(CycleService).representativeOf("sprints", "2024-01-01" as AnchorString);

    expect(unwrap(result).toAnchor()).toBe("2024-01-01");
  });

  it("returns none for an unknown journal", () => {
    const c = buildContainer({});

    expect(
      c
        .resolve(CycleService)
        .representativeOf("missing", "2025-03-10" as AnchorString)
        .isNone(),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: FAIL — `representativeOf` is not a function.

- [ ] **Step 3: Implement `representativeOf`**

In `src/journals/cycle.ts`, add immediately after the `startOf` method (which ends at line 186):

```ts
  representativeOf(name: string, anchor: AnchorString): Option<CalendarDate> {
    return this.#cycleFor(name).map((cycle) =>
      match(cycle)
        .with({ kind: "fixed" }, (c) => periodOfKind(c.period, CalendarDate.fromAnchor(anchor)).representative)
        .with({ kind: "custom" }, () => CalendarDate.fromAnchor(anchor))
        .exhaustive(),
    );
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: PASS

- [ ] **Step 5: Repoint `{{date}}` in `contextFor`**

In `src/journals/notes/note-path.ts`, change:

```ts
const dateValue = CalendarDate.fromAnchor(metadata.anchor);
```

to:

```ts
// {{date}} renders the period's representative day, which for weeks is the day whose
// calendar year equals the week-year. The anchor is the stored identity, not the render date.
const dateValue = this.#cycle
  .representativeOf(config.name, metadata.anchor)
  .getOr(CalendarDate.fromAnchor(metadata.anchor));
```

- [ ] **Step 6: Repoint `{{date}}` in the nav row context**

In `src/code-blocks/nav/nav-row-context.ts`, change:

```ts
const refCalendarDate = CalendarDate.fromAnchor(refDate);
const startDate = cycle.startOf(journal.name, refDate).getOr(refCalendarDate);
```

to:

```ts
const refCalendarDate = CalendarDate.fromAnchor(refDate);
const renderDate = cycle.representativeOf(journal.name, refDate).getOr(refCalendarDate);
const startDate = cycle.startOf(journal.name, refDate).getOr(refCalendarDate);
```

and change the `{{date}}` binding from:

```ts
    .date("date", refCalendarDate, journal.dateFormat)
```

to:

```ts
    .date("date", renderDate, journal.dateFormat)
```

Leave the `start_date` and `end_date` bindings and their `refCalendarDate` fallbacks exactly as they are.

- [ ] **Step 7: Repoint the owning-period derivation**

In `src/notes-calendar/ui/NotesWeekView.vue`, change lines 43-45 from:

```ts
const monthPeriod = computed(() => MonthPeriod.containing(rawWeek.value.anchor));
const quarterPeriod = computed(() => QuarterPeriod.containing(rawWeek.value.anchor));
const yearPeriod = computed(() => YearPeriod.containing(rawWeek.value.anchor));
```

to:

```ts
// A week belongs to the period that owns it, which is the representative day's — not the
// week start's, which for a cross-year week sits in the previous month and year.
const monthPeriod = computed(() => MonthPeriod.containing(rawWeek.value.representative));
const quarterPeriod = computed(() => QuarterPeriod.containing(rawWeek.value.representative));
const yearPeriod = computed(() => YearPeriod.containing(rawWeek.value.representative));
```

- [ ] **Step 8: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green, with no existing assertion changed. Every edit in steps 5-7 is a no-op today because `representative === anchor`.

- [ ] **Step 9: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts src/journals/notes/note-path.ts src/code-blocks/nav/nav-row-context.ts src/notes-calendar/ui/NotesWeekView.vue
git commit -m "refactor(journals): bind {{date}} to the period's representative day

Adds CycleService.representativeOf and points the two {{date}} binding sites
and the week's owning-period derivation at it. Behaviourally inert while
representative still equals anchor; this is what keeps rendered output stable
when the week anchor moves to the week start."
```

---

### Task 5: Move the week anchor to the week start

The behavior change. After this task a weekly note's `journal-date` is the week's first day, matching its `journal-start-date`, while every template variable renders exactly what it rendered before.

**Files:**

- Modify: `src/calendar/period-week.ts:18-29`
- Test: `src/calendar/period-week.test.ts` (update anchor expectations)
- Test: `src/journals/notes/note-path.test.ts` (update Task 2's expectation, add the normalization guard)
- Modify: `e2e/migration/legacy-upgrade.e2e.ts:14-23`

**Interfaces:**

- Consumes: `PeriodBase.representative` (Task 3), `CycleService.representativeOf` and the repointed binding sites (Task 4), the normalized `candidateFor` (Task 2).
- Produces: `WeekPeriod.anchor === WeekPeriod.start`. Nothing later depends on it.

- [ ] **Step 1: Update the week anchor expectations to the new rule**

In `src/calendar/period-week.test.ts`, make these four edits.

Replace the `describe("anchor", ...)` block:

```ts
describe("anchor", () => {
  it("is the week's first day under ISO 8601", () => {
    expect(WeekPeriod.containing(date("2025-03-14")).anchor.toAnchor()).toBe("2025-03-10");
  });
});
```

Inside `describe("year", ...)`, replace the test named `anchor is the Thursday inside the cross-year week`:

```ts
it("anchor is the week's first day for the cross-year week", () => {
  expect(WeekPeriod.containing(date("2024-12-31")).anchor.toAnchor()).toBe("2024-12-30");
});
```

and replace the test named `anchor.format('YYYY') matches year for the same cross-year week`:

```ts
it("representative.format('YYYY') matches year for the same cross-year week", () => {
  expect(WeekPeriod.containing(date("2024-12-31")).representative.format("YYYY")).toBe("2025");
});
```

Inside `describe("non-ISO locale", ...)`, replace the test named `anchor is the Friday for a Sun-start week under dow=0, doy=6`:

```ts
it("anchor is the Sunday for a Sun-start week under dow=0, doy=6", () => {
  teardown();
  ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

  expect(WeekPeriod.containing(date("2025-03-14")).anchor.toAnchor()).toBe("2025-03-09");
});
```

and replace the test named `anchor.year matches year for the cross-year week under dow=0, doy=6`:

```ts
it("representative.year matches year for the cross-year week under dow=0, doy=6", () => {
  teardown();
  ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

  const week = WeekPeriod.containing(date("2025-12-31"));

  expect(week.representative.year).toBe(week.year);
});
```

Leave `describe("format", ...)` untouched — `format("GGGG-[W]WW")` must still return `"2025-W01"`. That test is the regression guard for the whole design.

Then add the end-to-end filename invariant to `src/journals/notes/note-path.test.ts`, inside the `describe("NotePathService.candidateFor weekly round trip", ...)` block added in Task 2. Unlike the others this one must pass **both before and after** the constructor change — it is what proves the anchor move did not disturb any rendered string:

```ts
it("renders a weekly note name from the week-year regardless of the stored anchor", () => {
  const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
  const c = buildContainer(repo);
  const meta: JournalMetadata = { journalName: "weekly", anchor: anchor("2025-12-29") };

  const result = c.resolve(NotePathService).pathFor("weekly", meta);

  expect(result.isOk() && result.value).toBe("2026-W1.md");
});
```

The week of Mon 2025-12-29 – Sun 2026-01-04 is ISO week 1 of 2026, so the default `YYYY-[W]w` format must render `2026-W1` — the week-year, not the start's calendar year. Before the constructor change `2025-12-29` is a non-canonical anchor that `buildMetadata` still accepts, so the test is meaningful in both states.

- [ ] **Step 2: Run the tests to verify the right ones fail**

Run: `npm run test -- src/calendar/period-week.test.ts src/journals/notes/note-path.test.ts`
Expected: the four updated anchor tests FAIL (anchor still returns the doy day). The `format`, `representative`, and new filename-invariant tests PASS.

If the filename-invariant test fails _here_, stop: `{{date}}` is not resolving through `representativeOf`, which means Task 4 step 5 was not applied correctly. Fix that before touching the constructor.

- [ ] **Step 3: Move the anchor to the week start**

In `src/calendar/period-week.ts`, change the constructor from:

```ts
  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("week");
    const end = reference.clone().endOf("week").startOf("day");
    const doy = reference.localeData().firstDayOfYear();
    const anchor = start.clone().add(doy - 1, "day");

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = CalendarDate._fromMoment(anchor);
    this.representative = this.anchor;
    this.weekOfYear = reference.week();
    this.year = reference.weekYear();
  }
```

to:

```ts
  private constructor(reference: ReturnType<typeof localMoment>) {
    const start = reference.clone().startOf("week");
    const end = reference.clone().endOf("week").startOf("day");
    const doy = reference.localeData().firstDayOfYear();

    this.start = CalendarDate._fromMoment(start);
    this.end = CalendarDate._fromMoment(end);
    this.anchor = this.start;
    // The locale's representative day: the one whose calendar year is the week-year, so
    // {{date:YYYY}} resolves correctly for a week straddling January 1.
    this.representative = CalendarDate._fromMoment(start.clone().add(doy - 1, "day"));
    this.weekOfYear = reference.week();
    this.year = reference.weekYear();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/calendar/period-week.test.ts`
Expected: PASS

- [ ] **Step 5: Update Task 2's expectation and add the normalization guard**

In `src/journals/notes/note-path.test.ts`, the weekly round-trip expectation flips, because the canonical anchor for ISO week 1 of 2026 is now Mon 2025-12-29:

```ts
it("resolves a weekly note name to the journal's canonical anchor", () => {
  const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
  const c = buildContainer(repo);

  const result = c.resolve(NotePathService).candidateFor("weekly", "2026-W1.md" as VaultPath);

  expect(unwrap(result).anchor).toBe("2025-12-29");
});
```

Then add this test to the same describe block. It is the one that guards the Task 2 normalization: with a day-precision format the filename now holds the representative day, which is no longer canonical, so removing the `anchorOf` call makes it fail.

```ts
it("resolves a day-precision weekly note name to the week's first day", () => {
  const repo = fakeRepo({
    weekly: fixedJournal("weekly", { type: "week" }, { dateFormat: "YYYY-MM-DD" }),
  });
  const c = buildContainer(repo);

  const result = c.resolve(NotePathService).candidateFor("weekly", "2026-01-01.md" as VaultPath);

  expect(unwrap(result).anchor).toBe("2025-12-29");
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/journals/notes/note-path.test.ts`
Expected: PASS

Sanity-check that the second test is load-bearing: temporarily revert the Task 2 change in `candidateFor` (back to `anchor = dateBinding.value.toAnchor()`), re-run, and confirm the day-precision test fails while the `2026-W1.md` one still passes. Restore the change before continuing.

- [ ] **Step 7: Update the migration e2e expectation**

The migration _unit_ tests need no change: they stub `anchorOf` (`data-migration-service.test.ts:81-86`), so their anchors are fixtures, not derived values.

The e2e runs the real cycle. In `e2e/migration/legacy-upgrade.e2e.ts`, the fixture's legacy week note carries `journal-start-date: 2024-03-12` (a Tuesday); its week runs Mon 2024-03-11 – Sun 2024-03-17. Change the week row from:

```ts
  { section: "week", journal: "My Journal Week", path: "archive/week-note.md", date: "2024-03-14" },
```

to:

```ts
  { section: "week", journal: "My Journal Week", path: "archive/week-note.md", date: "2024-03-11" },
```

and update the explanatory comment above the array — replace the sentence fragment `(a week's representative Thursday, the 1st, Jan 1)` with `(a week's first day, the 1st, Jan 1)`, and replace the final sentence `Fixture week config is ISO (firstDayOfWeek 1, firstWeekOfYear 4), so the week anchor is Thursday.` with `Fixture week config is ISO (firstDayOfWeek 1, firstWeekOfYear 4), so the week anchor is Monday.`

- [ ] **Step 8: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green. If a test outside the files named in this task fails, do not adjust it to match — it means a rendered string changed, which the global constraints forbid. Diagnose before proceeding.

- [ ] **Step 9: Run the migration e2e**

Run: `npm run test:e2e:migration`
Expected: green, including `rewrites a legacy week note to its migrated journal and date field`.

- [ ] **Step 10: Commit**

```bash
git add src/calendar/period-week.ts src/calendar/period-week.test.ts src/journals/notes/note-path.test.ts e2e/migration/legacy-upgrade.e2e.ts
git commit -m "fix(calendar): anchor a week to its first day

A week's stored identity is now its first day, matching every other period
type and the note's own journal-start-date. The representative day keeps the
formatting role, so {{date}} and every filename render unchanged."
```

---

### Task 6: Explain `{{date}}` on weekly journals

With the split, a weekly journal's `{{date}}` renders a mid-week day while its frontmatter reads the week's first day. Surface that in the settings UI so the distinction is discoverable where the templates are authored.

**Files:**

- Modify: `messages/en.json`
- Modify: `src/journals/settings/ui/sections/NoteCreationSection.vue`
- Test: `src/journals/settings/ui/sections/NoteCreationSection.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the messages**

Paraglide treats `{...}` as its own placeholder syntax, so a literal `{{date}}` cannot be embedded in message text. The house pattern is a single `{slot}` filled by a `VariableChip` through `I18nWithSlot` (see `VariableReferenceModal.vue:132-134`). `I18nWithSlot` supports exactly one slot per message, so this needs two messages — each a complete sentence, not a fragment.

In `messages/en.json`, add next to the other `journal_edit_date_format_*` keys (near line 1150), preserving the file's existing key ordering:

```json
  "journal_edit_date_format_week_date_note": "On a weekly journal, {slot} is a day inside the week, chosen so year tokens match the week's year.",
  "journal_edit_date_format_week_start_note": "Use {slot} for the week's first day.",
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: success. `src/i18n/paraglide` is git-ignored — do not stage it.

- [ ] **Step 3: Write the failing test**

The file's helper is `mount(overrides: Partial<JournalConfig> = {})`, which builds a journal named `daily` from `journalDefaultsFor({ type: "day" }, "daily")` and merges the overrides. Passing `{ write: { type: "week" } }` is what makes it a weekly journal. The file already installs the test calendar at module level (lines 35-41).

Add to `src/journals/settings/ui/sections/NoteCreationSection.test.ts`:

```ts
describe("weekly date-format hint", () => {
  it("explains the date variable on a weekly journal", () => {
    mount({ write: { type: "week" } });

    expect(screen.getByText(/day inside the week/i)).toBeTruthy();
  });

  it("omits the explanation on a day journal", () => {
    mount();

    expect(screen.queryByText(/day inside the week/i)).toBeNull();
  });
});
```

`I18nWithSlot` renders the message text around the slot inside one `<span>`, so `getByText` with a regex matches the surrounding sentence.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test -- src/journals/settings/ui/sections/NoteCreationSection.test.ts`
Expected: FAIL — the text is not rendered.

- [ ] **Step 5: Render the hint**

In `src/journals/settings/ui/sections/NoteCreationSection.vue`, add two imports alongside the existing ones:

```ts
import VariableChip from "@/templates/ui/VariableChip.vue";
import I18nWithSlot from "@/ui/I18nWithSlot.vue";
```

add a computed next to the existing `hasCycle` (line 32):

```ts
const isWeekly = computed(() => config.value?.write.type === "week");
```

and add the hint inside the date-format row's `#description` slot, immediately after the `DateFormatPreview` line (line 119):

```vue
<div v-if="isWeekly">
          <I18nWithSlot :message="m.journal_edit_date_format_week_date_note">
            <VariableChip name="date" />
          </I18nWithSlot>
          <I18nWithSlot :message="m.journal_edit_date_format_week_start_note">
            <VariableChip name="start_date" />
          </I18nWithSlot>
        </div>
```

Use a plain `div`, not `class="journal-hint"` — that class is warning-coloured and this is informational.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- src/journals/settings/ui/sections/NoteCreationSection.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full suite and static checks**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json src/journals/settings/ui/sections/NoteCreationSection.vue src/journals/settings/ui/sections/NoteCreationSection.test.ts
git commit -m "feat(journals): explain the weekly date variable in settings"
```

---

## Final verification

- [ ] **Run everything**

```bash
npm run test && npm run check:types && npm run check:lint
npm run test:e2e:migration
```

- [ ] **Confirm the deliverable by hand**

Create a weekly journal in a scratch vault, open the note for a week straddling January 1, and confirm its frontmatter reads:

```yaml
journal-date: 2025-12-29
journal-start-date: 2025-12-29
journal-end-date: 2026-01-04
```

with the filename still `2026-W1.md`.

- [ ] **Update the stale memory entry**

`project_week_canonical_anchor` records the old rule ("a week's canonical anchor is startOfWeek+(doy-1)"). Rewrite it for the new model: the anchor is the week's first day; the representative day carries formatting. Keep the note that `parseEntry` rejects non-anchor journal-dates.

- [ ] **Tick the manual-testing checklist**

`docs/manual-testing-checklist-v3.md` is mid-pass in the working tree. Re-check any weekly-journal frontmatter items against the new behavior.
