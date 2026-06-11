# E2E Slice B — Chunk 2 (Code-block mount context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the **code-block mount** seam (`VueCodeBlockHost`, a reading-mode `MarkdownRenderChild`) the way chunk 1 covered the view-leaf mount: prove each fenced key renders real content (not the `.code-block-error` fallback), that `calendar-nav`'s `navBlock.type` navigation + its own `CellDecoration`-on-row path work through real Obsidian, and that the **full 12-decoration matrix** survives Obsidian's real cascade on the `calendar-timeline` grid — by reusing chunk 1's `calendarSurface` factory and computed-style readers verbatim.

**Architecture:** A load-bearing source-model correction drives the whole chunk. The journeys-design assumed `calendar-nav` renders `NotesCalendarCell` and excluded `calendar-timeline` as redundant. The source says the opposite: `calendar-nav` (`NavigationCodeBlock`) renders **text rows** (`NavBlock`/`NavBlockRow`) with optional `CellDecoration` wrappers and a write-type-filtered scope, while **`calendar-timeline` (`mode: month`) embeds the same `NotesMonthView` → `NotesCalendarCell` grid as the view leaf**. So: the 12-matrix moves onto `calendar-timeline` (chunk-1 helpers apply unchanged, just re-rooted), and `calendar-nav` gets its own targeted tests. Chunk 1's inline matrix is extracted into a surface-parameterized `assertDecorationMatrix(surface)` runner that both the view-leaf spec (retrofit) and the timeline spec call.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers); Vue 3 SFC under test. Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**` via `tsconfig.e2e.json`), `npm run check:lint` (`eslint .`), `npm test` (vitest — unchanged here, no production edit), `npm run test:e2e -- --suite journeys` (builds plugin + boots real Obsidian).

**Verification model:** Chunk 2 makes **no production change** — every surface (code-block registration, the Vue mount, the cascade, nav navigation, decoration scoping) already exists and is unit/component-covered for its jsdom-reachable parts. The e2e specs assert that existing behavior against real Obsidian; a red spec is a real finding (or a fixture/selector bug), not a missing feature. The `assertDecorationMatrix` extraction is a **behavior-preserving refactor** whose regression net is the (now-green) chunk-1 decoration suite running through the runner. The fixture and helpers are test infrastructure → no tests of their own (repo convention); the specs are their net. Per-task fast gate = `check:types` + `check:lint`; behavioral confirmation = `npm run test:e2e -- --suite journeys`.

---

## Background facts (verified against live v3 source — do not re-derive)

- **Surface model (the correction):**
  - `calendar-nav` → `NavigationCodeBlock.vue` → `NavBlock` → `NavBlockRow` (**text rows**, not a grid). Renders `<div class="nav-view">` when the host note is a connected journal entry, else `<div class="journal-nav-not-connected">` (`NavigationCodeBlock.vue:96-125`). The current period's block is the **direct child** `.nav-view > .nav-block`; prev/next blocks sit inside `.nav-block-relative` (`NavigationCodeBlock.vue:99-123`). Prev/next nav buttons are `.nav-prev` / `.nav-next` (`UiIconButton`), rendered only when `adjacent.previous`/`.next` resolves (else `.nav-block-placeholder`).
  - `calendar-timeline` → `TimelineCodeBlock.vue`; `mode: month` → `TimelineMonth.vue` → `<NotesMonthView :shelf :month :weeks>` → **`NotesCalendarCell`** — the same grid the view leaf renders (`TimelineMonth.vue:16-19`).
  - `journals-home` → `HomeCodeBlock.vue` → `<div class="home-code-block">` of `<a>` links.
- **Reading-mode wrappers / classes:** Obsidian wraps each registered block in `.block-language-<key>` in reading mode. The plugin host adds its own `cssClass` inside that: `journal-nav-code-block` (keys `journal-nav`/`calendar-nav`/`interval-nav`), `journal-timeline-code-block` (`calendar-timeline`), `journal-home-code-block` (`journals-home`) (`nav-block.ts:7-12`, `timeline-block.ts:6-11`, `home-block.ts:6-11`; `VueCodeBlockHost.onload` adds them, `vue-code-block-host.ts:28-34`).
- **Error fallback:** on YAML-parse or schema-validation failure the service renders `<div class="code-block-error">` into the block element and **never mounts the host** (so no `journal-*-code-block`) (`code-block-service.ts:79-99`, `45-56`). `calendar-timeline` with `mode: bogus` fails `timelineModeSchema` (`picklist(["week","month","quarter","calendar"])`, `timeline-config.ts:3-11`).
- **Nav navigation branch (`navBlock.type`):** `create` → `adjacent` from `cycle.previousAnchor`/`nextAnchor` (always the neighbouring period → nav button always shown); `existing` → `adjacent` from `index.findPrevious`/`findNext` (only existing entries → nav button shown **only when a neighbour note exists**). Click → `OpenDateFlow { anchor, journalNames:[journal], existingOnly: type==="existing", openMode }` (`NavigationCodeBlock.vue:38-93`).
- **Nav period (mode-derivation):** the block reads its host via `index.entryByPath(path)`, resolves the journal, and builds each period with `periodForJournal(journal.write, anchor)` — `match(write.type)` over day/week/month/quarter/year (`period-for-journal.ts:6-16`). So a daily host → day periods, a monthly host → month periods. (Full per-type derivation is pure `match` — unit-tested; e2e shows day vs month only.)
- **Nav decorations:** `decorateWholeBlock` wraps the whole block in `<CellDecoration :period>` (`NavBlock.vue:18`); per-row `addDecorations` wraps the row text (`NavBlockRow.vue:138`). Both feed off `useCellDecorations(() => periods, () => shelfJournalNames)` where `shelfJournalNames` is **same-write-type journals in the owning shelf** (`NavigationCodeBlock.vue:69-82`). The `CellDecoration` root is `<span class="cell-decoration" data-testid="cell-decoration">` — identical to the view leaf — so chunk-1's hex readers apply to a nav decoration directly.
- **`navBlock` schema** (`config.ts:101-149`): `{ type: "create"|"existing", rows: NavBlockRow[], decorateWholeBlock: boolean }`; a row is `{ template, fontSize, bold, italic, color, background, link, journal, addDecorations }`; `color`/`background` use `colorSchema` = `{type:"transparent"} | {type:"theme",name} | {type:"custom",color}` (`decorations/config.ts:3-7`); `link` ∈ `"none"|"self"|"journal"|"day"|"week"|"month"|"quarter"|"year"`. Journals currently carry **no** `navBlock` (default: empty `rows`, `type:"create"`), so nothing renders nav content until this chunk seeds it.
- **Anchor format:** `ANCHOR_FORMAT = "YYYY-MM-DD"` (`calendar-date.ts:8`); every period anchor is a `YYYY-MM-DD` date string. `MonthPeriod.anchor === start === startOf("month")` → `YYYY-MM-01` (`period-month.ts:16-21`). So a month host/neighbour anchor is computed deterministically via `new Date(year, month+offset, 1)` (JS `Date` rolls the year over). Day anchors reuse chunk-1's `dayAnchor(n)` (current month). Week/quarter/year anchors are **read off the rendered grid** (chunk-1's `seedDecorationFixture` does this) — never hand-computed.
- **Timeline scope:** an **unconnected** host → `journal=null` → `derivedShelf=null` → `shelf = config.shelf ?? null = null` → `useShelfScope(null)` → **all journals in scope**; `refDate = Clock.now()` → current month; `mode = config.mode ?? "week"`, so the fence sets `mode: month` (`TimelineCodeBlock.vue:24-63`). `weeks: left` makes `NotesMonthView` render the `week-number-cell` (needed for the `has-open-task` weekly decoration).
- **Reading mode:** code-block post-processors run only in reading (preview) mode. This `wdio-obsidian-service` build exposes **no** `executeObsidianCommand` (`e2e/support/commands.ts` hand-rolls `executeCommandById`), so a note is opened straight into preview via `leaf.openFile(file, { state: { mode: "preview" } })` inside `browser.executeObsidian` (`ExecuteObsidianArg` = `{ app, obsidian, plugins, require }`, `e2e/support/vault.ts:20-34` shows the destructure).
- **Existing jsdom coverage (do not duplicate):** `code-block-service.test.ts` (error fallback), nav-row/period-for-journal/timeline unit tests, plus chunk-1's decoration component/engine suites. e2e asserts only the **real-Obsidian** seam: reading-mode render, real click navigation, and the real-cascade computed style in the code-block mount.

---

## File end-state

**Create:**

- `e2e/journeys/code-blocks.ts` — the code-block support: `openInReadingMode`, the fenced-content constants, `hostNote`/`plainNote` builders, `renderBlock`, the block-root selectors, the `timelineCalendar = calendarSurface(TIMELINE_BLOCK)` surface, and the `NAV_CURRENT` locator.
- `e2e/journeys/code-blocks.e2e.ts` — the chunk-2 specs (two boots: `navigation code block`, `timeline and home code blocks`).

**Modify:**

- `e2e/journeys/decorations.ts` — add the surface-parameterized `assertDecorationMatrix(surface)` runner (the 6 condition + control + 6 style `it`s, lifted from `view.e2e.ts`).
- `e2e/journeys/view.e2e.ts` — replace the inline `condition decorations` / `style decorations` describes with `assertDecorationMatrix(calendar)`; keep the `interactive shelf scope` describe (view-leaf-only).
- `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` — add `navBlock` to `daily` (`create`, `decorateWholeBlock`) and `monthly` (`existing`).
- `docs/e2e-slice-b-journeys.md` + `docs/e2e-slice-b-build-order.md` — reconcile the nav-vs-timeline surface model.

**Unchanged (already correct):** `wdio.conf.mts` (`journeys` glob `./e2e/journeys/**/*.e2e.ts` covers the new spec; `tsconfig.e2e` covers `e2e/**`); `e2e/support/{wait,vault}.ts` reused (`waitForState`, `seedNote`, `waitForJournalFrontmatter`, `waitForFrontmatter`, `waitForActiveNoteIn`, `activeNotePath`); `e2e/journeys/calendar.ts` reused as-is (the factory's `root` parameter is the whole point).

---

## Task 1: Extract `assertDecorationMatrix(surface)` and retrofit the view-leaf spec

Behavior-preserving refactor: lift chunk-1's inline condition/style `it`s into one surface-parameterized runner so the view leaf (this task) and the timeline grid (Task 7) share them. The now-green chunk-1 decoration suite is the regression net.

**Files:**

- Modify: `e2e/journeys/decorations.ts`
- Modify: `e2e/journeys/view.e2e.ts`

- [ ] **Step 1: Add the runner to `e2e/journeys/decorations.ts`**

At the top of the file, widen the imports. Replace:

```ts
import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { calendar, openCalendarView } from "./view.js";

import type { CellLocator, PeriodTestId } from "./calendar.js";
```

with:

```ts
import { expect } from "@wdio/globals";

import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { calendar, openCalendarView } from "./view.js";

import type { CalendarSurface, CellLocator, PeriodTestId } from "./calendar.js";
```

(`expect` is the only `@wdio/globals` symbol the runner needs — the cell chaining uses the
locator's own `.$()` method, not the global `$`.)

Then append at the end of the file:

```ts
// The decoration matrix is mount-context-agnostic: the view leaf and the
// calendar-timeline code block render the same NotesMonthView/NotesCalendarCell grid,
// so the same 13 assertions run against either surface (chunk 1 = view leaf, chunk 2 =
// timeline). Shelf-scope stays out — it drives the view-leaf toolbar, which the
// timeline has no equivalent of.
export function assertDecorationMatrix(surface: CalendarSurface): void {
  describe("condition decorations", () => {
    it("decorates a day cell whose note title matches the title condition", async () => {
      await surface.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "title-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note carries the matching tag", async () => {
      await surface.cell(dayAnchor(DECO_DAY.tag)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "tag-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note has the matching frontmatter property", async () => {
      await surface.cell(dayAnchor(DECO_DAY.property)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "property-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates the quarter header when the quarter journal has a note", async () => {
      await surface.periodCell("header-quarter").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-note decoration did not render on the quarter header",
      });
    });

    it("decorates the week cell when its note has an open task", async () => {
      await surface.periodCell("week-number-cell").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-open-task decoration did not render on the week cell",
      });
    });

    it("decorates the month header when its note's tasks are all completed", async () => {
      await surface.periodCell("header-month").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "all-tasks-completed decoration did not render on the month header",
      });
    });

    it("leaves a cell with no matching note undecorated", async () => {
      // First prove the engine has run (a matched cell is decorated), then assert the
      // control cell — with no seeded note — carries no decoration.
      await surface.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "decoration engine never ran (title cell undecorated before the control assertion)",
      });
      await expect(surface.cell(dayAnchor(DECO_DAY.control)).$(".decoration-corner")).not.toExist();
    });
  });

  describe("style decorations", () => {
    it("renders the background color through Obsidian's real CSS cascade", async () => {
      await expectBackgroundHex(surface.periodCell("header-year"), STYLE_HEX.background);
    });

    it("renders the text color through Obsidian's real CSS cascade", async () => {
      await expectTextHex(surface.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
    });

    it("renders the border through Obsidian's real CSS cascade", async () => {
      await expectBorderTop(surface.cell(dayAnchor(DECO_DAY.border)), "3px", STYLE_HEX.border);
    });

    it("renders a shape decoration element", async () => {
      await surface.cell(dayAnchor(DECO_DAY.shape)).$(".shape-decoration.shape-circle").waitForExist({
        timeoutMsg: "shape decoration did not render on the matching day cell",
      });
    });

    it("renders a corner decoration element at the configured placement", async () => {
      await surface.cell(dayAnchor(DECO_DAY.corner)).$(".decoration-corner.bottom-right").waitForExist({
        timeoutMsg: "corner-style decoration did not render at bottom-right",
      });
    });

    it("renders an icon decoration element", async () => {
      await surface.cell(dayAnchor(DECO_DAY.icon)).$(".icon-decoration").waitForExist({
        timeoutMsg: "icon decoration did not render on the matching day cell",
      });
    });
  });
}
```

- [ ] **Step 2: Repoint `e2e/journeys/view.e2e.ts` onto the runner**

Replace the decorations import block. Change:

```ts
import {
  DECO_DAY,
  STYLE_HEX,
  dayAnchor,
  expectBackgroundCleared,
  expectBackgroundHex,
  expectBorderTop,
  expectTextHex,
  seedDecorationFixture,
} from "./decorations.js";
```

to:

```ts
import {
  DECO_DAY,
  STYLE_HEX,
  assertDecorationMatrix,
  dayAnchor,
  expectBackgroundCleared,
  expectBackgroundHex,
  expectTextHex,
  seedDecorationFixture,
} from "./decorations.js";
```

(`expectBorderTop` is no longer referenced in `view.e2e.ts` — it now lives inside the runner — so drop it from the import.)

- [ ] **Step 3: Replace the inline describes with the runner call**

In the `describe("decorations", …)` block, replace the entire `describe("condition decorations", …)` and `describe("style decorations", …)` blocks (the two inline describes) with a single call, keeping the `interactive shelf scope` describe untouched. The decorations block becomes:

```ts
describe("decorations", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    await seedDecorationFixture();
  });

  assertDecorationMatrix(calendar);

  describe("interactive shelf scope", () => {
    it("re-scopes decorations when a shelf is picked from the toolbar menu", async () => {
      // Precondition: with the default (null) shelf, both the out-of-scope (yearly,
      // shelf "extra") and the in-scope (daily, shelf "core") decorations render.
      await expectBackgroundHex(calendar.periodCell("header-year"), STYLE_HEX.background);
      await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);

      // Drive the real toolbar shelf menu — the click dispatch through Obsidian's own
      // Menu is slice B's seam. Obsidian's Menu exposes no ARIA roles, so the text-
      // pinned .menu-item-title is the only stable handle on chrome we don't own.
      await $("button*=All journals").click();
      const menu = $(".menu");
      await menu.waitForExist({ timeoutMsg: "shelf selector menu did not open" });
      await menu.$(".menu-item-title=core").click();

      await expectBackgroundCleared(calendar.periodCell("header-year"), STYLE_HEX.background);
      await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
    });
  });
});
```

- [ ] **Step 4: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 5: Confirm the chunk-1 decoration suite stays green through the runner**

Run: `npm run test:e2e -- --suite journeys`
Expected: builds, boots Obsidian, all chunk-1 `it`s pass — the 5 journeys + the 13 matrix `it`s (now emitted by `assertDecorationMatrix(calendar)`) + the 1 shelf-scope. Same 19 `it`s, same green.

- [ ] **Step 6: Commit**

```bash
git add e2e/journeys/decorations.ts e2e/journeys/view.e2e.ts
git commit -m "test(e2e): extract surface-parameterized decoration matrix runner"
```

---

## Task 2: Seed `navBlock` into the fixture (`daily` create, `monthly` existing)

Add a `navBlock` to two journals so `calendar-nav` renders content. `daily` is `create` + `decorateWholeBlock` (drives the create-navigation and whole-block decoration tests); `monthly` is `existing` (drives the existing-navigation gating/navigate tests). Insert each as the last property of its journal object, after its `decorations` array (add a comma after the `]` that closes `decorations`).

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`

- [ ] **Step 1: Add `daily.navBlock`** (after the `daily` journal's `decorations` array, before the `}` that closes the `daily` object)

```json
      "navBlock": {
        "type": "create",
        "decorateWholeBlock": true,
        "rows": [
          {
            "template": "{{date}}",
            "fontSize": 1,
            "bold": false,
            "italic": false,
            "color": { "type": "transparent" },
            "background": { "type": "transparent" },
            "link": "self",
            "journal": "",
            "addDecorations": false
          }
        ]
      }
```

- [ ] **Step 2: Add `monthly.navBlock`** (after the `monthly` journal's `decorations` array, before the `}` that closes the `monthly` object)

```json
      "navBlock": {
        "type": "existing",
        "decorateWholeBlock": false,
        "rows": [
          {
            "template": "{{date}}",
            "fontSize": 1,
            "bold": false,
            "italic": false,
            "color": { "type": "transparent" },
            "background": { "type": "transparent" },
            "link": "self",
            "journal": "",
            "addDecorations": false
          }
        ]
      }
```

- [ ] **Step 3: Sanity-check the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json','utf8')); console.log('ok')"`
Expected: prints `ok`. (A missing/trailing comma prints a `SyntaxError` with the byte offset.)

- [ ] **Step 4: Confirm the view-leaf spec still parses the fixture (navBlock is inert in the view leaf)**

Run: `npm run test:e2e -- --suite journeys`
Expected: still green — `navBlock` only affects nav code blocks, which the view-leaf spec never renders. (If red, the JSON shape is wrong; re-check Steps 1–2 against the schema in Background facts.)

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(e2e): seed navBlock configs (daily create, monthly existing) into e2e-journeys"
```

---

## Task 3: Code-block support — `e2e/journeys/code-blocks.ts`

The reading-mode opener, the fenced-content constants and note builders, the `renderBlock` helper, the block-root selectors, and the timeline calendar surface. Reuses `support/vault.seedNote` and (in the specs) chunk-1's `decorations.ts` readers.

**Files:**

- Create: `e2e/journeys/code-blocks.ts`

- [ ] **Step 1: Write `e2e/journeys/code-blocks.ts`**

````ts
import { $, browser } from "@wdio/globals";

import { seedNote } from "../support/vault.js";

import { calendarSurface, type CalendarSurface } from "./calendar.js";

// Obsidian wraps each registered code block in `.block-language-<key>` in reading mode;
// the plugin host adds its own cssClass inside. Every selector is scoped to a block so
// the view-leaf markup (a bare `.notes-month-view`) never collides.
export const NAV_BLOCK = ".block-language-calendar-nav";
export const TIMELINE_BLOCK = ".block-language-calendar-timeline";
export const HOME_BLOCK = ".block-language-journals-home";
export const CODE_BLOCK_ERROR = ".code-block-error";

// The connected nav view, the unconnected fallback, the prev/next buttons.
export const NAV_VIEW = `${NAV_BLOCK} .nav-view`;
export const NAV_NOT_CONNECTED = `${NAV_BLOCK} .journal-nav-not-connected`;
export const NAV_NEXT = `${NAV_BLOCK} .nav-next`;
// The current period's block is the *direct* child of .nav-view; prev/next blocks live
// inside .nav-block-relative, so the `>` combinator keeps their unstyled decorations out.
export const NAV_CURRENT = `${NAV_BLOCK} .nav-view > .nav-block`;

// calendar-timeline (mode:month) embeds the same NotesMonthView/NotesCalendarCell grid
// as the view leaf, so chunk 1's factory binds to it unchanged.
export const timelineCalendar: CalendarSurface = calendarSurface(TIMELINE_BLOCK);

// Fenced bodies. The timeline runs over all journals (unconnected host ⇒ null shelf) and
// must show the week column for the has-open-task weekly decoration.
export const NAV_FENCE = "```calendar-nav\n```";
export const TIMELINE_FENCE = "```calendar-timeline\nmode: month\nweeks: left\n```";
export const TIMELINE_BAD_FENCE = "```calendar-timeline\nmode: bogus\n```";
export const HOME_FENCE = "```journals-home\n```";

// A note connected to `journal` at `anchor` (frontmatter is what the index reads), with a
// body that embeds a fence and optional inline content (tags/tasks for nav decorations).
export function hostNote(journal: string, anchor: string, body: string): string {
  return `---\njournal: ${journal}\njournal-date: ${anchor}\n---\n${body}\n`;
}

// An unconnected note carrying only a fence (timeline/home need no journal connection).
export function plainNote(fence: string): string {
  return `${fence}\n`;
}

// Reading mode is the only mode where Obsidian runs code-block post-processors;
// openFile carries the mode in its view state so the block renders on open. This
// wdio-obsidian-service build exposes no executeObsidianCommand, so there is no toggle
// command to call — the state on openFile is the mechanism. A fresh leaf avoids
// clobbering the calendar view leaf a prior seed step may have opened.
export async function openInReadingMode(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) throw new Error(`no file at ${notePath}`);
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: "preview" } });
  }, path);
}

// Seed a note, open it in reading mode, and wait for `blockRoot` to render. The wait is
// the render assertion; callers separately assert the absence of `.code-block-error`.
export async function renderBlock(path: string, content: string, blockRoot: string): Promise<void> {
  await seedNote(path, content);
  await openInReadingMode(path);
  await $(blockRoot).waitForExist({ timeoutMsg: `code block did not render: ${blockRoot} (${path})` });
}
````

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `getLeaf(true)` types reject the boolean overload, it is the documented `getLeaf(newLeaf?: boolean)` form — confirm against `node_modules/obsidian/obsidian.d.ts`; the `{ state: { mode: "preview" } }` is an `OpenViewState`.)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/code-blocks.ts
git commit -m "test(e2e): add code-block reading-mode support layer for slice B chunk 2"
```

---

## Task 4: Fence-render specs (4) — `e2e/journeys/code-blocks.e2e.ts`

Each registered key renders real content and **not** the `.code-block-error` fallback; the malformed timeline asserts the fallback's positive case (the schema-validation seam). Two boots: `navigation code block` (nav-bearing, reused by Tasks 5–6) and `timeline and home code blocks` (reused by Task 7).

**Files:**

- Create: `e2e/journeys/code-blocks.e2e.ts`

- [ ] **Step 1: Write the spec skeleton with the render tests**

```ts
import { $, browser, expect } from "@wdio/globals";

import { seedDecorationFixture } from "./decorations.js";
import {
  CODE_BLOCK_ERROR,
  HOME_BLOCK,
  HOME_FENCE,
  NAV_BLOCK,
  NAV_FENCE,
  NAV_VIEW,
  TIMELINE_BAD_FENCE,
  TIMELINE_BLOCK,
  TIMELINE_FENCE,
  hostNote,
  openInReadingMode,
  plainNote,
  renderBlock,
} from "./code-blocks.js";

// Slice B chunk 2 — the code-block mount seam. Our Vue surfaces mount via
// VueCodeBlockHost (a reading-mode MarkdownRenderChild) instead of createApp on an
// ItemView. Code blocks only render in reading mode, which no __mocks__/obsidian.ts
// post-processor pipeline reproduces.

// A daily host note carries a calendar-nav fence and connects via frontmatter so the
// nav renders its `.nav-view` (vs the not-connected fallback).
function navHost(anchor: string, body: string): string {
  return hostNote("daily", anchor, `${body}\n\n${NAV_FENCE}`);
}

describe("navigation code block", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  describe("rendering", () => {
    it("renders the nav view for a connected note and not the error fallback", async () => {
      await renderBlock("nav/render.md", navHost("2026-06-04", ""), NAV_VIEW);
      await expect($(`${NAV_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
    });
  });
});

describe("timeline and home code blocks", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  describe("rendering", () => {
    it("renders the timeline month grid and not the error fallback", async () => {
      await renderBlock("blocks/timeline.md", plainNote(TIMELINE_FENCE), `${TIMELINE_BLOCK} .notes-month-view`);
      await expect($(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
    });

    it("renders the journals-home block and not the error fallback", async () => {
      await renderBlock("blocks/home.md", plainNote(HOME_FENCE), `${HOME_BLOCK} .home-code-block`);
      await expect($(`${HOME_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
    });

    it("renders the error fallback for a timeline fence with an invalid mode", async () => {
      await seedNote("blocks/bad-timeline.md", plainNote(TIMELINE_BAD_FENCE));
      await openInReadingMode("blocks/bad-timeline.md");
      await $(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`).waitForExist({
        timeoutMsg: "schema-invalid timeline fence did not render the .code-block-error fallback",
      });
      await expect($(`${TIMELINE_BLOCK} .notes-month-view`)).not.toExist();
    });
  });
});
```

- [ ] **Step 2: Add the missing `seedNote` import**

The error-fence test calls `seedNote` directly. Add it to the imports:

```ts
import { seedNote } from "../support/vault.js";
```

(Place it with the other `../support` imports, above the `./` sibling imports, per `import/order`. `seedDecorationFixture` is imported now though first used in Task 7 — the import lands here; if `eslint` flags it as unused until then, add it in Task 7 instead.)

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. If `seedDecorationFixture` trips `no-unused-vars`, remove it from the import block now and re-add it in Task 7 Step 1.

- [ ] **Step 4: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: chunk-1 `it`s + the 4 new render `it`s pass. (A red nav render means the host didn't connect — confirm the frontmatter `journal`/`journal-date` and that `2026-06-04` is a valid daily anchor. A red timeline render means `mode: month`/`weeks: left` didn't parse — check the fence string. The error-fence red means the schema accepted `bogus` — re-check `timelineModeSchema`. Screenshots land in `e2e/.reports/screenshots/`.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/code-blocks.e2e.ts
git commit -m "test(e2e): assert code-block fences render real content, not the error fallback"
```

---

## Task 5: Nav navigation specs (4) — `navBlock.type` + mode-derivation

`create` always offers the neighbour (and creates on click → day-period); `existing` offers it only when a neighbour exists (and navigates → month-period). Added to the `navigation code block` boot (daily host = create, monthly host = existing).

**Files:**

- Modify: `e2e/journeys/code-blocks.e2e.ts`

- [ ] **Step 1: Extend the imports**

Add the navigation symbols to the existing `./code-blocks.js` import and pull in the vault helpers. Update the `@wdio/globals` and support imports, and add to the `./code-blocks.js` block: `NAV_NEXT`, `NAV_BLOCK`. Add a new `../support/vault.js` import line:

```ts
import { activeNotePath, waitForJournalFrontmatter } from "../support/vault.js";
```

and extend the `./code-blocks.js` import to include `NAV_BLOCK` and `NAV_NEXT`.

- [ ] **Step 2: Add a `month-of-year` anchor helper near `navHost`**

```ts
// MonthPeriod.anchor === startOf("month") === YYYY-MM-01; new Date(y, m+offset, 1) rolls
// the year over, so a month host and its neighbour are computed without touching moment.
function monthAnchor(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
```

- [ ] **Step 3: Add the `navigation` describe inside `describe("navigation code block", …)`** (after the `rendering` describe)

```ts
describe("navigation", () => {
  it("offers the next period on a create-type nav even with no existing neighbour", async () => {
    await renderBlock("nav/create-present.md", navHost("2026-06-12", ""), NAV_VIEW);
    await $(NAV_NEXT).waitForExist({
      timeoutMsg: "create-type nav did not offer a next button with no neighbour seeded",
    });
  });

  it("creates and opens the next-day note when a create-type nav's next is clicked", async () => {
    await renderBlock("nav/create-click.md", navHost("2026-06-14", ""), NAV_VIEW);
    await $(NAV_NEXT).click();

    await waitForJournalFrontmatter("day/2026-06-15.md", { journal: "daily", date: "2026-06-15" });
    expect(await activeNotePath()).toBe("day/2026-06-15.md");
  });

  it("hides the next button on an existing-type nav when no neighbour note exists", async () => {
    await seedNote(`month/${monthAnchor(0)}.md`, hostNote("monthly", monthAnchor(0), NAV_FENCE_BODY));
    await openInReadingMode(`month/${monthAnchor(0)}.md`);
    await $(NAV_VIEW).waitForExist({ timeoutMsg: "monthly nav view did not render" });
    await expect($(NAV_NEXT)).not.toExist();
  });

  it("navigates to the adjacent existing note when an existing-type nav's next is clicked", async () => {
    await seedNote(`month/${monthAnchor(4)}.md`, hostNote("monthly", monthAnchor(4), "neighbour"));
    await seedNote(`month/${monthAnchor(3)}.md`, hostNote("monthly", monthAnchor(3), NAV_FENCE_BODY));
    await openInReadingMode(`month/${monthAnchor(3)}.md`);
    await $(NAV_NEXT).waitForExist({
      timeoutMsg: "existing-type nav did not offer a next button with a neighbour seeded",
    });
    await $(NAV_NEXT).click();

    await browser.waitUntil(async () => (await activeNotePath()) === `month/${monthAnchor(4)}.md`, {
      timeoutMsg: `existing-type nav did not open the adjacent note month/${monthAnchor(4)}.md`,
    });
  });
});
```

- [ ] **Step 4: Add the `NAV_FENCE_BODY` constant**

The monthly host embeds the fence as its whole body (no extra inline content). Add near `navHost`:

```ts
// A bare nav fence as a note body (monthly hosts carry no inline tags/tasks).
const NAV_FENCE_BODY = NAV_FENCE;
```

and ensure `NAV_FENCE` is in the `./code-blocks.js` import.

- [ ] **Step 5: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 6: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 4 navigation `it`s pass. (A red on the create-click means the daily journal isn't `type:"create"` or the next anchor isn't `2026-06-15` — confirm Task 2 and that `day/2026-06-15.md` is the created path. A red on the existing-hide means `monthly` isn't `type:"existing"` or a stray month neighbour was seeded. A red on existing-navigate means `index.findNext` didn't resolve the neighbour — confirm both month notes carry `journal: monthly` + the `YYYY-MM-01` `journal-date`.)

- [ ] **Step 7: Commit**

```bash
git add e2e/journeys/code-blocks.e2e.ts
git commit -m "test(e2e): assert calendar-nav navBlock.type navigation and period derivation"
```

---

## Task 6: Nav decoration specs (2) — the `CellDecoration`-on-block path

`calendar-nav`'s decoration path differs from the grid: a `decorateWholeBlock` wrapper around the current period's block, scoped to same-write-type journals. Prove it renders an element marker and survives the real cascade (computed hex) in the code-block mount. Added to the `navigation code block` boot.

**Files:**

- Modify: `e2e/journeys/code-blocks.e2e.ts`

- [ ] **Step 1: Extend the imports**

Add the chunk-1 readers and the nav-current selector. Add to the `./decorations.js` import: `STYLE_HEX`, `expectTextHex`. Add to the `./code-blocks.js` import: `NAV_CURRENT`. (`STYLE_HEX`/`expectTextHex` are the same constants/readers the timeline matrix uses — context-free, they work on any located element containing a `[data-testid="cell-decoration"]`.)

- [ ] **Step 2: Add the `decorations` describe inside `describe("navigation code block", …)`** (after the `navigation` describe)

```ts
describe("decorations", () => {
  it("decorates the current nav block when its note matches a corner condition", async () => {
    // The daily ctag→corner decoration matches the host's inline #ctag; decorateWholeBlock
    // wraps the current period's block. The host basename is "deco-corner" (not -07), so the
    // title condition can't also fire — only #ctag matches.
    await renderBlock("nav/deco-corner.md", navHost("2026-06-08", "#ctag"), NAV_VIEW);
    await $(NAV_CURRENT).$(".decoration-corner.top-left").waitForExist({
      timeoutMsg: "nav whole-block corner decoration did not render on the matching host",
    });
  });

  it("renders the nav decoration's text color through Obsidian's real CSS cascade", async () => {
    // The daily scolor→color(#112233) decoration matches the host's inline #scolor.
    await renderBlock("nav/deco-color.md", navHost("2026-06-09", "#scolor"), NAV_VIEW);
    await expectTextHex($(NAV_CURRENT), STYLE_HEX.color);
  });
});
```

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`expectTextHex` takes a `CellLocator`; `$(NAV_CURRENT)` is one and contains the `[data-testid="cell-decoration"]` span the reader drills into.)

- [ ] **Step 4: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 2 nav decoration `it`s pass. (A red corner means `decorateWholeBlock` isn't `true` on `daily` (Task 2) or `#ctag` wasn't indexed inline — confirm it sits in the body, not frontmatter. A red color means the `#scolor` deco didn't apply or `NAV_CURRENT` resolved to a prev/next block — confirm the `>` combinator pinned the current block.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/code-blocks.e2e.ts
git commit -m "test(e2e): assert calendar-nav decoration path renders and survives the cascade"
```

---

## Task 7: Timeline full decoration matrix (13)

Re-run chunk 1's entire matrix on the `calendar-timeline` grid via `assertDecorationMatrix(timelineCalendar)`. Reuse `seedDecorationFixture` (seeds the 12 precondition notes; reads the period anchors off the view-leaf grid) and render an unconnected `mode: month, weeks: left` timeline (all journals in scope, current month) before the matrix runs.

**Files:**

- Modify: `e2e/journeys/code-blocks.e2e.ts`

- [ ] **Step 1: Extend the imports**

Add `assertDecorationMatrix` to the `./decorations.js` import (and confirm `seedDecorationFixture` is imported — re-add it if Task 4 Step 3 removed it). Add `timelineCalendar` and `TIMELINE_FENCE`/`TIMELINE_BLOCK` (already imported) to the `./code-blocks.js` import.

- [ ] **Step 2: Add the `decorations` describe inside `describe("timeline and home code blocks", …)`** (after the `rendering` describe)

```ts
describe("decorations", () => {
  before(async () => {
    // Seed the 12 precondition notes (also opens the view leaf to read period anchors),
    // then render an unconnected month-mode timeline: null shelf ⇒ all journals in scope,
    // refDate ⇒ current month — the same grid (and the same 12 matches) as the view leaf.
    await seedDecorationFixture();
    await renderBlock("blocks/timeline-matrix.md", plainNote(TIMELINE_FENCE), `${TIMELINE_BLOCK} .notes-month-view`);
  });

  assertDecorationMatrix(timelineCalendar);
});
```

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 4: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: all prior `it`s + the 13 timeline matrix `it`s pass. (A red here means a decoration didn't reach the timeline grid: confirm `weeks: left` (week-number-cell), that `mode: month` parsed (not the error fallback), and that the seeded notes are in the current month — the timeline's `refDate` is today, matching `dayAnchor`/the grid-read period anchors. A whole-grid blank means the timeline scoped to a non-null shelf — confirm the host note is unconnected.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/code-blocks.e2e.ts
git commit -m "test(e2e): run the full decoration matrix on the calendar-timeline grid"
```

---

## Task 8: Reconcile the docs + full verification sweep

Correct the journeys-design's inverted surface model (nav was assumed to carry the grid; timeline was wrongly excluded) and record the realized chunk-2 layout; then run every gate.

**Files:**

- Modify: `docs/e2e-slice-b-journeys.md`
- Modify: `docs/e2e-slice-b-build-order.md`

- [ ] **Step 1: Correct the de-dup argument in `docs/e2e-slice-b-journeys.md`**

Under `### The two mount-context seams …`, replace the paragraph beginning "Therefore decoration rendering and cell-click dispatch are tested **once per mount context** (view leaf, and `calendar-nav` for the code-block context)…" with:

```markdown
Therefore decoration rendering is tested **once per mount context**. The code-block
mount's `NotesCalendarCell` grid is **`calendar-timeline` (`mode: month`)** — it embeds
the same `NotesMonthView` as the view leaf — so the full decoration matrix re-runs there
(re-rooted via `calendarSurface`). `calendar-nav` is a **different** surface: it renders
text rows (`NavBlock`/`NavBlockRow`) with `CellDecoration` wrappers and a write-type-
filtered scope, so it gets its **own** targeted tests (fence render, `navBlock.type`
navigation, `periodForJournal` derivation, and the whole-block decoration path) rather
than the grid matrix.
```

- [ ] **Step 2: Correct the `code-blocks.e2e.ts` spec inventory in `docs/e2e-slice-b-journeys.md`**

Under `### \`code-blocks.e2e.ts\``, replace the `Condition decorations (6) + style decorations (6) on calendar-nav`bullet and the`Nav click (2)` bullet with:

```markdown
- **Nav navigation** (4) on `calendar-nav`: `create`-type offers the next period with no
  neighbour and **creates+opens** the next-day note on click (day-period derivation);
  `existing`-type **hides** the next button with no neighbour and **navigates** to the
  adjacent existing month note on click (month-period derivation). The two
  `navBlock.type` branches are the discriminator.
- **Nav decorations** (2) on `calendar-nav`: a `decorateWholeBlock` host matching a corner
  condition renders `.nav-view > .nav-block .decoration-corner`; a color condition's
  computed hex survives the real cascade. (The nav decoration path is `CellDecoration` on
  text rows — distinct from the grid; it is **not** the 12-matrix.)
- **Timeline decorations** (13) on `calendar-timeline` (`mode: month`): the full 6
  condition + 6 style + 1 control matrix, re-run on the code-block grid via the shared
  `assertDecorationMatrix` runner.
```

Also delete the now-stale `Derived shelf-scope (1)` and `Mode-derivation (2)` bullets in that section — derivation is folded into nav navigation, and nav has no cross-journal grid scope to re-scope (it renders only its host journal's periods). Add one line recording that:

```markdown
- **Out of scope for nav:** cross-journal shelf re-scoping (a grid concept; covered by the
  view-leaf shelf-scope test and the timeline matrix). A nav renders only its host
  journal's own prev/current/next periods.
```

- [ ] **Step 3: Update `docs/e2e-slice-b-build-order.md` chunk-2 bullets**

Under `### Chunk 2 — Code-block mount context`, replace the `**Specs:**` and the decoration-reuse bullets with:

```markdown
- **Support:** `journeys/code-blocks.ts` (reading-mode `openInReadingMode`, fenced-content
  builders, block-root selectors, the `timelineCalendar = calendarSurface(TIMELINE_BLOCK)`
  surface). Chunk 1's decoration matrix is extracted into `assertDecorationMatrix(surface)`
  in `journeys/decorations.ts` and the view-leaf spec is retrofitted onto it.
- **Specs:** `code-blocks.e2e.ts` — fence renders (4, incl. the malformed-fence
  `.code-block-error` case), nav navigation (4: `navBlock.type` × create/existing + day/
  month derivation), nav decorations (2), and the full timeline matrix (13).
- **Surface correction:** the code-block grid is `calendar-timeline`, not `calendar-nav`
  (the journeys-design had these inverted). `calendar-nav` is text rows + `CellDecoration`
  wrappers; it carries its own nav/decoration tests, not the grid matrix.
```

- [ ] **Step 4: Full static + unit gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all exit 0. (`npm test` is unchanged by this chunk — no production edit — but confirms nothing regressed.)

- [ ] **Step 5: Full e2e suite (no regression in A/C/D + green journeys)**

Run: `npm run test:e2e`
Expected: builds, boots Obsidian, all suites pass — `smoke`, `integration`, `migration`, `interop`, and `journeys`. The journeys suite is now chunk-0/1 (19 `it`s) + chunk-2 (4 render + 4 nav navigation + 2 nav decoration + 13 timeline matrix = 23 `it`s). 0 failures.

- [ ] **Step 6: Confirm the chunk-2 surface shape**

Run: `ls e2e/journeys && echo '---' && git -C . diff --stat HEAD~7 -- e2e docs`
Expected: `journeys/` contains `calendar.ts code-blocks.e2e.ts code-blocks.ts decorations.ts view.e2e.ts view.ts`; the diffstat shows the fixture, two new code-block files, the decorations/view retrofit, and the two doc corrections.

- [ ] **Step 7: Commit**

```bash
git add docs/e2e-slice-b-journeys.md docs/e2e-slice-b-build-order.md
git commit -m "docs(e2e): correct slice B code-block surface model and record chunk 2 layout"
```

---

## Self-review notes

- **Spec coverage (build-order chunk 2 + journeys-design `code-blocks.e2e.ts`):** "fence renders (3)" → Task 4 (nav/timeline/home) **+ the malformed-fence error case** (4th, the fallback's positive seam); "nav click (2)" → Task 5 (4 tests covering both `navBlock.type` branches + day/month derivation, the corrected framing); "condition+style decorations on the code-block mount" → Task 7 (full 13-matrix on `calendar-timeline`, the corrected grid surface) **+** Task 6 (nav's own `CellDecoration`-on-row path); "mode-derivation (2)" → folded into Task 5 (day via create-click, month via existing-navigate); "reuses chunk 1's decoration helper" → Task 1 (`assertDecorationMatrix` extraction) consumed by Task 7. ✓
- **Surface-model correction is load-bearing and recorded:** `calendar-nav` renders text rows (no `NotesCalendarCell`), `calendar-timeline` renders the grid — Task 8 fixes the journeys-design/build-order, matching how chunks 0 and 1 corrected false premises in the same docs. ✓
- **Retrofit safety:** Task 1 lifts the exact chunk-1 `it` bodies into a surface-parameterized runner; the view-leaf suite re-run (Task 1 Step 5) is the behavior-preserving net; shelf-scope (view-leaf-only) stays out of the runner. ✓
- **Isolation correctness:** nav hosts use distinct anchors — render `2026-06-04`, create-present `2026-06-12`, create-click `2026-06-14`→creates `2026-06-15`, deco-corner `2026-06-08` (#ctag, title -08 ≠ -07), deco-color `2026-06-09` (#scolor); monthly existing `monthAnchor(0)` (no neighbour) vs `monthAnchor(3)`+neighbour `monthAnchor(4)` (months 1 and 2 never seeded, so each host's gating is independent). Timeline matrix uses chunk-1's seeded 12 notes + day-2 control. No two tests share a mutated note. ✓
- **Anchor determinism:** day anchors via `dayAnchor`/literals (`YYYY-MM-DD`); month anchors via `new Date(y, m+offset, 1)` → `YYYY-MM-01` (= `MonthPeriod.anchor`, verified); week/quarter/year anchors read off the grid inside `seedDecorationFixture` (never hand-computed). ✓
- **Type/name consistency:** `assertDecorationMatrix(surface: CalendarSurface)` (Task 1) called with `calendar` (Task 1) and `timelineCalendar` (Task 7); `timelineCalendar`/`NAV_*`/`*_BLOCK`/`*_FENCE`/`hostNote`/`plainNote`/`renderBlock`/`openInReadingMode` (Task 3) match every import in Tasks 4–7; `STYLE_HEX`/`expectTextHex`/`seedDecorationFixture`/`dayAnchor`/`DECO_DAY` reused from chunk-1 `decorations.ts`; `waitForJournalFrontmatter`/`activeNotePath` reused from `support/vault.ts` with their chunk-0/1 signatures; the fixture `navBlock` JSON matches `navBlockSchema` field-for-field. ✓
- **No placeholders:** every fence string, fixture object, helper body, and spec is fully written; commands carry expected output and named failure-triage. ✓
- **Out of scope (intentional, deferred):** settings SPA (chunk 3), commands/bulk-add (chunk 4), CI split (chunk 5); the `journal-nav`/`interval-nav` aliases (same registration loop); `calendar-timeline` non-month modes; nav cross-journal shelf-scope (not a nav concept); pure-date decoration conditions (unit-tested). ✓
