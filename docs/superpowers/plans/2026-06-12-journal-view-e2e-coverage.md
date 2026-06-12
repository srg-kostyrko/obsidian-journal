# Journal-view e2e coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end coverage for the journal-view capabilities that currently have none — the `week-calendar`, `markdown-template`, `custom-intervals`, and `divider` blocks, and the toolbar `button` / `period-buttons` items.

**Architecture:** New tests drive real Obsidian interactions through mounted view leaves. Most run against the auto-seeded default Calendar view in the existing `e2e-journeys` fixture (toolbar, custom-intervals); the two blocks absent from every view (`week-calendar`, `markdown-template`) get a dedicated `e2e-views` fixture holding a single "Blocks" view. Tests assert observable outcomes (note created/opened, cell anchor changed, block rendered); where a seam is already covered elsewhere (the `NavBlockRow` click in `custom-intervals`), the test asserts render only.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript, the project's `e2e/support/*` and `e2e/journeys/*` helpers.

---

## Background facts (verified against the codebase)

- The default Calendar view is **auto-seeded only when the `views` key is absent** from `data.json` (`src/settings/settings-service.ts:186`; seed at `src/views/config.ts:53`). So we must NOT add a `views` key to `e2e-journeys/data.json`. Adding a journal is safe.
- A view's ribbon button has `aria-label` = `Open ${view.name}` (`src/views/view-host.ts:98`).
- Toolbar `button` items render `UiButton` with `aria-label` = tooltip. Confirmed strings (`messages/en.json`): `"Pick a date"`, `"Today"`, `"Previous month"`, `"Next month"`, `"Previous year"`, `"Next year"`.
- `period-buttons` render `UiButton[data-period][data-active]`; `data-active` is the string `"true"` when active, absent otherwise.
- The date-picker modal root is `.date-picker-modal`; its day cells are `[data-testid="month-cell"][data-anchor="YYYY-MM-DD"]` (`src/calendar/ui/DatePickerModal.vue`, `CalendarMonthView.vue:54`).
- `NotesCalendarCell` renders `.notes-calendar-cell[data-anchor]`. The month grid wraps each in `.notes-month-view__day`; the week view (`NotesWeekView`) puts day cells as bare `.notes-calendar-cell` inside `.notes-week-view__row`, with the week-number cell additionally carrying `.notes-week-view__week-number` and `data-testid="week-number-cell"`.
- Block roots: `.journal-view-week-calendar` → `.notes-week-view`; `.journal-view-markdown-template` (states `__empty`, `__error`); `.journal-view-custom-intervals` → `[data-journal="<name>"]` sections → `.journal-view-custom-intervals__entry`; `.journal-view-divider[role="separator"]`.
- `custom-intervals` lists entries from `JournalsIndex.getRange(journal, windowStart, windowEnd)` over **`custom`-write journals in scope**; the `e2e-journeys` fixture has none, which is why it renders empty today.
- Run a single e2e spec with: `npm run test:e2e -- --spec ./e2e/journeys/<file>.e2e.ts` (builds, then runs only that spec). The `journeys` suite glob is `./e2e/journeys/**/*.e2e.ts`.
- Support helpers available: `seedNote`, `writeNote`, `waitForFrontmatter`, `waitForActiveNoteIn`, `waitForActiveNote`, `activeNotePath` (`e2e/support/vault.ts`); `waitForState(getter, predicate, msg)` (`e2e/support/wait.ts`); `note(journal, anchor, body?, extraFrontmatter?)`, `dayAnchor(day)` (`e2e/journeys/decorations.ts`); `calendarSurface(root)`, `openCalendarView()` (`e2e/journeys/calendar.ts`, `view.ts`).

**Note on TDD cadence for these tests:** the features under test already exist, so each new test is expected to **PASS** on first correct run. The "fail-first" check here is the reverse — if a freshly written coverage test fails, treat it as a discovered bug or a selector error and investigate before moving on (do not weaken the assertion to make it pass).

---

## Task 1: Share the live-leaf selectors in the view helper

Adds the toolbar selector and a `LIVE_LEAF` base that later tasks reuse, without changing existing behavior.

**Files:**

- Modify: `e2e/journeys/view.ts`

- [ ] **Step 1: Refactor `view.ts` to export `LIVE_LEAF` and `toolbar`**

Replace the whole body of `e2e/journeys/view.ts` with:

```ts
import { $ } from "@wdio/globals";

import { calendarSurface } from "./calendar.js";

const RIBBON_OPEN_CALENDAR = '[aria-label="Open Calendar"]';
// Re-clicking the ribbon leaves Obsidian's previous (deferred) calendar leaf in the
// DOM, hidden via inline `display: none`, so a bare `.notes-month-view` resolves to
// the stale copy. The live leaf is the one whose `.workspace-leaf` is not inline-
// hidden — independent of focus, which moves to the opened note (so `.mod-active`
// is wrong here).
export const LIVE_LEAF = '.workspace-leaf:not([style*="display: none"])';
const MONTH_VIEW = `${LIVE_LEAF} .notes-month-view`;

// The view-leaf toolbar block, scoped to the live leaf so a stale hidden leaf's
// toolbar never shadows it.
export const TOOLBAR = `${LIVE_LEAF} .journal-view-toolbar`;

// The single view-leaf calendar surface, bound to the live-leaf month root.
export const calendar = calendarSurface(MONTH_VIEW);

// The auto-seeded default view registers a left-ribbon button whose accessible name
// is its command name ("Open Calendar"). Clicking it is the real click path into the
// view-leaf mount — not executeCommandById.
export async function openCalendarView(): Promise<void> {
  await $(RIBBON_OPEN_CALENDAR).click();
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the Open Calendar ribbon click",
  });
}
```

- [ ] **Step 2: Verify nothing broke (types + existing view spec still compiles)**

Run: `npm run check:types`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/view.ts
git commit -m "test(e2e): share live-leaf and toolbar selectors in the view helper"
```

---

## Task 2: Toolbar navigate-step coverage

Drives the prev/next-month buttons and asserts the calendar re-windows (the `header-month` cell's `data-anchor` advances then returns).

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Add the toolbar describe with the navigate-step test**

In `e2e/journeys/view.e2e.ts`, add `waitForState` to the support imports and `TOOLBAR` to the `./view.js` import, then append a new `describe("toolbar", ...)` block inside the top-level `describe("calendar view", ...)` (after the `describe("live editing", ...)` block).

Update imports at the top of the file:

```ts
import { waitForState } from "../support/wait.js";
```

and change the `./view.js` import to:

```ts
import { calendar, openCalendarView, TOOLBAR } from "./view.js";
```

Append this block:

```ts
describe("toolbar", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  const headerMonthAnchor = async (): Promise<string | undefined> =>
    (await calendar.periodCell("header-month").getAttribute("data-anchor")) ?? undefined;

  it("advances the calendar a month when the next-month button is clicked", async () => {
    await openCalendarView();
    const start = await headerMonthAnchor();

    await $(`${TOOLBAR} [aria-label="Next month"]`).click();

    await waitForState(headerMonthAnchor, (anchor) => anchor !== start, "header-month did not advance");
  });

  it("rewinds the calendar a month when the previous-month button is clicked", async () => {
    await openCalendarView();
    const start = await headerMonthAnchor();

    await $(`${TOOLBAR} [aria-label="Next month"]`).click();
    await waitForState(headerMonthAnchor, (anchor) => anchor !== start, "header-month did not advance");

    await $(`${TOOLBAR} [aria-label="Previous month"]`).click();

    await waitForState(headerMonthAnchor, (anchor) => anchor === start, "header-month did not return");
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts`
Expected: PASS, including the two new toolbar tests. (If `header-month` never changes, the nav button selector or the re-window seam is broken — investigate, do not relax the assertion.)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): cover toolbar month navigation re-windowing the calendar"
```

---

## Task 3: Toolbar period-buttons and Today coverage

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Ensure `waitForFrontmatter` and `waitForActiveNoteIn` are imported**

The file already imports `waitForActiveNoteIn` and `waitForFrontmatter` from `../support/vault.js`. Confirm both names are present in that import; if not, add them.

- [ ] **Step 2: Add the period-buttons test inside the `describe("toolbar", ...)` block**

```ts
it("creates and opens this month's note when the month period button is clicked", async () => {
  await openCalendarView();
  await $(`${TOOLBAR} [data-period="month"]`).click();

  const path = await waitForActiveNoteIn("month");
  await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);

  await waitForState(
    async () => (await $(`${TOOLBAR} [data-period="month"]`).getAttribute("data-active")) ?? undefined,
    (active) => active === "true",
    "month period button did not become active after its note opened",
  );
});
```

- [ ] **Step 3: Add the Today button test inside the same block**

```ts
it("creates and opens today's day note when the Today button is clicked", async () => {
  await openCalendarView();
  await $(`${TOOLBAR} [aria-label="Today"]`).click();

  const path = await waitForActiveNoteIn("day");
  await waitForFrontmatter(path, (fm) => fm.journal === "daily", `waited for ${path} to attach journal=daily`);
});
```

- [ ] **Step 4: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts`
Expected: PASS, including the two new tests.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): cover toolbar period-buttons and Today opening journal notes"
```

---

## Task 4: Toolbar pick-date modal coverage

Seeds an existing day note, opens the date-picker modal from the pick-date button, picks that day, and asserts the note opens (the default view's pick-date button is `mode: "navigate"`, i.e. existing-only).

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Ensure `seedNote`, `waitForActiveNote`, `dayAnchor`, and `note` are available**

`dayAnchor` and `note` are already imported from `./decorations.js`. Add `seedNote` and `waitForActiveNote` to the `../support/vault.js` import if not already present (`seedNote` is already imported; add `waitForActiveNote`).

- [ ] **Step 2: Add the pick-date test inside the `describe("toolbar", ...)` block**

```ts
it("navigates to an existing day note picked from the date-picker modal", async () => {
  const anchor = dayAnchor(20);
  const path = `day/${anchor}.md`;
  await seedNote(path, note("daily", anchor));
  await waitForFrontmatter(path, (fm) => fm.journal === "daily", `waited for ${path} to be indexed`);

  await openCalendarView();
  await $(`${TOOLBAR} [aria-label="Pick a date"]`).click();

  const modal = $(".date-picker-modal");
  await modal.waitForExist({ timeoutMsg: "date-picker modal did not open" });
  await modal.$(`[data-testid="month-cell"][data-anchor="${anchor}"]`).click();

  await waitForActiveNote(path);
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts`
Expected: PASS, including the pick-date test.

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): cover the toolbar pick-date modal navigating to a picked note"
```

---

## Task 5: custom-intervals block coverage

Adds a `custom`-write journal to the `e2e-journeys` fixture, seeds a connected note in the current month, opens the default view, and asserts the `custom-intervals` block renders a section with an entry.

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`
- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Add the `sprint` custom journal to the fixture**

In `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`, add a `"sprint"` entry to the `journals` object (alongside `daily`/`weekly`/…). Insert it as a new key inside `"journals": { ... }`:

```json
    "sprint": {
      "name": "sprint",
      "write": { "type": "custom", "every": "week", "duration": 2, "anchorDate": "2026-01-05" },
      "folder": "sprint",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-MM-DD",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] },
      "intervalBlock": {
        "type": "create",
        "decorateWholeBlock": false,
        "rows": [
          {
            "template": "{{date}}",
            "fontSize": 1,
            "bold": false,
            "italic": false,
            "color": { "type": "theme", "name": "text-normal" },
            "background": { "type": "transparent" },
            "link": "self",
            "journal": "",
            "addDecorations": false
          }
        ]
      }
    }
```

(Add a trailing comma on the journal entry that precedes it so the JSON stays valid.)

- [ ] **Step 2: Add `LIVE_LEAF` to the `./view.js` import in the spec**

Change the `./view.js` import in `e2e/journeys/view.e2e.ts` to:

```ts
import { calendar, LIVE_LEAF, openCalendarView, TOOLBAR } from "./view.js";
```

- [ ] **Step 3: Add the custom-intervals describe block**

Append inside the top-level `describe("calendar view", ...)`:

```ts
describe("custom intervals block", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("renders a section with an entry for an indexed custom-interval note", async () => {
    const anchor = dayAnchor(10);
    const path = `sprint/${anchor}.md`;
    await seedNote(path, note("sprint", anchor));
    await waitForFrontmatter(path, (fm) => fm.journal === "sprint", `waited for ${path} to be indexed`);

    await openCalendarView();

    const section = $(`${LIVE_LEAF} .journal-view-custom-intervals [data-journal="sprint"]`);
    await section.waitForExist({ timeoutMsg: "custom-intervals section for sprint did not render" });
    await expect(section.$(".journal-view-custom-intervals__entry")).toBeExisting();
  });
});
```

- [ ] **Step 4: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts`
Expected: PASS. (If the section never appears, confirm the sprint note indexed under `journal: sprint` and that its date falls in the current month — the `window` is `current-month`. If the entry exists but the section is empty, the index range mapping for custom journals needs inspection — that is a real finding, not a test bug.)

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json e2e/journeys/view.e2e.ts
git commit -m "test(e2e): cover the custom-intervals view block rendering an indexed section"
```

---

## Task 6: Generalize the calendar surface for the week view

`calendarSurface` hardcodes the month day-cell scope. Parameterize it so the week-calendar test can address week-view day cells, with the month default unchanged.

**Files:**

- Modify: `e2e/journeys/calendar.ts`

- [ ] **Step 1: Parameterize the day-cell selector**

In `e2e/journeys/calendar.ts`, change the `calendarSurface` signature and `cell` builder. Replace:

```ts
export function calendarSurface(root: string): CalendarSurface {
  const cell = (anchor: string): CellLocator => $(`${root} .notes-month-view__day[data-anchor="${anchor}"]`);
```

with:

```ts
// The day-cell scope differs per mount: the month grid wraps each cell in
// `.notes-month-view__day`; the week view renders bare `.notes-calendar-cell`s in its
// row. Callers pass the scope so a week anchor that coincides with a day anchor never
// resolves to the wrong cell.
export function calendarSurface(root: string, daySelector = ".notes-month-view__day"): CalendarSurface {
  const cell = (anchor: string): CellLocator => $(`${root} ${daySelector}[data-anchor="${anchor}"]`);
```

- [ ] **Step 2: Verify types and that existing callers still compile**

Run: `npm run check:types`
Expected: PASS. (`view.ts` and `code-blocks.ts` call `calendarSurface(root)` with one argument, which still works via the default.)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/calendar.ts
git commit -m "test(e2e): parameterize calendarSurface day-cell scope for the week view"
```

---

## Task 7: e2e-views fixture and the Blocks view helper

Create the dedicated fixture holding a single "Blocks" view, plus the helper to open it and a week-view surface.

**Files:**

- Create: `e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json`
- Create: `e2e/journeys/view-blocks.ts` (helper)

- [ ] **Step 1: Create the `e2e-views` fixture config**

Create `e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json`:

```json
{
  "version": 4,
  "journals": {
    "daily": {
      "name": "daily",
      "write": { "type": "day" },
      "folder": "day",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-MM-DD",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] }
    },
    "weekly": {
      "name": "weekly",
      "write": { "type": "week" },
      "folder": "week",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-[W]ww",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] }
    }
  },
  "views": {
    "a1b2c3d4-0e1f-4a2b-8c3d-4e5f6a7b8c9d": {
      "id": "a1b2c3d4-0e1f-4a2b-8c3d-4e5f6a7b8c9d",
      "name": "Blocks",
      "icon": "layout-list",
      "defaultShelf": null,
      "showInRibbon": true,
      "leaf": "right",
      "blocks": [
        {
          "id": "b2c3d4e5-1f2a-4b3c-9d4e-5f6a7b8c9d0e",
          "key": "week-calendar",
          "config": { "before": 0, "after": 0, "hideWeekends": false, "weeks": "left" }
        },
        {
          "id": "c3d4e5f6-2a3b-4c4d-8e5f-6a7b8c9d0e1f",
          "key": "markdown-template",
          "config": { "templatePath": "templates/view-template.md" }
        },
        {
          "id": "d4e5f6a7-3b4c-4d5e-9f6a-7b8c9d0e1f2a",
          "key": "divider",
          "config": {}
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Create the Blocks-view helper**

Create `e2e/journeys/view-blocks.ts`:

```ts
import { $ } from "@wdio/globals";

import { calendarSurface } from "./calendar.js";
import { LIVE_LEAF } from "./view.js";

const RIBBON_OPEN_BLOCKS = '[aria-label="Open Blocks"]';

export const WEEK_CALENDAR = `${LIVE_LEAF} .journal-view-week-calendar`;
export const MARKDOWN_TEMPLATE = `${LIVE_LEAF} .journal-view-markdown-template`;
export const DIVIDER = `${LIVE_LEAF} .journal-view-divider`;

// The week view's day cells are bare `.notes-calendar-cell`s in the row; the
// week-number cell is also a `.notes-calendar-cell`, so exclude it by its class.
export const weekCalendar = calendarSurface(
  `${LIVE_LEAF} .notes-week-view`,
  ".notes-week-view__row .notes-calendar-cell:not(.notes-week-view__week-number)",
);

export async function openBlocksView(): Promise<void> {
  await $(RIBBON_OPEN_BLOCKS).click();
  await $(WEEK_CALENDAR).waitForExist({
    timeoutMsg: "Blocks view did not render after the Open Blocks ribbon click",
  });
}
```

- [ ] **Step 3: Verify types**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/e2e-views/.obsidian/plugins/journals/data.json e2e/journeys/view-blocks.ts
git commit -m "test(e2e): add e2e-views fixture and Blocks view helper"
```

---

## Task 8: week-calendar block coverage (render + interaction)

**Files:**

- Create: `e2e/journeys/view-blocks.e2e.ts`

- [ ] **Step 1: Create the spec with the week-calendar render + click test**

Create `e2e/journeys/view-blocks.e2e.ts`:

```ts
import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor } from "./decorations.js";
import { openBlocksView, weekCalendar, WEEK_CALENDAR } from "./view-blocks.js";

// The Blocks view (e2e-views fixture) mounts the three blocks that never appear in the
// default Calendar view. The view-leaf mount is the real seam: a ribbon click renders
// the configured blocks in an Obsidian leaf.

describe("blocks view", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
  });

  describe("week-calendar block", () => {
    it("renders the week grid with its header and week-number cells", async () => {
      await openBlocksView();

      await expect($(WEEK_CALENDAR)).toBeExisting();
      await expect($(`${WEEK_CALENDAR} .notes-week-view`)).toBeExisting();
      await expect(weekCalendar.periodCell("week-number-cell")).toBeExisting();
      await expect(weekCalendar.periodCell("header-month")).toBeExisting();
    });

    it("creates and opens a day note when a week-grid day cell is clicked", async () => {
      const anchor = dayAnchor(15);
      const path = `day/${anchor}.md`;

      await openBlocksView();
      await weekCalendar.cell(anchor).click();

      await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
      await weekCalendar.waitForActive(anchor);
      expect(await activeNotePath()).toBe(path);
    });
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view-blocks.e2e.ts`
Expected: PASS for both week-calendar tests. (If `dayAnchor(15)` falls outside the rendered week, the click finds no cell — the week view shows only the focus week. `dayAnchor(15)` is mid-month; if the focus week excludes it, switch to an anchor known to be in the current week by reading a rendered day cell's `data-anchor` first. Verify during the run.)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/view-blocks.e2e.ts
git commit -m "test(e2e): cover the week-calendar view block rendering and day-cell open"
```

---

## Task 9: markdown-template and divider block coverage

**Files:**

- Modify: `e2e/journeys/view-blocks.e2e.ts`

- [ ] **Step 1: Add `seedNote` to the imports**

Change the `../support/vault.js` import in `e2e/journeys/view-blocks.e2e.ts` to:

```ts
import { activeNotePath, seedNote, waitForJournalFrontmatter } from "../support/vault.js";
```

and add to the `./view-blocks.js` import:

```ts
import { DIVIDER, MARKDOWN_TEMPLATE, openBlocksView, weekCalendar, WEEK_CALENDAR } from "./view-blocks.js";
```

- [ ] **Step 2: Add the markdown-template describe with a before-hook that seeds the template**

The Blocks view's `markdown-template` block points at `templates/view-template.md`. Seed it before opening the view so the block reads real content (not its `__empty` state). Add inside `describe("blocks view", ...)`:

```ts
describe("markdown-template block", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
    await seedNote("templates/view-template.md", "# View block template heading\n");
  });

  it("renders the template's content rather than the empty or error state", async () => {
    await openBlocksView();

    const block = $(MARKDOWN_TEMPLATE);
    await block.waitForExist({ timeoutMsg: "markdown-template block did not render" });
    await expect(block).not.toHaveElementClass("journal-view-markdown-template__empty");
    await expect(block.$("h1")).toHaveText("View block template heading");
  });
});
```

- [ ] **Step 3: Add the divider test**

Add inside `describe("blocks view", ...)`:

```ts
describe("divider block", () => {
  it("renders a separator element", async () => {
    await openBlocksView();
    await expect($(`${DIVIDER}[role="separator"]`)).toBeExisting();
  });
});
```

- [ ] **Step 4: Run the spec**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view-blocks.e2e.ts`
Expected: PASS for all blocks-view tests. (If the markdown-template heading text mismatches, confirm `UiMarkdown` renders the seeded markdown into an `h1`; the seeded content is static so no template-variable timing is involved.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view-blocks.e2e.ts
git commit -m "test(e2e): cover markdown-template and divider view blocks rendering"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check and lint the whole project**

Run: `npm run check:types && npm run check:lint`
Expected: both PASS.

- [ ] **Step 2: Run the unit suite (guards against accidental breakage)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Run the full journeys e2e suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: PASS, including `view.e2e.ts` and the new `view-blocks.e2e.ts`. Confirm no pre-existing journeys test regressed from the `sprint` journal added to `e2e-journeys` (the decoration matrix and shelf-scope tests must still pass).

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "test(e2e): finalize journal-view coverage"
```

(Skip if nothing changed since Task 9.)

---

## Self-review notes

- **Spec coverage:** week-calendar (Tasks 6–8), markdown-template (Task 9), custom-intervals (Task 5), divider (Task 9), toolbar navigate-step (Task 2), period-buttons + current (Task 3), pick-date (Task 4). All six gaps mapped.
- **Deliberate scope:** custom-intervals is render-only by design (the `NavBlockRow` open/create seam is covered in `code-blocks.e2e.ts`); week-calendar interaction is kept because its `NotesCalendarCell` mount in the week layout is distinct from the month grid.
- **Fixture safety:** no `views` key added to `e2e-journeys` (preserves default-view auto-seed); only a journal added. The new view lives in the isolated `e2e-views` fixture.
- **Type consistency:** `LIVE_LEAF`/`TOOLBAR` exported from `view.ts` (Task 1) and consumed in Tasks 5, 7; `calendarSurface(root, daySelector?)` defined in Task 6 and consumed in Task 7; `weekCalendar`/`WEEK_CALENDAR`/`MARKDOWN_TEMPLATE`/`DIVIDER`/`openBlocksView` defined in Task 7 and consumed in Tasks 8–9.
