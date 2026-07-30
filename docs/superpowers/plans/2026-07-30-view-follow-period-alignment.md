# Period-based follow visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a journal view's calendar blocks hold their layout only when they display the period a followed note belongs to, so the toolbar can never name a period that is off screen.

**Architecture:** Two independent local rules replace one wrong predicate. A **follow rule** at view level (`use-follow-active-note.ts`) skips moving the view's date when the opened note's own period already contains it. A **window rule** at block level (`follow-visibility.ts` + `use-window-anchor.ts`) tests period membership instead of rendered-pixel containment, and is enforced where the anchor is read so a narrowed window self-heals. Neither rule branches on journal type. No consumer of `ViewContext.refDate` changes.

**Spec:** `docs/superpowers/specs/2026-07-30-view-follow-period-alignment-design.md`

**Tech Stack:** TypeScript, Vue 3 (composition API, `<script setup>`), vitest + @testing-library/vue, wdio for e2e, valibot, custom `Option`/`Result` types in `src/infrastructure/result`.

## Global Constraints

- Commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. e2e is `npm run test:e2e`; the journeys suite has no npm alias and runs via `npx wdio run wdio.conf.mts --suite journeys`.
- Commit to the **current branch** (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.
- Never add `eslint-disable` comments; fix the code instead. Never use `@ts-expect-error` — use `expectTypeOf` for type assertions.
- `no-non-null-assertion` is ON in production code and OFF in tests. In production code use `.at(i) ?? fallback`, never `!`.
- Tests are colocated as `*.test.ts` beside the implementation. One behavior per test; test names are subject+verb behavior descriptions with no "and"/comma lists. Assert observable outcomes, not call counts or log shapes.
- No WHAT-comments. Only WHY-comments. Never write "Satisfies Requirement X" style references in code or test labels.
- A `nano-staged` pre-commit hook runs prettier on staged files; commits may reformat what you wrote. That is expected — do not fight it.
- `src/i18n/paraglide` is generated and git-ignored. This plan adds no new messages, so `npm run compile:i18n` is not needed.

---

### Task 1: Month windows test period membership, not rendered pixels

`monthWindowContains` expands the displayed months to whole weeks before testing containment, so a day rendered as spillover in the grid's margin counts as "inside the window" even though it belongs to a month the window does not display. That expansion is the defect. Removing it is the whole fix for the reported symptom: the view's date and the grid's layout stop disagreeing about which month is on screen.

**Files:**

- Modify: `src/views/blocks/ui/follow-visibility.ts:9-17`
- Test: `src/views/blocks/ui/follow-visibility.test.ts:37-40` (replace), `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts` (append)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean` — signature unchanged, semantics narrowed to the displayed months' own span. `weekWindowContains` and `spanContains` keep both signature and semantics.

- [ ] **Step 1: Invert the test that asserts the defect as intent**

In `src/views/blocks/ui/follow-visibility.test.ts`, replace the whole `it("includes a spillover day from an adjacent month shown in the grid", ...)` block at lines 37-40 with these two tests. Keep every other test in the file exactly as it is.

```ts
it("excludes a spillover day of an adjacent month the grid only paints", () => {
  // The May 2026 grid renders the trailing days of April in its first week, but April is
  // not a month this window displays.
  expect(monthWindowContains(a("2026-04-30"), a("2026-05-15"), 0, 0)).toBe(false);
});

it("includes a day of an adjacent month the window itself displays", () => {
  expect(monthWindowContains(a("2026-04-30"), a("2026-05-15"), 1, 0)).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `npm run test -- src/views/blocks/ui/follow-visibility.test.ts`

Expected: FAIL — "excludes a spillover day of an adjacent month the grid only paints" reports `expected true to be false`. The second new test passes already (April is genuinely in the window when `before` is 1), which is correct: it is the guard that stops the fix from over-shooting.

- [ ] **Step 3: Delete the whole-week expansion**

In `src/views/blocks/ui/follow-visibility.ts`, replace the body of `monthWindowContains` so it spans the displayed months only:

```ts
export function monthWindowContains(anchor: AnchorString, focus: AnchorString, before: number, after: number): boolean {
  const focusMonth = periodOfKind("month", CalendarDate.fromAnchor(focus)) as MonthPeriod;
  const months = periodWindow(focusMonth, before, after);
  // Spillover days painted in the grid's margins belong to a neighbouring month this window
  // does not display, so they are not "already shown" for the purpose of holding a layout.
  return spanContains(
    anchor,
    (months.at(0) ?? focusMonth).start.toAnchor(),
    (months.at(-1) ?? focusMonth).end.toAnchor(),
  );
}
```

The `periodOfKind("week", ...)` calls and the `gridStart`/`gridEnd` locals go away. Check whether `periodOfKind` is still used elsewhere in the file (it is — the `focusMonth`/`focusWeek` lines) so the import stays.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/views/blocks/ui/follow-visibility.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Add the block-level behavior at the seam where the rules meet**

Append to the `describe("MonthCalendarBlock", ...)` block in `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`. The `refDateOrigin` ref and `nextTick` are already imported by that file; `RefDateOrigin` is already imported as a type.

April 2026 is the month to use because it ends on a Thursday in the ISO test calendar, so a real grid paints May 1-3 in its last row — the exact case Step 3 changed.

```ts
it("re-lays-out for a followed date whose month it only paints in its margin", async () => {
  const refDate = ref("2026-04-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock(baseConfig, { refDate, refDateOrigin });

  refDateOrigin.value = "follow";
  refDate.value = "2026-05-01" as AnchorString;
  await nextTick();

  expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
});

it("holds its layout for a followed date in an adjacent month it displays", async () => {
  const refDate = ref("2026-04-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock({ ...baseConfig, after: 1 }, { refDate, refDateOrigin });

  refDateOrigin.value = "follow";
  refDate.value = "2026-05-01" as AnchorString;
  await nextTick();

  expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
});
```

- [ ] **Step 6: Run the block tests**

Run: `npm run test -- src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`

Expected: PASS, 11 tests. The pre-existing `"holds the window on a followed date that is already visible"` test must still pass — it follows from 2026-05-15 to 2026-04-02 with `before: 1, after: 1`, and April is a displayed month, so period membership still holds it.

- [ ] **Step 7: Commit**

```bash
git add src/views/blocks/ui/follow-visibility.ts src/views/blocks/ui/follow-visibility.test.ts src/views/blocks/month-calendar/MonthCalendarBlock.test.ts
git commit -m "fix(views): scope follow visibility to the months a window displays"
```

---

### Task 2: A narrowed window stops holding a stale anchor

`useWindowAnchor` decides whether to hold only at the moment the date changes. Blocks are updated in place when their config is edited — `view-leaf.ts` renders them with `key: block.id`, so the component instance survives — which means reducing `before`/`after` under a held anchor can leave the remembered anchor describing a range that no longer contains the view's date. That is the one remaining path that could resurrect the toolbar/grid mismatch, so the invariant gets enforced where the anchor is read rather than only where it is written.

**Files:**

- Modify: `src/views/blocks/ui/use-window-anchor.ts:13-27`
- Test: `src/views/blocks/ui/use-window-anchor.test.ts` (append)

**Interfaces:**

- Consumes: `monthWindowContains` / `weekWindowContains` from Task 1 (only as the real `contains` implementations block callers pass; this task's tests use a stub predicate).
- Produces: `useWindowAnchor(options: { refDate: MaybeRefOrGetter<AnchorString>; origin: MaybeRefOrGetter<RefDateOrigin>; contains: (date: AnchorString, windowAnchor: AnchorString) => boolean }): ComputedRef<AnchorString>` — signature unchanged. New guarantee: the returned value always satisfies `contains(refDate, returned)`.

- [ ] **Step 1: Write the failing test**

Append inside `describe("useWindowAnchor", ...)` in `src/views/blocks/ui/use-window-anchor.test.ts`:

```ts
it("re-centers when the window narrows under a held anchor", async () => {
  const refDate = ref(A);
  const origin = ref<RefDateOrigin>("follow");
  const wide = ref(true);
  const anchor = useWindowAnchor({ refDate, origin, contains: () => wide.value });

  refDate.value = B;
  await nextTick();
  wide.value = false;
  await nextTick();

  expect(anchor.value).toBe(B);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/views/blocks/ui/use-window-anchor.test.ts`

Expected: FAIL with `expected '2026-05-15' to be '2026-09-10'` — the anchor is still held at `A` after the window narrowed.

- [ ] **Step 3: Enforce the invariant in the returned computed**

Replace the `return computed(...)` line in `src/views/blocks/ui/use-window-anchor.ts` with:

```ts
// A remembered anchor outlives the range that justified holding it: blocks are updated in
// place when their window config shrinks, which can leave the view's date outside.
return computed(() => {
  const date = toValue(options.refDate);
  return options.contains(date, anchor.value) ? anchor.value : date;
});
```

Leave the `shallowRef` and the `watch` above it exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/views/blocks/ui/use-window-anchor.test.ts`

Expected: PASS, 4 tests. The three pre-existing tests must still pass; in particular `"holds the window on a followed date that is still inside it"` passes `contains: () => true`, so the new computed returns the held anchor unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/views/blocks/ui/use-window-anchor.ts src/views/blocks/ui/use-window-anchor.test.ts
git commit -m "fix(views): drop a held window anchor once it stops containing the view date"
```

---

### Task 3: A note whose period you are already inside does not move the view

With Task 1 in place, opening a note coarser than a month drags the view to that period's first month even when the view is already looking inside it — clicking the toolbar's Q3 badge from August would jump the grid back to July. v2 guarded against exactly this for quarters and years. The guard belongs at view level, applies to every granularity uniformly, and needs no type dispatch: a day journal's span is a day, a week's is a week, a custom interval's is the interval.

**Files:**

- Modify: `src/views/use-follow-active-note.ts`
- Modify: `src/views/view-leaf.ts:151-158`
- Test: `src/views/use-follow-active-note.test.ts`

**Interfaces:**

- Consumes: `CycleService.startOf(name, anchor): Option<CalendarDate>` and `CycleService.endOf(name, anchor): Option<CalendarDate>` from `@/journals` — both are `Some` exactly when the journal exists. `CalendarDate.isBefore/isAfter(other): boolean` from `@/calendar`.
- Produces: `FollowActiveNoteOptions` gains one required member, `currentDate: () => AnchorString`. `view-leaf.ts` is the only production call site.

- [ ] **Step 1: Give the test harness a current date and the journals the new tests need**

In `src/views/use-follow-active-note.test.ts`, change the `mount()` helper's options type and harness so it can express where the view's date currently sits. The default is deliberately far from every anchor the existing seven tests use, so they keep exercising the move path unchanged.

```ts
function mount(
  options: {
    enabled?: boolean;
    inScope?: (name: string) => boolean;
    initialActive?: { journalName: string; anchor: AnchorString };
    currentDate?: string;
  } = {},
) {
  const harness = buildNotesCalendarHarness({
    journals: {
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
      quarterly: fixedJournal("quarterly", { type: "quarter" }),
      sprint: customJournal("sprint", "week", 2, "2026-01-05"),
    },
  });
```

and inside the `Host` component's `setup`, pass the new option:

```ts
useFollowActiveNote({
  enabled: () => enabled.value,
  inScope: options.inScope ?? (() => true),
  currentDate: () => (options.currentDate ?? "2026-08-15") as AnchorString,
  onFollow: (date) => followed.push(date),
});
```

Add `customJournal` to the existing `@/journals/testing` import:

```ts
import { customJournal, fixedJournal } from "@/journals/testing";
```

- [ ] **Step 2: Write the failing tests**

Append inside `describe("useFollowActiveNote", ...)`:

```ts
it("holds the view's date when the opened note's period contains it", async () => {
  const { followed, active } = mount({ currentDate: "2026-08-15" });

  active.setActive({ journalName: "quarterly", anchor: "2026-07-01" as AnchorString });
  await nextTick();

  expect(followed).toEqual([]);
});

it("writes the opened note's date when its period does not contain the view's date", async () => {
  const { followed, active } = mount({ currentDate: "2026-06-15" });

  active.setActive({ journalName: "quarterly", anchor: "2026-07-01" as AnchorString });
  await nextTick();

  expect(followed).toEqual(["2026-07-01"]);
});

it("writes a neighbouring month's day note rather than holding on the current month", async () => {
  const { followed, active } = mount({ currentDate: "2026-04-15" });

  active.setActive({ journalName: "daily", anchor: "2026-05-01" as AnchorString });
  await nextTick();

  expect(followed).toEqual(["2026-05-01"]);
});

it("holds the view's date when the opened custom interval contains it", async () => {
  // The sprint anchored 2026-01-05 repeats every two weeks, so 2026-07-06 starts one that
  // runs through 2026-07-19.
  const { followed, active } = mount({ currentDate: "2026-07-10" });

  active.setActive({ journalName: "sprint", anchor: "2026-07-06" as AnchorString });
  await nextTick();

  expect(followed).toEqual([]);
});
```

- [ ] **Step 3: Run the tests to verify the right ones fail**

Run: `npm run test -- src/views/use-follow-active-note.test.ts`

Expected: FAIL — the two "holds the view's date" tests report a followed date where `[]` was expected (`["2026-07-01"]` and `["2026-07-06"]`). The two "writes" tests pass already; they are the guard against a fix that holds too eagerly. TypeScript will also fail the file until Step 4 adds `currentDate` to the options interface — that is expected at this step.

- [ ] **Step 4: Add the follow guard**

Replace `src/views/use-follow-active-note.ts` entirely:

```ts
import { watch } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar/active-entry";

export interface FollowActiveNoteOptions {
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly currentDate: () => AnchorString;
  readonly onFollow: (date: AnchorString) => void;
}

export function useFollowActiveNote(options: FollowActiveNoteOptions): void {
  const activeEntry = useService(ActiveEntryViewModel);
  const cycle = useService(CycleService);

  function coversCurrentDate(entry: ActiveEntryRef): boolean {
    const current = CalendarDate.fromAnchor(options.currentDate());
    return cycle
      .startOf(entry.journalName, entry.anchor)
      .flatMap((start) =>
        cycle.endOf(entry.journalName, entry.anchor).map((end) => !current.isBefore(start) && !current.isAfter(end)),
      )
      .getOr(false);
  }

  // Watching the setting alongside the active note means turning following on syncs the view
  // to the note already open, rather than waiting for the next note switch to take effect.
  // currentDate is read inside the callback on purpose: the view's date moving is not itself
  // a reason to re-evaluate a follow.
  watch(
    [activeEntry.active, options.enabled],
    ([active]) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) return;
      // The view is already inside the opened note's own period, so moving the date would
      // scroll away from what the user is looking at without showing anything new.
      if (coversCurrentDate(active)) return;
      // A week's stored anchor is its first day; the representative day is the one whose
      // calendar year is the week-year, which is what a rendered {{date}} must carry.
      const date = cycle
        .representativeOf(active.journalName, active.anchor)
        .map((day) => day.toAnchor())
        .getOr(active.anchor);
      options.onFollow(date);
    },
    { immediate: true },
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/use-follow-active-note.test.ts`

Expected: PASS, 11 tests.

- [ ] **Step 6: Wire the view's date into the follow**

In `src/views/view-leaf.ts`, add one line to the `useFollowActiveNote` call so the guard can see where the view currently sits:

```ts
useFollowActiveNote({
  enabled: () => view.value?.followActiveDate ?? true,
  inScope: (name) => scope.all.value.includes(name),
  currentDate: () => context.refDate.value,
  onFollow: (date) => {
    followedAnchor.value = date;
    leafState.refDate = date;
  },
});
```

`context.refDate` falls back to today when `leafState.refDate` is unset, so on a fresh mount the guard compares against today — which is what "the view is showing today" means.

- [ ] **Step 7: Verify the whole view suite and the types**

Run: `npm run test -- src/views && npm run check:types`

Expected: PASS. `view-leaf.test.ts` exercises the leaf root; if a test there opens a note whose period contains the leaf's current date and asserts the date moved, it is asserting the behavior this task deliberately changes — read it, and if that is the case, update the assertion to the held date and note it in the commit message rather than working around the guard.

- [ ] **Step 8: Commit**

```bash
git add src/views/use-follow-active-note.ts src/views/use-follow-active-note.test.ts src/views/view-leaf.ts
git commit -m "fix(views): keep the view date when the opened note's period contains it"
```

---

### Task 4: e2e proof that the toolbar and the grid name the same month

The mismatch is a rendering-level symptom of two derived values disagreeing, so the guard has to observe real DOM in a real Obsidian window. `view.e2e.ts` already carries a regression test for this same class of defect (`"steps a month on from the opened note's month"`, with a comment explaining what it guards) — read it before writing this one; it establishes the seeding and waiting idioms.

The spillover date must be **read from the rendered grid**, never computed. A hard-coded date passes or fails depending on which weekday the 1st falls on in the month the suite happens to run in.

**Files:**

- Modify: `e2e/journeys/view.e2e.ts` (append to the `describe("toolbar", ...)` block, after the "steps a month on..." test)
- Modify: `e2e/support/errors.ts` (one new error class — thrown errors get named classes in this repo, never inline `new Error`)

**Interfaces:**

- Consumes: `calendar.periodCell("header-month")` → locator whose `data-anchor` is the displayed month's first day; `MONTH_VIEW`, `TOOLBAR`, `openCalendarView` from `./view.js`; `seedNote`, `openNote`, `waitForJournalFrontmatter` from `../support/vault.js`; `waitForState` from `../support/wait.js`; the module-local `headerMonthAnchor()` and `monthStartOf(anchor, offset?)` helpers at `view.e2e.ts:62-71`. Day cells expose `data-anchor` and `data-outside` (`NotesMonthView.vue:159`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the error class and a helper that finds a real spillover day cell**

Append to `e2e/support/errors.ts`, matching the five existing classes' shape:

```ts
export class NoSpilloverDayError extends Error {
  constructor() {
    super("no outside-month day cell rendered in three consecutive months");
    this.name = "NoSpilloverDayError";
  }
}
```

Then add the helper to `e2e/journeys/view.e2e.ts` directly after `monthStartOf` (which ends at line 71), since it calls `headerMonthAnchor` defined just above it:

```ts
// A month that both starts on the week's first day and ends on its last renders no
// outside-month cells at all, so step forward until one appears rather than computing a date
// that only sometimes lands in the margin.
async function spilloverDayAnchor(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const outside = await $$(`${MONTH_VIEW} .notes-month-view__day[data-outside]`);
    const anchor = outside.length > 0 ? await outside[0]?.getAttribute("data-anchor") : null;
    if (anchor) return anchor;
    const before = await headerMonthAnchor();
    await $(`${TOOLBAR} [aria-label="Next month"]`).click();
    await waitForState(headerMonthAnchor, (current) => current !== before, "header-month did not advance");
  }
  throw new NoSpilloverDayError();
}
```

`$$` and `waitForState` are already imported at the top of the file; add `NoSpilloverDayError` to the existing `../support/errors.js` import beside `NoFreeDayError`.

- [ ] **Step 2: Write the failing tests**

```ts
it("moves the grid to the month of a note opened from a spillover cell", async () => {
  await openCalendarView();
  const spillover = await spilloverDayAnchor();
  const path = `day/${spillover}.md`;
  await seedNote(path, `---\njournal: daily\njournal-date: ${spillover}\n---\n`);
  await waitForJournalFrontmatter(path, { journal: "daily", date: spillover });

  await openNote(path);

  await waitForState(
    headerMonthAnchor,
    (anchor) => anchor === monthStartOf(spillover),
    "calendar did not move to the spillover day's own month",
  );
});

it("names the same month in the toolbar as the grid heading", async () => {
  await openCalendarView();
  const spillover = await spilloverDayAnchor();
  const path = `day/${spillover}.md`;
  await seedNote(path, `---\njournal: daily\njournal-date: ${spillover}\n---\n`);
  await waitForJournalFrontmatter(path, { journal: "daily", date: spillover });

  await openNote(path);
  await waitForState(
    headerMonthAnchor,
    (anchor) => anchor === monthStartOf(spillover),
    "calendar did not move to the spillover day's own month",
  );

  // The toolbar button renders the month's name, the heading carries its anchor; derive the
  // expected name from whatever month the grid settled on so the assertion is month-agnostic.
  const settled = (await headerMonthAnchor()) ?? "";
  const expected = new Date(`${settled}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  await expect($(`${TOOLBAR} [data-period="month"]`)).toHaveText(expected);
});
```

- [ ] **Step 3: Run the suite to verify the tests fail against the old behavior**

Because Tasks 1-3 are already committed, these tests will pass immediately. To prove they actually guard the fix, stash the fix and watch them fail:

```bash
git stash push src/views/blocks/ui/follow-visibility.ts
npx wdio run wdio.conf.mts --suite journeys
```

Expected: FAIL — "calendar did not move to the spillover day's own month". Then restore:

```bash
git stash pop
```

If the two tests pass with the fix stashed, they are not testing what they claim; the most likely cause is `spilloverDayAnchor` returning a date in the _displayed_ month, so re-check the `[data-outside]` selector against the rendered DOM before continuing.

- [ ] **Step 4: Run the suite with the fix in place**

Run: `npx wdio run wdio.conf.mts --suite journeys`

Expected: PASS, including the pre-existing "steps a month on from the opened note's month" test.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view.e2e.ts e2e/support/errors.ts
git commit -m "test(e2e): guard the toolbar month against the grid it labels"
```

---

### Task 5: Correct the records that certified the defect

Two documents currently assert that the behavior fixed here was correct. `docs/2026-06-01-v2-v3-feature-gaps.md:359` lists "active-note follow (week/quarter/year spillover)" among the sweeps verified as faithful to v2 — a verification that compared v3's guard against v2's _week-branch_ guard and never examined the day, month and custom cases, which v2 handled by having no guard at all. Left alone, that line re-certifies this defect for the next sweep. The spec also needs one sentence for a consequence found while planning.

**Files:**

- Modify: `docs/2026-06-01-v2-v3-feature-gaps.md` (line 359, plus a new numbered entry — 163 is the next free number; 162 is the last, unchecked)
- Modify: `docs/superpowers/specs/2026-07-30-view-follow-period-alignment-design.md` (deliberate change 2)
- Modify: `docs/manual-testing-checklist-v3.md` (this file already has uncommitted changes in the working tree — add to it, do not revert or commit unrelated hunks)

**Interfaces:**

- Consumes: the behavior shipped in Tasks 1-3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Amend the spec for the mount-time consequence**

The follow guard also applies on the `{ immediate: true }` first run, so a view opening while a journal note is already active now starts on today rather than on that note's anchor **when the note's period contains today**. That refines the amended spec's "the view is opened while a journal note is active" scenario, and belongs with deliberate change 2. Append to that item in `docs/superpowers/specs/2026-07-30-view-follow-period-alignment-design.md`:

```markdown
The same applies at mount: a view opening while this month's month note is
active starts on today rather than on the 1st, since the guard runs on the
watcher's immediate first pass too. The amended spec's "starts on that note's
date rather than on today" scenario still holds for every note whose period
does not contain today, which is the case it was written for.
```

- [ ] **Step 2: Correct the false verification**

In `docs/2026-06-01-v2-v3-feature-gaps.md`, find the parenthetical `active-note follow (week/quarter/year spillover)` in the long "Bounding the search" paragraph at line 359 and replace that fragment with a pointer to the new entry, so the line no longer reads as covering the day/month/custom cases:

```markdown
active-note follow — week/quarter/year spillover only, see #163 for the day/month/custom cases this sweep did not reach;
```

- [ ] **Step 3: Record the gap entry**

Append a new entry to the numbered list, matching the existing entries' `- [x] **N. Title.** Fixed (...)` shape:

```markdown
- [x] **163. Follow held the calendar on spillover days.** Fixed (2026-07-30): `monthWindowContains` expanded the displayed months to whole weeks before testing containment, so opening a note whose date fell in the grid's margin held the window while `refDate` moved into the neighbouring month — the toolbar's period buttons named a month the grid was not laid out around (`src/views/blocks/ui/follow-visibility.ts`). v2 moved the display unconditionally for day/month/custom notes (`_old-code/calendar-view/CalendarView.vue` `default:` branch) and only guarded quarter/year by whether the display was already inside that period. Now: a window holds only for a date whose period at that block's granularity is one it displays, and a follow leaves the view's date alone when the opened note's period already contains it — v2's outcomes, without v2's per-type branching. Two deliberate deviations: a custom interval containing the view's date no longer pulls the display to the interval's start, and a month note for the month you are already in no longer snaps the date to the 1st (visible only through a custom-intervals block resolving a narrower window from it). Spec: `docs/superpowers/specs/2026-07-30-view-follow-period-alignment-design.md`.
```

- [ ] **Step 4: Add the manual check**

Append to `docs/manual-testing-checklist-v3.md`, in whichever calendar-view or journal-view section matches the file's existing structure (read it first — it has uncommitted edits from another change; leave those alone):

```markdown
- Open a day note from a greyed-out spillover cell at the edge of the month grid: the grid moves to that day's own month and the toolbar's month button names the same month as the grid heading. With the month block's `after` set to 1, the grid instead keeps both months on screen and the toolbar names the neighbour.
- Click the quarter button while the calendar shows a month inside that quarter: the quarter note opens, the quarter button highlights, and the grid does not move.
```

- [ ] **Step 5: Verify the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all three PASS. Report the actual output; do not claim completion from a partial run.

- [ ] **Step 6: Commit**

```bash
git add docs/2026-06-01-v2-v3-feature-gaps.md docs/superpowers/specs/2026-07-30-view-follow-period-alignment-design.md docs/manual-testing-checklist-v3.md
git commit -m "docs: record the follow-visibility fix and correct its false verification"
```

Note: `docs/manual-testing-checklist-v3.md` carries unrelated uncommitted work. If those hunks are not yours to commit, stage only your addition with `git add -p`.
