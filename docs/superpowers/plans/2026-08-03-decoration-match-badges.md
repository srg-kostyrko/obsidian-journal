# Decoration Match Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell the user whether a decoration rule fires at all — a badge on every row in `DecorationsSection` reading `Matched 23 of the last 90 days`, `No notes yet`, or `Matched nothing in the last 90 days`.

**Architecture:** The badge is the engine's existing `explainRange` read the other way round: build a window of periods, run that one decoration's binding over it, and count the cells that got a contribution. No second matcher. The window looks **backward**, because most conditions can only match notes that already exist.

**Tech Stack:** TypeScript, Vue 3 SFCs, ts-pattern, Vitest, `@testing-library/vue`, Paraglide (i18n).

Design doc: `docs/superpowers/specs/2026-08-03-decoration-inspector-design.md` §Match badges
**This is plan 3 of 3.** Plans 1 (engine capability + breakdown modal + settings entry) and 2 (right-click reach from decorated cells) are complete. This plan depends on Plan 1's `explainRange` and on nothing in Plan 2.

## Why backward, restated so nobody "fixes" it

`has-note`, `tag`, `property`, `has-open-task` and `all-tasks-completed` can only match notes that already exist. Over the _next_ 90 days they match nothing, because those notes are not written yet. A forward window would put a red badge on the majority of healthy note-based rules, which is worse than shipping no badge at all — it teaches users to ignore the one signal we are adding. `date` and `weekday` rules fire on schedule and read the same either direction, so nothing is lost.

The only inversion: a journal whose timeline lies entirely in the **future** has no past to measure, and looks forward instead.

## Facts verified against the code before writing this

- `explainRange(periods, bindings)` already applies the `inTimeline` gate and `periodMatchesWrite`. So a period outside the journal's timeline contributes nothing — but the badge must clip the **denominator** itself, or a young journal reports `0 of 90` instead of `0 of 12`.
- `advance(period, steps)` (`src/calendar/period.ts:43`) steps a period by N in either direction; `periodOfKind(kind, date)` (`:39`) builds one.
- `periodKinds` is `["day","week","month","quarter","year","decade"]`. `periodKindForWrite` never returns `"decade"`, but the horizon table must cover it for type totality — the same unreachable-branch situation Plan 1's modal hit.
- Custom journals: step with `CycleService.previousAnchor(name, from)` / `anchorAtOffset(name, from, steps)`. **Do not** call `anchorOf` per date — it walks the cycle for custom journals, making the loop quadratic.
- `periodForJournal(write, anchor)` maps a custom write to a `"day"`-kind period at the interval's start anchor, which is what the engine keys on.
- `TimelineService` exposes `contains(name, anchor)`, `startOf(name)`, `endOf(name)`, `boundsOf(name)`.
- `JournalsIndex.entryByAnchor(journalName, anchor)` returns `Option<JournalEntry>` — this is how the window counts notes.
- Vault-wide and shelf decorations paint day cells only and can only use `date`/`weekday`, so their unit is always days, they have no timeline to clip against, and they can never need notes.

## Global Constraints

- Commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. Single file: `npm run test -- <path>`.
- **Run every gate in the foreground and wait for it to return.** Do not background any command or start a wait-loop on one. Three subagents stalled this way on the previous plans; if a gate backgrounds anyway, say so and stop rather than polling.
- Commit to the current branch (`v3-ai`). Never create a new branch. No `Co-Authored-By` trailer.
- Never use `eslint-disable`. **No new lint warnings** — baseline is 15 warnings, 0 errors.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`, never `switch`.
- Tests colocate beside their subject. One behavior per test; names describe behavior (subject + verb); nested `describe()` for scope.
- **Assert observable outcomes, and check each test bites.** Across the previous two plans, reviews caught _five_ tests that passed under an inverted implementation. Before finishing any test, name the wrong implementation it would catch. If you cannot name one, rewrite it.
- Vue component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Components reach DI through `useService`, never `useApp`/`usePlugin`.
- New i18n strings go in `messages/en.json` then `npm run compile:i18n`. **Never** stage or edit `src/i18n/paraglide` — generated and git-ignored. Do not run prettier over `messages/en.json`; it reformats unrelated entries.
- Copy: sentence case, en-US, **no concatenated UI strings** — a badge assembled from a noun message plus a count in the template is a violation.
- No spec-reference comments. Comments explain WHY, never WHAT.
- `no-non-null-assertion` is ON in production code, OFF in test files.
- Never write `localMoment().add(...)` in domain code — step with `Period.next`/`previous`/`advance` and `CalendarDate`.

---

### Task 1: The window and the notes predicate

Two pure functions, no engine and no DI. They hold the logic most likely to be wrong.

**Files:**

- Create: `src/decorations/match-window.ts`
- Create: `src/decorations/match-window.test.ts`

**Interfaces:**

- Consumes: `Period`, `PeriodKind`, `CalendarDate`, `periodOfKind`, `advance` from `@/calendar`; `JournalDecoration` from `./config`.
- Produces:
  - `const MATCH_HORIZON: Record<PeriodKind, number>` — `day: 90, week: 26, month: 12, quarter: 8, year: 5, decade: 5`
  - `const CUSTOM_MATCH_HORIZON = 20`
  - `type WindowDirection = "past" | "future"`
  - `function fixedWindow(kind: PeriodKind, today: CalendarDate, direction: WindowDirection): readonly Period[]` — the horizon's worth of periods ending (past) or starting (future) at `today`, in chronological order
  - `function needsNotes(decoration: JournalDecoration): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/match-window.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";

import { fixedWindow, needsNotes, MATCH_HORIZON } from "./match-window";
import { buildCondition, buildDecoration } from "./testing";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
});

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

describe("fixedWindow", () => {
  it("returns the horizon's worth of periods for its kind", () => {
    expect(fixedWindow("day", date("2026-05-25"), "past")).toHaveLength(MATCH_HORIZON.day);
  });

  it("ends a past window at today's period", () => {
    const window = fixedWindow("day", date("2026-05-25"), "past");
    expect(window.at(-1)?.anchor.toAnchor()).toBe("2026-05-25");
  });

  it("starts a past window a horizon back from today", () => {
    const window = fixedWindow("day", date("2026-05-25"), "past");
    expect(window.at(0)?.anchor.toAnchor()).toBe("2026-02-25");
  });

  it("starts a future window at today's period", () => {
    const window = fixedWindow("day", date("2026-05-25"), "future");
    expect(window.at(0)?.anchor.toAnchor()).toBe("2026-05-25");
  });

  it("returns periods in chronological order", () => {
    const window = fixedWindow("week", date("2026-05-25"), "past");
    const anchors = window.map((p) => p.anchor.toAnchor());
    expect([...anchors].sort()).toEqual(anchors);
  });

  it("uses the kind's own horizon rather than the day horizon", () => {
    expect(fixedWindow("month", date("2026-05-25"), "past")).toHaveLength(MATCH_HORIZON.month);
  });
});

describe("needsNotes", () => {
  it("treats an and-decoration with one note-based condition as needing notes", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("weekday", { weekdays: [1] }), buildCondition("has-note")],
    });
    expect(needsNotes(decoration)).toBe(true);
  });

  it("treats an and-decoration with no note-based condition as not needing notes", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("weekday", { weekdays: [1] }), buildCondition("date")],
    });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats an or-decoration with one date condition as not needing notes", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date")],
    });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats an or-decoration whose conditions are all note-based as needing notes", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("tag")],
    });
    expect(needsNotes(decoration)).toBe(true);
  });

  it("treats an offset condition as not needing notes", () => {
    const decoration = buildDecoration({ mode: "and", conditions: [buildCondition("offset")] });
    expect(needsNotes(decoration)).toBe(false);
  });

  it("treats a decoration with no conditions as not needing notes", () => {
    expect(needsNotes(buildDecoration({ mode: "and", conditions: [] }))).toBe(false);
  });
});
```

The `and`/`or` pair is the point: swap the two branches of the mode check and exactly one test in each pair fails.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/decorations/match-window.test.ts`

Expected: FAIL — `Failed to resolve import "./match-window"`.

- [ ] **Step 3: Write the module**

Create `src/decorations/match-window.ts`:

```ts
import { advance, periodOfKind, type CalendarDate, type Period, type PeriodKind } from "@/calendar";

import type { JournalDecoration, JournalDecorationCondition } from "./config";

// Tuned rather than derived: roughly a season to a few years of wall-clock per unit. "decade"
// is unreachable — periodKindForWrite never returns it — but the record must be total.
export const MATCH_HORIZON: Record<PeriodKind, number> = {
  day: 90,
  week: 26,
  month: 12,
  quarter: 8,
  year: 5,
  decade: 5,
};

export const CUSTOM_MATCH_HORIZON = 20;

export type WindowDirection = "past" | "future";

export function fixedWindow(kind: PeriodKind, today: CalendarDate, direction: WindowDirection): readonly Period[] {
  const horizon = MATCH_HORIZON[kind];
  const anchorPeriod = periodOfKind(kind, today);
  const first = direction === "past" ? advance(anchorPeriod, -(horizon - 1)) : anchorPeriod;
  const out: Period[] = [first];
  for (let i = 1; i < horizon; i += 1) out.push(advance(first, i));
  return out;
}

const NOTE_BASED: ReadonlySet<JournalDecorationCondition["type"]> = new Set([
  "title",
  "tag",
  "property",
  "has-note",
  "has-open-task",
  "all-tasks-completed",
]);

// Under "and" every condition must hold, so one note-based condition makes the whole rule
// depend on a note existing. Under "or" a single date or weekday condition can fire without
// one, so notes are only required when nothing else can carry the match.
export function needsNotes(decoration: JournalDecoration): boolean {
  const { conditions } = decoration;
  if (conditions.length === 0) return false;
  const isNoteBased = (c: JournalDecorationCondition): boolean => NOTE_BASED.has(c.type);
  return decoration.mode === "and" ? conditions.some(isNoteBased) : conditions.every(isNoteBased);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/decorations/match-window.test.ts`

Expected: PASS — 12 tests.

- [ ] **Step 5: Run the full gates**

Run each in the foreground: `npm run test`, `npm run check:types`, `npm run check:lint`.

- [ ] **Step 6: Commit**

```bash
git add src/decorations
git commit -m "feat(decorations): add the match window and the notes predicate"
```

---

### Task 2: The match query

**Files:**

- Create: `src/decorations/match-service.ts`
- Create: `src/decorations/match-service.test.ts`
- Modify: `src/decorations/index.ts`
- Modify: `src/decorations/module.ts` (register the service)

**Interfaces:**

- Consumes: Task 1's exports; `DecorationEngine.explainRange`; `DecorationsStore`; `JournalsRepository`; `JournalsIndex`; `TimelineService`; `CycleService`; `periodKindForWrite`, `periodForJournal`.
- Produces:
  - ```ts
    export type MatchBadge =
      | {
          readonly kind: "matched";
          readonly matched: number;
          readonly total: number;
          readonly unit: BadgeUnit;
          readonly direction: WindowDirection;
        }
      | {
          readonly kind: "silent";
          readonly total: number;
          readonly unit: BadgeUnit;
          readonly direction: WindowDirection;
        }
      | { readonly kind: "no-history" }
      | { readonly kind: "no-notes" };
    export type BadgeUnit = PeriodKind | "interval";
    export class DecorationMatchService {
      describe(owner: DecorationOwner, index: number): MatchBadge;
    }
    ```

#### How it works, and the three things to get right

**Reuse the engine, do not re-match.** Build the window, construct the single binding for this decoration, call `explainRange(window, [binding])`, and count the cells whose contribution list is non-empty. The engine's `inTimeline` and `periodMatchesWrite` gating comes along for free.

**1. Clip the denominator yourself.** `explainRange` silently drops out-of-timeline periods, so the _numerator_ is already clipped — but the total must be too, or a journal with twelve weeks of history reports `0 of 26` instead of `0 of 12`. Filter the window by `timeline.contains(name, anchor)` **before** calling `explainRange`, and use the filtered length as the total. Vault-wide and shelf owners have no timeline and are never clipped.

**2. Custom journals step by interval, not by day.** `periodKindForWrite("custom")` is `"day"`, but the window is intervals. Walk backward with `CycleService.previousAnchor(name, from)` from the interval containing today (`anchorOf(name, today)`), `CUSTOM_MATCH_HORIZON` times, then map each anchor through `periodForJournal(config.write, anchor)`. **Never call `anchorOf` inside the loop** — it walks the cycle for custom journals, so a per-date call makes this quadratic. The badge's unit is `"interval"`.

**3. Direction is decided by the timeline, not by preference.** Default `"past"`. If `timeline.startOf(name)` resolves to a date **after today**, the journal has no past to measure and the window looks `"future"` from that start instead. Vault-wide and shelf owners are always `"past"`.

Then the three states, in this order:

- window is empty after clipping → `{ kind: "no-history" }`
- `needsNotes(decoration)` and no period in the window has an index entry → `{ kind: "no-notes" }`
- otherwise `matched > 0 ? "matched" : "silent"`, carrying `matched`, `total`, `unit`, `direction`

- [ ] **Step 1: Write the failing tests**

Create `src/decorations/match-service.test.ts`. Build the container the way `src/decorations/use-cell-decorations.test.ts` does — it already wires `JournalsRepository`, `JournalsIndex`, `CycleService`, `TimelineService`, `NoteMetadataService`, `DecorationEngine` and `DecorationsStore`. Reuse that construction; do not write a second harness.

Cover, one `it` each, and for each name in your report the wrong implementation it catches:

```ts
// describe("DecorationMatchService")
//   describe("counting")
//     it("counts the periods a decoration matched")
//     it("reports the clipped total for a journal younger than its horizon")
//     it("reports silent for a decoration that matched nothing")
//   describe("evidence")
//     it("reports no history for a journal whose timeline starts today")
//     it("reports no notes for a note-needing decoration over a note-free window")
//     it("counts normally for a note-needing decoration once one note exists")
//     it("reports silent rather than no notes for a date-only decoration over a note-free window")
//   describe("direction")
//     it("looks forward for a journal whose timeline starts in the future")
//     it("looks backward for a journal with history")
//   describe("units")
//     it("reports weeks for a weekly journal")
//     it("reports intervals for a custom journal")
//     it("reports days for a vault-wide decoration")
```

`"reports silent rather than no notes for a date-only decoration"` is the one that pins `needsNotes` into the service — without it, always returning `no-notes` for a note-free window would pass everything else.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/decorations/match-service.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `src/decorations/match-service.ts` implementing the behaviour above. Use `inject()` field initializers (`readonly #engine = inject(DecorationEngine);` and so on), `ts-pattern` for owner dispatch, and no non-null assertions.

Construct the binding directly rather than going through `gatherBindings` — you want exactly one decoration, not a cascade:

```ts
const binding: DecorationBinding =
  owner.kind === "journal"
    ? { kind: "journal", journalName: owner.journalName, index, decoration }
    : { kind: "calendar", owner, index, decoration: decoration as CalendarDecoration };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/decorations/match-service.test.ts`

Expected: PASS — 12 tests.

- [ ] **Step 5: Register and export**

Register `DecorationMatchService` in `src/decorations/module.ts` alongside `DecorationEngine`, following that file's existing style. Export the class and `MatchBadge` from `src/decorations/index.ts`.

- [ ] **Step 6: Run the full gates and commit**

Run each in the foreground: `npm run test`, `npm run check:types`, `npm run check:lint`.

```bash
git add src/decorations
git commit -m "feat(decorations): report whether a decoration matches anything"
```

---

### Task 3: The badge

**Files:**

- Modify: `messages/en.json`
- Modify: `src/decorations/settings/ui/DecorationsSection.vue`
- Modify: `src/decorations/settings/ui/DecorationsSection.test.ts`

- [ ] **Step 1: Add the copy**

Add to `messages/en.json`. Four messages; the unit selector carries the noun so nothing is concatenated in the template:

```json
"decoration_badge_matched_past": [{"declarations":["input matched","input total","input unit"],"selectors":["unit"],"match":{"unit=day":"Matched {matched} of the last {total} days","unit=week":"Matched {matched} of the last {total} weeks","unit=month":"Matched {matched} of the last {total} months","unit=quarter":"Matched {matched} of the last {total} quarters","unit=year":"Matched {matched} of the last {total} years","unit=decade":"Matched {matched} of the last {total} decades","unit=interval":"Matched {matched} of the last {total} intervals"}}],
"decoration_badge_matched_future": [{"declarations":["input matched","input total","input unit"],"selectors":["unit"],"match":{"unit=day":"Matched {matched} of the next {total} days","unit=week":"Matched {matched} of the next {total} weeks","unit=month":"Matched {matched} of the next {total} months","unit=quarter":"Matched {matched} of the next {total} quarters","unit=year":"Matched {matched} of the next {total} years","unit=decade":"Matched {matched} of the next {total} decades","unit=interval":"Matched {matched} of the next {total} intervals"}}],
"decoration_badge_silent_past": [{"declarations":["input total","input unit"],"selectors":["unit"],"match":{"unit=day":"Matched nothing in the last {total} days","unit=week":"Matched nothing in the last {total} weeks","unit=month":"Matched nothing in the last {total} months","unit=quarter":"Matched nothing in the last {total} quarters","unit=year":"Matched nothing in the last {total} years","unit=decade":"Matched nothing in the last {total} decades","unit=interval":"Matched nothing in the last {total} intervals"}}],
"decoration_badge_silent_future": [{"declarations":["input total","input unit"],"selectors":["unit"],"match":{"unit=day":"Matched nothing in the next {total} days","unit=week":"Matched nothing in the next {total} weeks","unit=month":"Matched nothing in the next {total} months","unit=quarter":"Matched nothing in the next {total} quarters","unit=year":"Matched nothing in the next {total} years","unit=decade":"Matched nothing in the next {total} decades","unit=interval":"Matched nothing in the next {total} intervals"}}],
"decoration_badge_no_history": "No history yet",
"decoration_badge_no_notes": "No notes yet"
```

Run `npm run compile:i18n`. Stage nothing under `src/i18n/paraglide`.

☝️ The design's own example reads `matched 23 of the last 90 days` in lower case; these are sentence case because they open a badge. If the repo's UX text audit says otherwise for badges, follow the audit and say so in your report.

- [ ] **Step 2: Write the failing test**

Add to `src/decorations/settings/ui/DecorationsSection.test.ts`:

```ts
it("shows the match count on a decoration that fires", async () => {
  // Seed a journal with history and a decoration matching some of it.
  // Assert the badge text from decoration_badge_matched_past appears on that row.
});

it("shows the no-notes badge on a note-needing decoration with no notes in the window", async () => {
  // Assert decoration_badge_no_notes appears.
});
```

Two are enough here — the state machine is exhaustively covered in Task 2, and this layer only needs to prove the badge is rendered per row from the service's answer. Name in your report what each would catch.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/decorations/settings/ui/DecorationsSection.test.ts`

Expected: FAIL — no badge text renders.

- [ ] **Step 4: Render the badge**

In `DecorationsSection.vue`, resolve `DecorationMatchService` via `useService`, and compute one badge per decoration:

```ts
const badges = computed(() => decorations.value.map((_, index) => matches.describe(owner, index)));
```

Render each row's badge inside that row's existing `#description` slot, beside the condition clauses. Map `MatchBadge` to text with `ts-pattern` `match().with().exhaustive()`.

☝️ **Deliberately do not read `useIndexVersion()` in that computed.** The design asks for memoization per mount rather than per render, and the index is not Vue-reactive anyway. Reading the version would invalidate the badge on every index change and re-run up to 1800 evaluations. The computed still recomputes when the decorations list changes — a rule you just edited gets a fresh badge — but a badge does **not** update when a note is created while the section is open. That staleness is the trade the design chose; record it in a WHY comment so nobody "fixes" it by adding the version read.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/decorations/settings/ui/DecorationsSection.test.ts`

Expected: PASS.

- [ ] **Step 6: Check the cost on a realistic list**

Before the gates, sanity-check the concern the design raised. In a scratch test (do not commit it), build a journal with 20 decorations over a 90-day window and time one `badges` computation. Report the number. If it exceeds ~200 ms, stop and report rather than shipping — the design's stated fallback is computing on expand instead of on mount, and that is a decision for the controller, not a change to make unilaterally.

- [ ] **Step 7: Run the full gates and commit**

Run each in the foreground: `npm run test`, `npm run check:types`, `npm run check:lint`.

```bash
git add src/decorations messages/en.json
git commit -m "feat(decorations): badge each rule with whether it matches anything"
```

---

## Self-Review

**Design coverage**

| Design §Match badges requirement                               | Task                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| One badge per row in `DecorationsSection`                      | Task 3                                                       |
| The window looks backward                                      | Task 1 `fixedWindow`                                         |
| Future-only timeline looks forward                             | Task 2, direction rule                                       |
| Unit is the owner's period kind; days for vault-wide and shelf | Task 2, units tests                                          |
| Window clipped to the journal's timeline                       | Task 2, clipped-total rule                                   |
| Horizon table 90/26/12/8/5, 20 intervals                       | Task 1 `MATCH_HORIZON`, `CUSTOM_MATCH_HORIZON`               |
| Not user-configurable                                          | No setting added                                             |
| Three states                                                   | Task 2 `MatchBadge`                                          |
| Zero periods → no history yet                                  | Task 2, evidence tests                                       |
| Zero notes → no notes yet, for a note-needing decoration       | Task 2, evidence tests                                       |
| `and` needs notes if any condition is note-based               | Task 1 `needsNotes`                                          |
| `or` needs notes only if all are                               | Task 1 `needsNotes`                                          |
| Denominator always shown, so thin evidence is visible          | Task 3 copy — every matched/silent message carries `{total}` |
| Memoize per section mount, not per render                      | Task 3, Step 4                                               |
| Fallback if too slow: compute on expand                        | Task 3, Step 6 — measured, not assumed                       |

**Placeholder scan:** Task 2's and Task 3's test bodies are comment outlines naming the file whose harness must be reused, which this repo requires over duplicating test infrastructure. Task 1's tests and both production modules carry literal code.

**Known risk I am not designing around:** the badge is a snapshot per mount and does not refresh when notes change while the section is open. That is the design's explicit trade for cost. It is recorded in Task 3 Step 4 so the next reader sees a decision rather than a bug.

**Type consistency:** `MATCH_HORIZON`, `CUSTOM_MATCH_HORIZON`, `WindowDirection`, `fixedWindow`, `needsNotes`, `MatchBadge`, `BadgeUnit`, `DecorationMatchService.describe` are spelled identically at definition and use. `BadgeUnit` is `PeriodKind | "interval"`, and the i18n `unit` selector covers all seven values.
