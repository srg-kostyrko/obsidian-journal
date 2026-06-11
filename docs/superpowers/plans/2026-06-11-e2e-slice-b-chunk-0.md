# E2E Slice B — Chunk 0 (Infra + Canonical Journey) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the first slice-B e2e spec — a real-Obsidian calendar-view journey — green: open the view from the ribbon, click a day cell, assert the day note is created, opened, and its cell flips live-active; plus the four non-day period types created from their cells.

**Architecture:** One production hook (`data-anchor` on `NotesCalendarCell`, mirroring `CalendarMonthView`) so a specific day cell can be located; a minimal `e2e-journeys` fixture (5 journals, one per period kind, each foldered; 2 disjoint shelves) relying on the auto-seeded default calendar view; a thin `support/view.ts` driver (plain functions over `waitForState`, no page-object class); and a `journeys` spec exercising the view-leaf mount + real ribbon click path. The four non-day periods are reached through the month view's own cells — header cells (`header-month`/`header-quarter`/`header-year`) and the week-number cell — **not** the `PeriodButtonsItem` toolbar (which in v3 is a direct create-shortcut, never a grid-level switch). Two design docs are corrected to match this reality.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers); Vue 3 SFC; Vitest + `@testing-library/vue` for the unit gate. Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**` via `tsconfig.e2e.json`), `npm run check:lint` (`eslint .`), `npm test` (vitest), `npm run test:e2e` (builds plugin + boots real Obsidian; `--suite journeys` targets this chunk).

**Verification model:** The `data-anchor` production change is real plugin behavior → it gets a colocated unit test (TDD). The fixture and `support/view.ts` are test infrastructure → no tests of their own (per repo convention); the `journeys` spec _is_ their regression net. The spec asserts behavior that already exists in the plugin, so writing it and watching it pass against real Obsidian is the verification — a red spec here is a real finding (or a fixture/selector bug), not a missing feature.

**What this chunk deliberately defers** (per the build-order's "grow the fixture per chunk" principle): decorations, commands, a custom view, and `navBlock.type` variants. Nothing in chunk 0 renders a nav block or reads a decoration/command, so seeding them now would be noise. `navBlock` variants move to chunk 2 (first nav-block render); decorations to chunk 1.

---

## File end-state

**Create:**

- `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` — the chunk-0 fixture (5 journals + 2 shelves; views auto-seed).
- `e2e/support/view.ts` — the calendar-view e2e driver (ribbon open, locate cells, poll `data-active`).
- `e2e/journeys/view.e2e.ts` — the chunk-0 journeys spec.

**Modify:**

- `src/notes-calendar/ui/NotesCalendarCell.vue` — add `:data-anchor`.
- `src/notes-calendar/ui/NotesCalendarCell.test.ts` — add the `data-anchor` assertion.
- `docs/e2e-slice-b-journeys.md` — correct the "other period types" mechanism.
- `docs/e2e-slice-b-build-order.md` — correct chunk 0's fixture + period mechanism.

**Unchanged (already correct):**

- `wdio.conf.mts` — the `journeys` suite glob (`./e2e/journeys/**/*.e2e.ts`) and `tsconfig.e2e` coverage of `e2e/**` already pick up the new files. CI split is chunk 5.
- `e2e/support/{wait,vault}.ts` — reused as-is (`waitForState`, `waitForJournalFrontmatter`, `waitForFrontmatter`, `waitForActiveNoteIn`, `activeNotePath`).

---

## Background facts (verified against the live v3 source — do not re-derive)

- **Cell → note flow:** `NotesCalendarCell` `@click="cell.open(rawPeriod, $event)"` → `useNotesCell.open` → `OpenDateFlow { anchor, journalNames, openMode }` → (single journal in scope ⇒ no suggester) → `OpenJournalEntryFlow` → `NoteCreationService.ensureNote` (writes frontmatter `journal` + the journal's `dateField`) → `workspace.openNote(path, "active")`. (`src/notes-calendar/use-notes-cell.ts:52`, `src/journals/.../open-date.flow.ts`, `open-journal-entry.flow.ts`.)
- **The month view exposes every period kind as a cell** (`src/notes-calendar/ui/NotesMonthView.vue`): header cells `data-testid="header-month"` / `"header-quarter"` (only when a quarter journal is in scope) / `"header-year"`; `data-testid="week-number-cell"` for the week (weeks column is `"left"` in the default view); and `.notes-month-view__day` day cells. There is **no** grid-level period switch in v3.
- **Ribbon:** the auto-seeded default view (`src/views/default-view.ts`, id `b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c`) has `showInRibbon: true`, name = `m.common_label_calendar()` = `"Calendar"`. The ribbon command is `Open ${view.name}` = `"Open Calendar"` (`src/views/view-host.ts:98`), registered via `addRibbonItemButton(actionId, icon, name, …)` (`src/infrastructure/host/commands/internal/command-service.ts:62`) — so the ribbon element's accessible name / `aria-label` is **"Open Calendar"**.
- **Live active state:** `ActiveEntryViewModel` (`src/notes-calendar/active-entry.ts`) subscribes to `active-note-changed`, resolves the path via `JournalsIndex.entryByPath`, and the cell's `isActive` compares `{journalName, anchor}`. So a cell flips `data-active="true"` the moment its note becomes the active file — no remount.
- **Settings schema:** root `{ version: 4, journals, shelves, … }`. A journal needs only `name, write, timeline, dateFormat, frontmatter, numbering` (everything else is optional with defaults — `folder` defaults to `""`, so we set it). Shelf = `{ name, journals: string[] }` keyed by journal name (`src/shelves/config.ts`). `views` absent ⇒ auto-seeded default calendar view (`src/views/config.ts` `seed`).

---

## Task 1: `data-anchor` production hook on `NotesCalendarCell` (TDD)

A day number repeats across month-spill, so role/text cannot pin a specific day cell. Emit the period's `anchor` (the attribute is named `data-anchor`, and `CalendarWeekView.vue:38` — the sibling that renders week cells — already uses `.anchor`). For day/month/quarter/year `start === anchor`; only week differs (`anchor` = the ISO-week day, `start` = locale-first-day). `NotesCalendarCell` is polymorphic across all kinds, so `.anchor` is the uniform, future-consistent rule; chunk 0 only locates day cells, where the two coincide.

**Files:**

- Modify: `src/notes-calendar/ui/NotesCalendarCell.test.ts`
- Modify: `src/notes-calendar/ui/NotesCalendarCell.vue`

- [ ] **Step 1: Add the failing unit test**

In `src/notes-calendar/ui/NotesCalendarCell.test.ts`, inside the existing `describe("data attributes", …)` block (after the `omits data-active` test, around line 80), add:

```ts
it("renders data-anchor with the period's anchor", () => {
  const { container } = mount({ period: may25, cell: stubApi() });
  const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
  expect(cell?.dataset.anchor).toBe("2026-05-25");
});
```

(`may25 = DayPeriod.containing(date("2026-05-25"))` is already defined at the top of the file; for a day period `.anchor.toAnchor()` is `"2026-05-25"`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: FAIL on the new test — `cell?.dataset.anchor` is `undefined`, not `"2026-05-25"`. The other tests still pass.

- [ ] **Step 3: Add the attribute**

In `src/notes-calendar/ui/NotesCalendarCell.vue`, add `:data-anchor` to the root `<span>` (between `:data-inactive` and `:data-today`):

```vue
  <span
    class="notes-calendar-cell"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-anchor="rawPeriod.anchor.toAnchor()"
    :data-today="isToday || null"
    @click="cell.open(rawPeriod, $event)"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="cell.openPreview(rawPeriod, $event)"
  >
```

(In the template `rawPeriod` is the auto-unwrapped ref — no `.value`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/ui/NotesCalendarCell.vue src/notes-calendar/ui/NotesCalendarCell.test.ts
git commit -m "feat(notes-calendar): emit data-anchor on calendar cells for e2e"
```

---

## Task 2: The `e2e-journeys` fixture

Minimal chunk-0 seed: one journal per period kind, each writing to its own folder (so note paths never collide and day paths are predictable), plus two disjoint shelves. No `views` key — the default calendar view (ribbon + month grid + week column) is auto-seeded.

**Files:**

- Create: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`

- [ ] **Step 1: Write the fixture `data.json`**

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
    },
    "monthly": {
      "name": "monthly",
      "write": { "type": "month" },
      "folder": "month",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-MM",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] }
    },
    "quarterly": {
      "name": "quarterly",
      "write": { "type": "quarter" },
      "folder": "quarter",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY-[Q]Q",
      "frontmatter": {
        "dateField": "journal-date",
        "startDateField": "journal-start-date",
        "endDateField": "journal-end-date",
        "addStartDate": false,
        "addEndDate": false
      },
      "numbering": { "enabled": false, "anchorDate": "", "allowBefore": false, "sources": [] }
    },
    "yearly": {
      "name": "yearly",
      "write": { "type": "year" },
      "folder": "year",
      "timeline": { "start": "", "end": { "kind": "never" } },
      "dateFormat": "YYYY",
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
  "shelves": {
    "core": { "name": "core", "journals": ["daily", "weekly"] },
    "extra": { "name": "extra", "journals": ["monthly", "quarterly", "yearly"] }
  }
}
```

- [ ] **Step 2: Sanity-check the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(e2e): add e2e-journeys fixture for slice B chunk 0"
```

---

## Task 3: `support/view.ts` calendar-view driver

Plain functions (no page-object class — matches the codebase's functional style and the support-layer convention). Cell finders return lazy wdio locators; `data-active` polls through the shared `waitForState` primitive.

**Files:**

- Create: `e2e/support/view.ts`

- [ ] **Step 1: Write `e2e/support/view.ts`**

```ts
import { $ } from "@wdio/globals";

import { waitForState } from "./wait.js";

const RIBBON_OPEN_CALENDAR = '[aria-label="Open Calendar"]';
const MONTH_VIEW = ".notes-month-view";

// The auto-seeded default view registers a left-ribbon button whose accessible
// name is its command name ("Open Calendar"). Clicking it is the real click path
// (slice-B seam b) into the view-leaf mount — not executeCommandById.
export async function openCalendarView(): Promise<void> {
  await $(RIBBON_OPEN_CALENDAR).click();
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the Open Calendar ribbon click",
  });
}

// Day cells carry no stable data-testid (a day number repeats across month spill),
// so they are pinned by the data-anchor production hook.
export function dayCell(anchor: string): ReturnType<typeof $> {
  return $(`${MONTH_VIEW} .notes-month-view__day[data-anchor="${anchor}"]`);
}

// Header (month/quarter/year) and week-number cells already carry production
// data-testid hooks; exactly one of each renders in a month.
export function periodCell(
  testId: "header-month" | "header-quarter" | "header-year" | "week-number-cell",
): ReturnType<typeof $> {
  return $(`${MONTH_VIEW} [data-testid="${testId}"]`);
}

// The cell flips data-active="true" off the live active-note-changed event the
// moment its note becomes active — poll the attribute, never sleep.
export function waitForActiveCell(anchor: string): Promise<void> {
  return waitForState(
    async () => (await dayCell(anchor).getAttribute("data-active")) ?? undefined,
    (active) => active === "true",
    `waited for the ${anchor} day cell to become data-active`,
  );
}
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`getAttribute` returns `string | null`; `?? undefined` adapts `null` to the `waitForState` "keep polling" sentinel.)

- [ ] **Step 3: Commit**

```bash
git add e2e/support/view.ts
git commit -m "test(e2e): add calendar-view support driver for slice B"
```

---

## Task 4: `view.e2e.ts` — canonical journey + period types, and verify green

The canonical day journey is the one sanctioned multi-step journey (create → open → live-active). The four non-day period types are one-behavior-each tests, clicking the month view's own header/week cells. Notes land in disjoint folders and `ensureNote` is idempotent, so the tests need no `resetVault` between them (a spec-file retry re-clicks the same cell and re-opens the existing note — every assertion still holds).

**Files:**

- Create: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Write `e2e/journeys/view.e2e.ts`**

```ts
import { browser, expect } from "@wdio/globals";

import { dayCell, openCalendarView, periodCell, waitForActiveCell } from "../support/view.js";
import {
  activeNotePath,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

// Slice B chunk 0 — the view-leaf render + real ribbon-click seam. Our Vue calendar
// mounts in a real Obsidian leaf, a real ribbon click opens it, and a real cell
// click drives OpenDateFlow -> note create+open. None of this is reachable through
// __mocks__/obsidian.ts, which renders no leaf and has no ribbon.

// The grid defaults to the current local month; the 15th is always an in-month,
// actionable day cell, far from any month boundary, and (unlike "today") keeps
// data-active distinct from data-today. Node and Obsidian share the OS clock, so
// the computed year-month matches the rendered grid.
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
    await dayCell(anchor).click();

    await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
    await waitForActiveCell(anchor);
    expect(await activeNotePath()).toBe(path);
  });

  it("creates and opens a week note when the week-number cell is clicked", async () => {
    await openCalendarView();
    await periodCell("week-number-cell").click();

    const path = await waitForActiveNoteIn("week");
    await waitForFrontmatter(path, (fm) => fm.journal === "weekly", `waited for ${path} to attach journal=weekly`);
  });

  it("creates and opens a month note when the month header cell is clicked", async () => {
    await openCalendarView();
    await periodCell("header-month").click();

    const path = await waitForActiveNoteIn("month");
    await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);
  });

  it("creates and opens a quarter note when the quarter header cell is clicked", async () => {
    await openCalendarView();
    await periodCell("header-quarter").click();

    const path = await waitForActiveNoteIn("quarter");
    await waitForFrontmatter(
      path,
      (fm) => fm.journal === "quarterly",
      `waited for ${path} to attach journal=quarterly`,
    );
  });

  it("creates and opens a year note when the year header cell is clicked", async () => {
    await openCalendarView();
    await periodCell("header-year").click();

    const path = await waitForActiveNoteIn("year");
    await waitForFrontmatter(path, (fm) => fm.journal === "yearly", `waited for ${path} to attach journal=yearly`);
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite against real Obsidian**

Run: `npm run test:e2e -- --suite journeys`
Expected: builds the plugin (including the `data-anchor` change), boots Obsidian, all 5 `it`s pass.

If a click times out, debug in this order before touching timeouts (these are the only non-obvious failure modes):

- **Ribbon name** — if `Open Calendar` isn't found, confirm the auto-seeded view's `showInRibbon` and that `m.common_label_calendar()` is still `"Calendar"` (`messages/en.json`). The ribbon `aria-label` is `"Open " + name`.
- **`header-quarter` missing** — it renders only when a quarter journal is in scope; the fixture's `quarterly` (shelf-null view ⇒ all journals in scope) covers it. If absent, check the journal seeded.
- **Day path** — `day/<anchor>.md` assumes journal `folder: "day"` + `nameTemplate` default `{{date}}` + `dateFormat: "YYYY-MM-DD"`. A blank screenshot lands in `e2e/.reports/screenshots/` via the `afterTest` hook.

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): add slice B chunk 0 calendar-view journey spec"
```

---

## Task 5: Correct the design docs

Both docs describe the non-day periods as reached by "period-buttons switching the grid" — a mechanism v3 does not have. Correct them to the real cell-based mechanism so the next chunks aren't planned on the same false premise.

**Files:**

- Modify: `docs/e2e-slice-b-journeys.md`
- Modify: `docs/e2e-slice-b-build-order.md`

- [ ] **Step 1: Fix the journeys-doc "other period types" bullet**

In `docs/e2e-slice-b-journeys.md`, under `### view.e2e.ts`, replace:

```markdown
- **Other period types** (4): switch level via the toolbar period-buttons →
  grid renders that period → click cell → correct-type note created.
```

with:

```markdown
- **Other period types** (4): the month view surfaces each non-day period as its
  own cell — month/quarter/year as header cells (`data-testid` `header-month` /
  `header-quarter` / `header-year`, the last gated on a quarter journal in scope)
  and week as the week-number cell (`data-testid="week-number-cell"`). Click each
  → correct-type note created. (v3 has no grid-level switch; `PeriodButtonsItem`
  is a direct create-shortcut, not a grid mode — the header/week cells already
  carry production `data-testid` hooks, so only the day cell needs `data-anchor`.)
```

- [ ] **Step 2: Fix the build-order chunk-0 fixture bullet**

In `docs/e2e-slice-b-build-order.md`, under `### Chunk 0`, replace:

```markdown
- **Fixture `e2e-journeys` (core):** one journal per period kind
  (day/week/month/quarter/year), the two `navBlock.type` variants, ≥2 shelves
  with disjoint journals. No decorations/commands/custom-view yet.
```

with:

```markdown
- **Fixture `e2e-journeys` (core):** one journal per period kind
  (day/week/month/quarter/year), each in its own folder; ≥2 shelves with
  disjoint journals. The default calendar view auto-seeds (no `views` key). No
  decorations/commands/custom-view, and no `navBlock` variants yet — nothing
  renders a nav block until chunk 2, so the two `navBlock.type` variants move
  there.
```

- [ ] **Step 3: Fix the build-order chunk-0 spec bullet**

In `docs/e2e-slice-b-build-order.md`, under `### Chunk 0`, replace:

```markdown
- **Specs:** `view.e2e.ts` part 1 — canonical day journey + 4 other period types.
```

with:

```markdown
- **Specs:** `view.e2e.ts` part 1 — canonical day journey (cell → create + open +
  live-active) + the 4 non-day period types via the month view's header and
  week-number cells.
```

- [ ] **Step 4: Move the `navBlock` variants forward to chunk 2**

In `docs/e2e-slice-b-build-order.md`, under `### Chunk 2 — Code-block mount context`, in the `**Fixture +:**` bullet, append after the existing note list:

```markdown
Also adds the two `navBlock.type` variants (one `existing`, one create) on the
nav-bearing journals — the first chunk that renders a nav block.
```

- [ ] **Step 5: Commit**

```bash
git add docs/e2e-slice-b-journeys.md docs/e2e-slice-b-build-order.md
git commit -m "docs(e2e): correct slice B non-day period mechanism to month-view cells"
```

---

## Task 6: Full verification sweep

**Files:** none.

- [ ] **Step 1: Unit + static gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all exit 0 (the new `data-anchor` unit test passes within the full vitest run).

- [ ] **Step 2: Full e2e suite (no regression in A/C/D)**

Run: `npm run test:e2e`
Expected: builds, boots Obsidian, all suites pass — `smoke`, `integration`, `migration`, `interop`, and the new `journeys`. 0 failures.

- [ ] **Step 3: Confirm the chunk-0 surface shape**

Run: `ls e2e/journeys e2e/support && ls e2e/fixtures/e2e-journeys/.obsidian/plugins/journals`
Expected: `journeys/` contains `view.e2e.ts`; `support/` contains `view.ts` (alongside `wait.ts vault.ts plugin-data.ts editor.ts commands.ts errors.ts`); the fixture contains `data.json`.

---

## Self-review notes

- **Spec coverage (build-order chunk 0):** `data-anchor` production change → Task 1; `e2e-journeys` fixture core → Task 2; `support/view.ts` (ribbon open / cell-by-anchor / read `data-active`) → Task 3; `view.e2e.ts` part 1 (canonical day journey + 4 period types) → Task 4; "Proves view-leaf mount + real ribbon click path" → Task 4's assertions (`openCalendarView` is a ribbon click; `waitForActiveCell` proves the live mount). ✓
- **Deliberate deviations from the docs (now reconciled in Task 5):** non-day periods use month-view cells, not period-buttons; `navBlock` variants deferred from chunk 0 to chunk 2; shelves seeded but unused until chunk 1 (kept — cheap structural seed the build-order lists in core). ✓
- **Type/name consistency:** `dayCell`/`periodCell`/`waitForActiveCell`/`openCalendarView` defined in Task 3 are exactly the names imported in Task 4. `waitForJournalFrontmatter`, `waitForFrontmatter`, `waitForActiveNoteIn`, `activeNotePath` already exist in `e2e/support/vault.ts` with the signatures used. The `data-anchor` expression (`rawPeriod.anchor.toAnchor()`) and the unit assertion (`"2026-05-25"`) agree. ✓
- **No new wiring touched:** `wdio.conf.mts` `journeys` suite glob and `tsconfig.e2e` already cover the new paths; no config edit needed (verified). ✓
- **Out of scope (intentional):** decorations, code-block mount, settings SPA, commands, bulk-add, CI split — chunks 1–5. ✓

```

```
