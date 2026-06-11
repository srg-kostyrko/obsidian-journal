# E2E Slice B — Chunk 1 (View-leaf decorations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the view-leaf decoration matrix to `view.e2e.ts` — 6 condition decorations (one per condition kind), 6 style decorations asserted through Obsidian's **real CSS cascade**, and 1 interactive shelf-scope test — and, ahead of chunk 2, refactor chunk 0's `support/view.ts` plain functions into a root-bound `calendarSurface(root)` factory colocated under `e2e/journeys/`.

**Architecture:** Decorations are stored **per-journal** (`journals[name].decorations: JournalDecoration[]`) and evaluated only against that journal's note at each anchor (`DecorationEngine.evaluateRange`, gated by `periodMatchesWrite`). The `journal-date` frontmatter is always the **ISO anchor string** (`FrontmatterService.writeMutator` writes `metadata.anchor`; `parseEntry` reads it back via `CalendarDate.parse`), which equals each cell's `data-anchor` — so every test note is hand-seeded by computing (daily) or reading-off-the-cell (week/month/quarter/year) that ISO anchor. Isolation is by **crafted condition per cell**: each of the 12 decorations is wired to a journal + condition such that exactly one seeded note in the shared fixture matches it, with any empty day cell as a universal control. The whole matrix runs on a **second `reloadObsidian` boot** in its own top-level `describe` (the chunk-0 journeys keep their boot), so journey-created notes never contaminate the decoration state.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers); Vue 3 SFC under test. Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**` via `tsconfig.e2e.json`), `npm run check:lint` (`eslint .`), `npm test` (vitest — unchanged here, no production edit), `npm run test:e2e -- --suite journeys` (builds plugin + boots real Obsidian).

**Verification model:** Chunk 1 makes **no production change** — the decoration rendering, the cascade, and the shelf-scope re-evaluation all already exist and are unit/component-covered for their jsdom-reachable parts. The e2e specs assert that existing behavior against real Obsidian; a red spec is a real finding (or a fixture/selector bug), not a missing feature. The factory move is a **behavior-preserving refactor** whose regression net is the (now-green) chunk-0 journeys. The fixture and helpers are test infrastructure → no tests of their own (repo convention); the specs are their net. Per-task fast gate = `check:types` + `check:lint`; behavioral confirmation = `npm run test:e2e -- --suite journeys`.

---

## Background facts (verified against live v3 source — do not re-derive)

- **Per-journal decoration storage:** `journals[name].decorations: v.optional(v.array(decorationSchema), [])` (`src/journals/config.ts:138`). `useCellDecorations.gatherDecorations()` reads each in-scope journal's array (`src/decorations/use-cell-decorations.ts:28-38`). The fixture adds a `decorations` array to each journal.
- **Per-journal, per-anchor evaluation:** `DecorationEngine.evaluateRange` resolves `entryByAnchor(journalName, anchorString)` then the note's metadata (`src/decorations/engine.ts:60-77`); `periodMatchesWrite` gates a day-journal deco to day periods, week→week, etc. (`engine.ts:29-37`). So a deco lights **only** its journal's cell(s).
- **`journal-date` is the ISO anchor for every kind:** `writeMutator` sets `fm[dateField] = metadata.anchor` (`src/journals/frontmatter.ts:105`); `parseEntry` reads `frontmatter[dateField]` → `CalendarDate.parse(rawDate).toAnchor()` (`frontmatter.ts:30-34`). `dateFormat` only shapes the **filename**. A cell's `data-anchor` = `rawPeriod.anchor.toAnchor()` (`NotesCalendarCell.vue`) — the same string. So `journal-date` = the value read from `data-anchor`.
- **Metadata extraction** (`src/infrastructure/host/internal/note-metadata-service.ts:18-25`): `title` = `file.basename`; `tags` = `cache.tags` (**inline** `#tag` occurrences, value keeps the leading `#`); `properties` = `cache.frontmatter`; `tasks` = list items with a checkbox, `completed = item.task !== " "` (`- [ ]` → open, `- [x]` → completed).
- **Condition match rules** (`src/decorations/engine-checks.ts`): `title`/`tag` use contains/starts-with/ends-with (case-insensitive); `property` `exists` matches when the frontmatter key is present; `has-note` = a journal entry exists; `has-open-task` = ≥1 open task; `all-tasks-completed` = ≥1 task and all completed.
- **Decoration DOM** (`src/decorations/ui/`): root `<span class="cell-decoration" data-testid="cell-decoration">` carries `background-color: v-bind(background) !important` and `color: v-bind(textColor) !important` (`CellDecoration.vue:55-68`). Border is inline on a child `<span class="cell-decoration__border">` (`CellDecoration.vue:39`, `derive-styles.ts:37-66`). `corner` → `<div class="decoration-corner <placement>">` (`DecorationCorner.vue:14`). `shape` → `<div class="shape-decoration shape-<shape>">` (`DecorationShape.vue:15`). `icon` → `UiIcon` with class `icon-decoration` (`DecorationIcon.vue:17`). `colorToString({type:"custom"})` returns the hex verbatim (`ui/color.ts:9`).
- **Month-view cells are all `NotesCalendarCell`** (decoratable): `header-month`/`header-quarter` (only when a quarter journal is in scope)/`header-year` and `week-number-cell` (`NotesMonthView.vue:90-123`). Decorations evaluate over `scope.all` (`NotesMonthView.vue:64-67`), so a shelf change re-scopes them live.
- **Shelf selector** is in the auto-seeded default view's toolbar (`src/views/default-view.ts:35`, `defaultShelf: null` ⇒ all journals initially). It renders `<button>` with text **"All journals"** (`ShelfSelectorItem.vue:19,32`; `messages/en.json:675` `common_label_all_journals` = `"All journals"`), opening an Obsidian `Menu` with items "All journals", then each shelf name (`ShelfSelectorItem.vue:21-28`).
- **Existing jsdom coverage (do not duplicate):** `CellDecoration.test.ts`, `derive-styles.test.ts` (per-style derivation), `engine-checks.test.ts` (every condition kind), `use-cell-decorations.test.ts` (reactive re-seed), `use-shelf-scope.test.ts`. e2e asserts **only** the real-cascade computed value + the real-click shelf menu.

---

## The decoration / note allocation (single shared fixture, all coexist)

Custom hex colors only (theme `var(--x)` would resolve non-deterministically). Each daily note's basename ends with its day number; day-of-month is unique within the visible month, so `title ends-with "-07"` pins exactly one day. Each style note carries one unique inline tag; each condition note matches exactly one condition kind.

| #   | Test                       | Journal   | Condition                 | Cell located by                  | Seed note (`<folder>/<file>`, body)        |
| --- | -------------------------- | --------- | ------------------------- | -------------------------------- | ------------------------------------------ |
| 1   | cond `title`               | daily     | `title` ends-with `-07`   | `cell("…-07")`                   | `day/…-07.md`, body empty                  |
| 2   | cond `tag`                 | daily     | `tag` contains `ctag`     | `cell("…-10")`                   | `day/…-10.md`, body `marker #ctag`         |
| 3   | cond `property`            | daily     | `property` `cprop` exists | `cell("…-13")`                   | `day/…-13.md`, fm `cprop: present`         |
| 4   | cond `has-note`            | quarterly | `has-note`                | `periodCell("header-quarter")`   | `quarter/seed-quarterly.md`                |
| 5   | cond `has-open-task`       | weekly    | `has-open-task`           | `periodCell("week-number-cell")` | `week/seed-weekly.md`, body `- [ ] open`   |
| 6   | cond `all-tasks-completed` | monthly   | `all-tasks-completed`     | `periodCell("header-month")`     | `month/seed-monthly.md`, body `- [x] done` |
| —   | control                    | —         | —                         | `cell("…-02")`                   | (none seeded)                              |
| 7   | style `background`         | yearly    | `has-note`                | `periodCell("header-year")`      | `year/seed-yearly.md`                      |
| 8   | style `color`              | daily     | `tag` contains `scolor`   | `cell("…-16")`                   | `day/…-16.md`, body `marker #scolor`       |
| 9   | style `border`             | daily     | `tag` contains `sborder`  | `cell("…-19")`                   | `day/…-19.md`, body `marker #sborder`      |
| 10  | style `shape`              | daily     | `tag` contains `sshape`   | `cell("…-22")`                   | `day/…-22.md`, body `marker #sshape`       |
| 11  | style `corner`             | daily     | `tag` contains `scorner`  | `cell("…-25")`                   | `day/…-25.md`, body `marker #scorner`      |
| 12  | style `icon`               | daily     | `tag` contains `sicon`    | `cell("…-28")`                   | `day/…-28.md`, body `marker #sicon`        |

Condition decos (#1–6) all carry the same **marker** style — a `corner` at `top-left`, custom `#ff0000` — so the assertion is element presence (`.decoration-corner.top-left`). The style decos (#7–12) carry exactly the one style under test. No two decorations ever match the same cell.

---

## File end-state

**Create:**

- `e2e/journeys/calendar.ts` — the root-bound `calendarSurface(root)` factory (cell/period-cell finders + `waitForActive`).
- `e2e/journeys/view.ts` — view-leaf specifics: month-view root constant, `openCalendarView()`, and the bound `calendar` surface. (Moved from `e2e/support/view.ts`.)
- `e2e/journeys/decorations.ts` — the decoration support: `seedDecorationFixture()`, day-anchor helpers, the style hex constants, and the contained-brittleness computed-style readers/assertions.

**Modify:**

- `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` — add a `decorations` array to each of the 5 journals (12 decorations total).
- `e2e/support/vault.ts` — add `seedNote(path, content)` (folder-aware `vault.create`).
- `e2e/journeys/view.e2e.ts` — repoint imports to `./view.js`, rewrite the 5 chunk-0 tests onto `calendar.*`, and add the chunk-1 `describe("calendar view decorations")` block.

**Delete:**

- `e2e/support/view.ts` — superseded by `e2e/journeys/{calendar,view}.ts`.

**Unchanged (already correct):** `wdio.conf.mts` (`journeys` glob `./e2e/journeys/**/*.e2e.ts` already covers the new files; `tsconfig.e2e` covers `e2e/**`); `e2e/support/{wait,vault}.ts` reused (`waitForState`, `createNote`).

---

## Task 1: Extract `calendarSurface(root)` and move the view driver into `e2e/journeys/`

Behavior-preserving refactor of chunk 0's `support/view.ts` into a root-bound factory colocated with the journey specs (matches the journeys-design layout; readies the second mount root for chunk 2). The chunk-0 suite is the regression net.

**Files:**

- Create: `e2e/journeys/calendar.ts`
- Create: `e2e/journeys/view.ts`
- Delete: `e2e/support/view.ts`
- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Write `e2e/journeys/calendar.ts`**

```ts
import { $ } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

export type CellLocator = ReturnType<typeof $>;
export type PeriodTestId = "header-month" | "header-quarter" | "header-year" | "week-number-cell";

export interface CalendarSurface {
  // A day number repeats across month spill, so day cells are pinned by the
  // data-anchor production hook and scoped to the day grid (a week anchor can
  // coincide with a day anchor; .notes-month-view__day disambiguates).
  cell(anchor: string): CellLocator;
  // Header (month/quarter/year) and week-number cells carry production data-testid
  // hooks; one of each renders (week-number-cell repeats per row → first row).
  periodCell(testId: PeriodTestId): CellLocator;
  // The cell flips data-active="true" off the live active-note-changed event — poll.
  waitForActive(anchor: string): Promise<void>;
}

// Binds the calendar mount root once so cell-finding isn't re-threaded through every
// call. The view-leaf and (chunk 2) code-block mounts each construct one against
// their own root and share every method.
export function calendarSurface(root: string): CalendarSurface {
  const cell = (anchor: string): CellLocator => $(`${root} .notes-month-view__day[data-anchor="${anchor}"]`);
  const periodCell = (testId: PeriodTestId): CellLocator => $(`${root} [data-testid="${testId}"]`);
  const waitForActive = (anchor: string): Promise<void> =>
    waitForState(
      async () => (await cell(anchor).getAttribute("data-active")) ?? undefined,
      (active) => active === "true",
      `waited for the ${anchor} day cell to become data-active`,
    );
  return { cell, periodCell, waitForActive };
}
```

- [ ] **Step 2: Write `e2e/journeys/view.ts`**

```ts
import { $ } from "@wdio/globals";

import { calendarSurface } from "./calendar.js";

const RIBBON_OPEN_CALENDAR = '[aria-label="Open Calendar"]';
// Re-clicking the ribbon leaves Obsidian's previous (deferred) calendar leaf in the
// DOM, hidden via inline `display: none`, so a bare `.notes-month-view` resolves to
// the stale copy. The live leaf is the one whose `.workspace-leaf` is not inline-
// hidden (independent of focus, which moves to the opened note).
const MONTH_VIEW = '.workspace-leaf:not([style*="display: none"]) .notes-month-view';

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

- [ ] **Step 3: Delete the old module**

```bash
git rm e2e/support/view.ts
```

- [ ] **Step 4: Repoint and rewrite the chunk-0 tests in `e2e/journeys/view.e2e.ts`**

Replace the import line:

```ts
import { dayCell, openCalendarView, periodCell, waitForActiveCell } from "../support/view.js";
```

with:

```ts
import { calendar, openCalendarView } from "./view.js";
```

Then update the five existing tests' calls: `dayCell(anchor)` → `calendar.cell(anchor)`, `periodCell(id)` → `calendar.periodCell(id)`, `waitForActiveCell(anchor)` → `calendar.waitForActive(anchor)`. The full rewritten chunk-0 body (the `midMonthAnchor` helper and `describe("calendar view journeys", …)` block) becomes:

```ts
// The grid defaults to the current local month; the 15th is always an in-month,
// actionable day cell, far from any month boundary, and won't be "today" on most
// runs. Node and Obsidian share the OS clock, so the computed year-month matches.
function midMonthAnchor(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
}

describe("calendar view journeys", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("creates, opens, and live-activates a day note when its calendar cell is clicked", async () => {
    const anchor = midMonthAnchor();
    const path = `day/${anchor}.md`;

    await openCalendarView();
    await calendar.cell(anchor).click();

    await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
    await calendar.waitForActive(anchor);
    expect(await activeNotePath()).toBe(path);
  });

  it("creates and opens a week note when the week-number cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("week-number-cell").click();

    const path = await waitForActiveNoteIn("week");
    await waitForFrontmatter(path, (fm) => fm.journal === "weekly", `waited for ${path} to attach journal=weekly`);
  });

  it("creates and opens a month note when the month header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-month").click();

    const path = await waitForActiveNoteIn("month");
    await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);
  });

  it("creates and opens a quarter note when the quarter header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-quarter").click();

    const path = await waitForActiveNoteIn("quarter");
    await waitForFrontmatter(
      path,
      (fm) => fm.journal === "quarterly",
      `waited for ${path} to attach journal=quarterly`,
    );
  });

  it("creates and opens a year note when the year header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-year").click();

    const path = await waitForActiveNoteIn("year");
    await waitForFrontmatter(path, (fm) => fm.journal === "yearly", `waited for ${path} to attach journal=yearly`);
  });
});
```

(The `../support/vault.js` import block at the top of the file is unchanged.)

- [ ] **Step 5: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `import/order` flags the new sibling import, run `npx eslint e2e --fix` and re-run.)

- [ ] **Step 6: Confirm the chunk-0 journeys still pass against real Obsidian**

Run: `npm run test:e2e -- --suite journeys`
Expected: builds, boots Obsidian, the 5 chunk-0 `it`s pass through the factory.

- [ ] **Step 7: Commit**

```bash
git add e2e/journeys/calendar.ts e2e/journeys/view.ts e2e/journeys/view.e2e.ts e2e/support/view.ts
git commit -m "test(e2e): extract calendarSurface factory and colocate view driver"
```

---

## Task 2: Seed the 12 decorations into the fixture `data.json`

Add a `decorations` array to each journal. Insert each array as the last property of its journal object (after `"numbering": { … }`), adding a comma after the `numbering` line.

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`

- [ ] **Step 1: Add `daily.decorations`** (3 condition decos + 5 style decos)

```json
      "decorations": [
        {
          "mode": "and",
          "conditions": [{ "type": "title", "condition": "ends-with", "value": "-07" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "ctag" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "property", "name": "cprop", "valueType": "text", "condition": "exists", "value": "" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "scolor" }],
          "styles": [{ "type": "color", "color": { "type": "custom", "color": "#112233" } }]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "sborder" }],
          "styles": [
            {
              "type": "border",
              "border": "uniform",
              "left": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#445566" } },
              "right": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#445566" } },
              "top": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#445566" } },
              "bottom": { "show": true, "width": 3, "style": "solid", "color": { "type": "custom", "color": "#445566" } }
            }
          ]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "sshape" }],
          "styles": [
            {
              "type": "shape",
              "size": 1,
              "shape": "circle",
              "color": { "type": "custom", "color": "#778899" },
              "placement_x": "center",
              "placement_y": "middle"
            }
          ]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "scorner" }],
          "styles": [{ "type": "corner", "placement": "bottom-right", "color": { "type": "custom", "color": "#99aabb" } }]
        },
        {
          "mode": "and",
          "conditions": [{ "type": "tag", "condition": "contains", "value": "sicon" }],
          "styles": [
            {
              "type": "icon",
              "icon": "star",
              "placement_x": "right",
              "placement_y": "top",
              "color": { "type": "custom", "color": "#aabbcc" },
              "size": 1
            }
          ]
        }
      ]
```

- [ ] **Step 2: Add `weekly.decorations`** (has-open-task → marker corner)

```json
      "decorations": [
        {
          "mode": "and",
          "conditions": [{ "type": "has-open-task" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        }
      ]
```

- [ ] **Step 3: Add `monthly.decorations`** (all-tasks-completed → marker corner)

```json
      "decorations": [
        {
          "mode": "and",
          "conditions": [{ "type": "all-tasks-completed" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        }
      ]
```

- [ ] **Step 4: Add `quarterly.decorations`** (has-note → marker corner)

```json
      "decorations": [
        {
          "mode": "and",
          "conditions": [{ "type": "has-note" }],
          "styles": [{ "type": "corner", "placement": "top-left", "color": { "type": "custom", "color": "#ff0000" } }]
        }
      ]
```

- [ ] **Step 5: Add `yearly.decorations`** (has-note → background style)

```json
      "decorations": [
        {
          "mode": "and",
          "conditions": [{ "type": "has-note" }],
          "styles": [{ "type": "background", "color": { "type": "custom", "color": "#203040" } }]
        }
      ]
```

- [ ] **Step 6: Sanity-check the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json','utf8')); console.log('ok')"`
Expected: prints `ok`. (A trailing-comma or missing-comma slip prints a `SyntaxError` with the offset.)

- [ ] **Step 7: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(e2e): seed slice B chunk 1 decoration matrix into e2e-journeys fixture"
```

---

## Task 3: Decoration support — `seedNote` + `e2e/journeys/decorations.ts`

`seedNote` is a folder-aware `vault.create` (a cross-slice vault primitive — the fixture has no note folders, and `vault.create` does not create missing parents). `decorations.ts` holds the journeys-specific seeding (the 12 notes), day-anchor helpers, the style hex constants (kept in lock-step with the fixture), and the contained-brittleness computed-style readers/assertions.

**Files:**

- Modify: `e2e/support/vault.ts`
- Create: `e2e/journeys/decorations.ts`

- [ ] **Step 1: Add `seedNote` to `e2e/support/vault.ts`** (append at end of file)

```ts
// Folder-aware create: the fixture carries no note folders and vault.create does not
// create missing parents. Used to seed precondition notes with crafted frontmatter/body.
export async function seedNote(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, body) => {
      const slash = notePath.lastIndexOf("/");
      if (slash > 0) {
        const dir = notePath.slice(0, slash);
        if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
      }
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}
```

- [ ] **Step 2: Write `e2e/journeys/decorations.ts`**

```ts
import { $ } from "@wdio/globals";

import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import type { CellLocator, PeriodTestId } from "./calendar.js";
import { calendar, openCalendarView } from "./view.js";

// Custom hex (never theme vars) so the computed rgb is deterministic across the
// version matrix. These MUST match the fixture data.json style colors.
export const STYLE_HEX = {
  background: "#203040",
  color: "#112233",
  border: "#445566",
  shape: "#778899",
  corner: "#99aabb",
  icon: "#aabbcc",
} as const;

// Day-of-month is unique within the visible month, so each test owns one day cell.
// 02 is the seeded-note-free control. All ≤ 28 (in-month, non-spill, exist every month).
export const DECO_DAY = {
  control: 2,
  title: 7,
  tag: 10,
  property: 13,
  color: 16,
  border: 19,
  shape: 22,
  corner: 25,
  icon: 28,
} as const;

export function dayAnchor(day: number): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function note(journal: string, anchor: string, body = "", extraFrontmatter: readonly string[] = []): string {
  const fm = [`journal: ${journal}`, `journal-date: ${anchor}`, ...extraFrontmatter];
  return `---\n${fm.join("\n")}\n---\n${body}\n`;
}

// Opens the view, reads each period cell's real anchor (= the journal-date to store),
// then hand-seeds the 12 precondition notes. The view re-evaluates decorations live
// off the resulting metadata/index events — no remount.
export async function seedDecorationFixture(): Promise<void> {
  await openCalendarView();
  const periodAnchor = async (testId: PeriodTestId): Promise<string> =>
    (await calendar.periodCell(testId).getAttribute("data-anchor")) ?? "";
  const week = await periodAnchor("week-number-cell");
  const month = await periodAnchor("header-month");
  const quarter = await periodAnchor("header-quarter");
  const year = await periodAnchor("header-year");

  await seedNote(`day/${dayAnchor(DECO_DAY.title)}.md`, note("daily", dayAnchor(DECO_DAY.title)));
  await seedNote(`day/${dayAnchor(DECO_DAY.tag)}.md`, note("daily", dayAnchor(DECO_DAY.tag), "marker #ctag"));
  await seedNote(
    `day/${dayAnchor(DECO_DAY.property)}.md`,
    note("daily", dayAnchor(DECO_DAY.property), "", ["cprop: present"]),
  );
  await seedNote(`day/${dayAnchor(DECO_DAY.color)}.md`, note("daily", dayAnchor(DECO_DAY.color), "marker #scolor"));
  await seedNote(`day/${dayAnchor(DECO_DAY.border)}.md`, note("daily", dayAnchor(DECO_DAY.border), "marker #sborder"));
  await seedNote(`day/${dayAnchor(DECO_DAY.shape)}.md`, note("daily", dayAnchor(DECO_DAY.shape), "marker #sshape"));
  await seedNote(`day/${dayAnchor(DECO_DAY.corner)}.md`, note("daily", dayAnchor(DECO_DAY.corner), "marker #scorner"));
  await seedNote(`day/${dayAnchor(DECO_DAY.icon)}.md`, note("daily", dayAnchor(DECO_DAY.icon), "marker #sicon"));

  await seedNote("week/seed-weekly.md", note("weekly", week, "- [ ] open"));
  await seedNote("month/seed-monthly.md", note("monthly", month, "- [x] done"));
  await seedNote("quarter/seed-quarterly.md", note("quarterly", quarter));
  await seedNote("year/seed-yearly.md", note("yearly", year));
}

// --- contained-brittleness computed-style readers (rgb normalization in one place) ---

function decorationOf(cell: CellLocator): CellLocator {
  return cell.$('[data-testid="cell-decoration"]');
}

async function hexProp(el: CellLocator, property: string): Promise<string | undefined> {
  const parsed = (await el.getCSSProperty(property)).parsed as { hex?: string };
  return parsed.hex;
}

export function decorationBackgroundHex(cell: CellLocator): Promise<string | undefined> {
  return hexProp(decorationOf(cell), "background-color");
}

export function decorationTextHex(cell: CellLocator): Promise<string | undefined> {
  return hexProp(decorationOf(cell), "color");
}

async function borderTop(cell: CellLocator): Promise<{ width: string; hex: string | undefined }> {
  const border = cell.$(".cell-decoration__border");
  return {
    width: (await border.getCSSProperty("border-top-width")).value as string,
    hex: await hexProp(border, "border-top-color"),
  };
}

// The decoration applies only once the seeded note is indexed, so these poll (the
// .cell-decoration element exists from mount, but background/color stay "inherit"
// until the deco matches).
export function expectBackgroundHex(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationBackgroundHex(cell),
    (v) => v === hex,
    `waited for cell background ${hex}`,
  );
}

export function expectTextHex(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationTextHex(cell),
    (v) => v === hex,
    `waited for cell text color ${hex}`,
  );
}

export function expectBorderTop(cell: CellLocator, width: string, hex: string): Promise<void> {
  return waitForState(
    () => borderTop(cell),
    (b) => b.width === width && b.hex === hex,
    `waited for cell border-top ${width} ${hex}`,
  );
}

export function waitForBackgroundCleared(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationBackgroundHex(cell),
    (v) => v !== hex,
    `waited for cell background to clear from ${hex}`,
  );
}
```

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `getCSSProperty(...).parsed` typing rejects the `{ hex?: string }` cast, it is already cast — no `@ts-expect-error`; the cast is the sanctioned narrowing for wdio's broad `ParsedCSSValue`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/support/vault.ts e2e/journeys/decorations.ts
git commit -m "test(e2e): add decoration seeding and computed-style readers for slice B"
```

---

## Task 4: Condition decoration specs (6 + control)

Add the decorations `describe` to `view.e2e.ts` with its own boot + seed, then the condition tests. Each asserts the marker corner is present on the matched cell (positive, one behavior each); one control test asserts a seeded-note-free cell stays bare.

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Extend the import block**

First, widen the existing top-of-file `@wdio/globals` import to add `$` (Task 6's shelf menu uses it):

```ts
import { $, browser, expect } from "@wdio/globals";
```

Then add the decorations import below the import block:

```ts
import {
  DECO_DAY,
  STYLE_HEX,
  dayAnchor,
  expectBackgroundHex,
  expectBorderTop,
  expectTextHex,
  seedDecorationFixture,
  waitForBackgroundCleared,
} from "./decorations.js";
```

(The `./view.js` import from Task 1 already provides `calendar`/`openCalendarView`. `expectBackgroundHex`/`expectBorderTop` are imported now though first used in Task 5/6 — that is fine, the import lands with this edit.)

- [ ] **Step 2: Append the decorations `describe` (condition block) after the chunk-0 `describe`**

```ts
describe("calendar view decorations", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    await seedDecorationFixture();
  });

  describe("condition decorations", () => {
    it("decorates a day cell whose note title matches the title condition", async () => {
      await calendar.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "title-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note carries the matching tag", async () => {
      await calendar.cell(dayAnchor(DECO_DAY.tag)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "tag-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note has the matching frontmatter property", async () => {
      await calendar.cell(dayAnchor(DECO_DAY.property)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "property-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates the quarter header when the quarter journal has a note", async () => {
      await calendar.periodCell("header-quarter").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-note decoration did not render on the quarter header",
      });
    });

    it("decorates the week cell when its note has an open task", async () => {
      await calendar.periodCell("week-number-cell").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-open-task decoration did not render on the week cell",
      });
    });

    it("decorates the month header when its note's tasks are all completed", async () => {
      await calendar.periodCell("header-month").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "all-tasks-completed decoration did not render on the month header",
      });
    });

    it("leaves a cell with no matching note undecorated", async () => {
      // First prove the engine has run (a matched cell is decorated), then assert the
      // control cell — with no seeded note — carries no decoration.
      await calendar.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist();
      await expect(calendar.cell(dayAnchor(DECO_DAY.control)).$(".decoration-corner")).not.toExist();
    });
  });
});
```

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 4: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: the 5 chunk-0 `it`s + the 7 condition `it`s pass. (A red here means a condition didn't match in real Obsidian — check the seeded note's body/frontmatter against the Background facts, or that the cell's `data-anchor` matched the seeded `journal-date`. A screenshot lands in `e2e/.reports/screenshots/`.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): assert view-leaf condition decorations render in real Obsidian"
```

---

## Task 5: Style decoration specs (6)

Add a nested `describe("style decorations")` inside the decorations block (after the condition block, before the closing brace). Computed-color styles (background/color/border) assert the post-cascade rgb; element styles (shape/corner/icon) assert presence (shape also asserts its v-bind color).

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Add the `style decorations` describe** (inside `describe("calendar view decorations", …)`, after `describe("condition decorations", …)`)

```ts
describe("style decorations", () => {
  it("renders the background color through Obsidian's real CSS cascade", async () => {
    await expectBackgroundHex(calendar.periodCell("header-year"), STYLE_HEX.background);
  });

  it("renders the text color through Obsidian's real CSS cascade", async () => {
    await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
  });

  it("renders the border through Obsidian's real CSS cascade", async () => {
    await expectBorderTop(calendar.cell(dayAnchor(DECO_DAY.border)), "3px", STYLE_HEX.border);
  });

  it("renders a shape decoration element", async () => {
    const shape = calendar.cell(dayAnchor(DECO_DAY.shape)).$(".shape-decoration.shape-circle");
    await shape.waitForExist({ timeoutMsg: "shape decoration did not render" });
    await waitForBackgroundCleared(calendar.cell(dayAnchor(DECO_DAY.control)), STYLE_HEX.shape);
  });

  it("renders a corner decoration element at the configured placement", async () => {
    await calendar.cell(dayAnchor(DECO_DAY.corner)).$(".decoration-corner.bottom-right").waitForExist({
      timeoutMsg: "corner-style decoration did not render at bottom-right",
    });
  });

  it("renders an icon decoration element", async () => {
    await calendar.cell(dayAnchor(DECO_DAY.icon)).$(".icon-decoration").waitForExist({
      timeoutMsg: "icon decoration did not render",
    });
  });
});
```

> Note on the shape test: the second line just confirms the shape's own custom color isn't being inherited by an unrelated control cell — a cheap guard that the `v-bind` color is scoped. If `waitForBackgroundCleared` proves brittle on the control cell, drop that line; the `.shape-decoration.shape-circle` existence is the load-bearing assertion.

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: chunk-0 (5) + condition (7) + style (6) `it`s pass. (A red on a computed-hex test means the cascade/`v-bind` didn't resolve to the fixture hex — verify the hex in `STYLE_HEX` equals the fixture's, and that the seeded tag matches the style deco's condition.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): assert view-leaf style decorations survive Obsidian's real cascade"
```

---

## Task 6: Interactive shelf-scope spec (1)

The decoration engine re-evaluates over the selected shelf's scope. Picking a shelf that excludes the yearly journal must drop the year-header decoration while keeping an in-scope daily decoration. Driven through the real toolbar button + Obsidian `Menu` (the click path is the point). This is the **last** test in the block (it leaves the shelf set to `core`).

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Add the `interactive shelf scope` describe** (inside `describe("calendar view decorations", …)`, after `describe("style decorations", …)`)

```ts
describe("interactive shelf scope", () => {
  it("re-scopes decorations when a shelf is picked from the toolbar menu", async () => {
    // Precondition: with the default (null) shelf, both the out-of-scope (yearly,
    // shelf "extra") and the in-scope (daily, shelf "core") decorations render.
    await expectBackgroundHex(calendar.periodCell("header-year"), STYLE_HEX.background);
    await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);

    // Real click path: open the shelf selector and pick "core" (daily, weekly).
    await $("button*=All journals").click();
    const menu = $(".menu");
    await menu.waitForExist({ timeoutMsg: "shelf selector menu did not open" });
    await menu.$(".menu-item-title=core").click();

    // The yearly decoration (out of "core") clears; the daily decoration stays.
    await waitForBackgroundCleared(calendar.periodCell("header-year"), STYLE_HEX.background);
    await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: all 19 `it`s pass (5 + 7 + 6 + 1). (If the menu item click doesn't register, try clicking the `.menu-item` ancestor instead of `.menu-item-title`: `await menu.$(".menu-item*=core").click()`. If "All journals" isn't found, confirm the button text via `messages/en.json:675`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): assert shelf selection re-scopes view-leaf decorations"
```

---

## Task 7: Reconcile the docs + full verification sweep

Correct the journeys-design's isolation claim (it asserted distinct journals isolate same-kind style decos — they don't) and record the realized helper layout; then run every gate.

**Files:**

- Modify: `docs/e2e-slice-b-journeys.md`
- Modify: `docs/e2e-slice-b-build-order.md`

- [ ] **Step 1: Correct the isolation claim in `docs/e2e-slice-b-journeys.md`**

Under `### \`e2e-journeys\` (new) — deliberately rich, not minimal`, replace the two decoration bullets:

```markdown
- 6 _condition_ decorations (`title`, `tag`, `property`, `has-note`,
  `has-open-task`, `all-tasks-completed`), each with a constant **icon** style.
- 6 _style_ decorations (`background`, `color`, `border`, `shape`, `corner`,
  `icon`) on a constant simple condition (`has-note`), each targeting a
  distinct journal/cell so they don't stack.
```

with:

```markdown
- 6 _condition_ decorations (`title`, `tag`, `property`, `has-note`,
  `has-open-task`, `all-tasks-completed`), each carrying a constant **corner**
  marker style so the assertion is element presence.
- 6 _style_ decorations (`background`, `color`, `border`, `shape`, `corner`,
  `icon`). Decorations are **per-journal scoped** and same-kind journals share a
  grid cell, so isolation is by **crafted condition per cell**, not distinct
  journal: each decoration is wired to a journal + condition that exactly one
  seeded note matches (style decos use a unique inline tag per day cell; the
  `background` style rides the yearly `has-note` on the year header). Any empty
  day cell is the universal control.
```

- [ ] **Step 2: Record the realized helper layout in `docs/e2e-slice-b-build-order.md`**

Under `### Chunk 1 — View-leaf decorations`, replace the `**Support:**` bullet:

```markdown
- **Support:** `support/decorations.ts` (computed-style helper + condition
  seeding); extend `support/vault.ts` (tags/tasks/properties/title).
```

with:

```markdown
- **Support:** the calendar/view/decoration helpers are colocated under
  `e2e/journeys/` (not `support/`) per the journeys-design layout: `calendar.ts`
  (the `calendarSurface(root)` factory), `view.ts` (moved from `support/`;
  `openCalendarView` + the bound `calendar`), and `decorations.ts` (seeding +
  computed-style readers). The only `support/` change is a folder-aware
  `seedNote`. The factory is built in chunk 1 (ahead of chunk 2's second mount
  root) rather than deferred.
```

- [ ] **Step 3: Full static + unit gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all exit 0. (`npm test` is unchanged by this chunk — no production edit — but confirms nothing regressed.)

- [ ] **Step 4: Full e2e suite (no regression in A/C/D + green journeys)**

Run: `npm run test:e2e`
Expected: builds, boots Obsidian, all suites pass — `smoke`, `integration`, `migration`, `interop`, and `journeys` (19 `it`s). 0 failures.

- [ ] **Step 5: Confirm the chunk-1 surface shape**

Run: `ls e2e/journeys && echo '---' && ls e2e/support`
Expected: `journeys/` contains `calendar.ts decorations.ts view.ts view.e2e.ts`; `support/` contains `commands.ts editor.ts errors.ts plugin-data.ts vault.ts wait.ts` (no `view.ts`).

- [ ] **Step 6: Commit**

```bash
git add docs/e2e-slice-b-journeys.md docs/e2e-slice-b-build-order.md
git commit -m "docs(e2e): correct slice B decoration isolation model and record chunk 1 layout"
```

---

## Self-review notes

- **Spec coverage (build-order chunk 1):** "12 decorations (6 condition, 6 style) + notes matching each condition" → Task 2 (fixture) + Task 3 (`seedDecorationFixture`); "`support/decorations.ts` computed-style helper + condition seeding" → Task 3 (`decorations.ts`, realized under `e2e/journeys/`); "extend `support/vault.ts`" → Task 3 (`seedNote`); "`view.e2e.ts` part 2 — 6 condition + 6 style + interactive shelf-scope" → Tasks 4/5/6; "proves plugin `styles.css` surviving Obsidian's real cascade" → Task 5's computed-hex assertions. ✓
- **Factory-now decision:** `calendarSurface(root)` built in Task 1 with `view.ts` moved into `e2e/journeys/`; chunk-0 spec repointed and re-verified green (the refactor's net). ✓
- **Isolation correctness:** every cell in the allocation table matches exactly one decoration — daily condition/style decos isolated by distinct day-anchor + distinct condition value; `has-note`/task conditions placed on single-cell period journals; `title ends-with -07` pins one day (unique day-of-month). Controls are seeded-note-free day cells. ✓
- **Type/name consistency:** `calendar`/`openCalendarView` (Task 1) imported in Tasks 4–6; `CellLocator`/`PeriodTestId` exported from `calendar.ts` (Task 1) consumed in `decorations.ts` (Task 3); `seedNote` (Task 3, `vault.ts`) consumed in `decorations.ts`; `DECO_DAY`/`STYLE_HEX`/`dayAnchor`/`expect*`/`seedDecorationFixture`/`waitForBackgroundCleared` (Task 3) match the imports in Tasks 4–6; `STYLE_HEX` literals equal the fixture hexes in Task 2 (`#203040/#112233/#445566/#778899/#99aabb/#aabbcc`). ✓
- **No placeholders:** every fixture object, helper body, and spec is fully written; commands have expected output and named failure-triage. ✓
- **Out of scope (intentional, deferred to later chunks):** code-block mount decorations (chunk 2), settings SPA (chunk 3), commands/bulk-add (chunk 4), CI split (chunk 5); pure-date decoration conditions (`date`/`weekday`/`offset`) stay unit-tested (they'd pass against the mock). ✓

```

```
