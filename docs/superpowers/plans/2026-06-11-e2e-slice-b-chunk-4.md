# E2E Slice B — Chunk 4 (Command palette + bulk-add) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the **command-palette real-click seam** — the per-note commands (`insert-date-link`, `connect-note`, `open-next`/`open-prev`) driven through Obsidian's own command palette, including the `check()` gating the palette honors and `executeCommandById` bypasses — plus the **bulk-add vault-scan + 2-modal** flow, by asserting each flow's real-Obsidian outcome (editor text, attached frontmatter, active note, palette listing).

**Architecture:** A palette/suggest driver grows on `support/commands.ts` (open the built-in palette, filter, choose; both the palette and the plugin's `SuggestModal`s share the `.prompt` DOM). `support/vault.ts` gains `openNote`/`closeAllLeaves`/`waitForActiveNote` for the command preconditions. `support/settings.ts` gains generic dialog-button helpers (`clickDialogButton`/`waitForDialogClosed`/`toggleModalCheckbox`) reused by both the connect-note modal and the two bulk-add modals. Two specs: `commands.e2e.ts` (palette-driven) and `bulk-add.e2e.ts` (settings-subpage-driven — see the correction below).

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers); the per-note command flows and the Vue bulk-add modals under test. Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**`), `npm run check:lint` (`eslint .`), `npm test` (vitest — unchanged here, no production edit), `npm run test:e2e -- --suite journeys` (builds plugin + boots real Obsidian).

**Verification model:** Chunk 4 makes **no production change** — every command, guard, modal, and the `BulkAddService` already exist and are unit/component-covered for their jsdom-reachable parts. The e2e specs assert that existing behavior against real Obsidian: the palette's own filter+choose path into a `check()`-gated command, and the bulk-add 2-modal flow's real-vault scan + write. A red spec is a real finding (or a fixture/selector bug), not a missing feature. The support helpers and runtime-seeded fixture notes are test infrastructure → no tests of their own (repo convention); the specs are their net. Per-task fast gate = `check:types` + `check:lint`; behavioral confirmation = `npm run test:e2e -- --suite journeys`.

---

## Load-bearing correction vs the build-order / journeys-design

The build-order chunk-4 bullet and the journeys-design both frame `bulk-add.e2e.ts` as palette-adjacent ("invoke bulk-add for a journal"). **Bulk-add is NOT a command-palette command.** It is registered nowhere via `addCommand`; it is invoked by a header `UiButton` on the journal **edit subpage** (`JournalEditSubpage.vue:177`, label `m.bulk_add_command()` = "Bulk add notes to this journal") that calls `flows.invoke(BulkAddFlow, { journalName })`. So `bulk-add.e2e.ts` reaches the flow **through the chunk-3 settings SPA** (`openSettings` → `openJournalSubpage("core", "daily")` → click the button), and reuses the `support/settings.ts` dialog driver — it does **not** use the palette driver. This is recorded in the build-order doc in Task 8.

---

## Background facts (verified against live v3 source — do not re-derive)

- **Per-note commands (all `check()`-gated, all registered under the `journals:` manifest id):**
  - `journals:insert-date-link` — name `m.command_insert_date_link()` = **"Insert link to journal note"** (`src/journals/notes/journal-link-commands.ts:18-24`). Guard: `check: () => this.#workspace.hasActiveEditor() && !this.#journals.find().ids().next().done` — listed only with an **active markdown editor** AND ≥1 journal. Runs `InsertJournalLinkFlow` (`flows/insert-journal-link.flow.ts`): if >1 journal, opens `journalPickerSuggest` (an Obsidian `SuggestModal`, placeholder `m.journal_picker_placeholder()` = **"Search journals"**); then opens `datePickerModal`; on a day-period journal the picker shows the **month view** (`CalendarMonthView`, cells `[data-testid="month-cell"][data-anchor="<ISO>"]`, `src/calendar/ui/CalendarMonthView.vue:54-55`); clicking a cell submits the period and the flow inserts a link at the editor cursor via `WorkspaceService.insertNoteLinkAtCursor` (`editor.replaceSelection`). For a not-yet-existing target the inserted text contains the date basename (e.g. `2026-06-15`).
  - `journals:connect-note` — name `m.command_connect_note()` = **"Connect note to a journal"** (`src/journals/notes/note-connection-commands.ts:16-21`). Guard: `check: () => this.#workspace.activeNote().isSome()` — listed only with an **active file**. Opens `ConnectNoteModal` (`src/journals/notes/ui/ConnectNoteModal.vue`): for an **unconnected** note the form's **first control is the journal `<select>`** (`UiDropdown`, option values = journal names), then a `<input type="date">` (default today), conditional override/rename/move toggles (default off, shown only when relevant), and a submit `UiButton` with text **"Connect"** (`m.connect_note_modal_connect()`). Submitting attaches `journal` + `journal-date` frontmatter (in place, since rename/move default off).
  - `journals:open-next` / `journals:open-prev` — names `m.command_open_next()` = **"Open next note"** / `m.command_open_previous()` = **"Open previous note"** (`src/journals/navigation-commands.ts:18-30`). Guards: `check: () => this.#resolve("next"|"previous").isSome()` where `#resolve` = active note → `JournalsIndex.entryByPath` → `findNext`/`findPrevious(journalName, anchor)`. Listed only when the **active note is an indexed journal entry** AND an adjacent entry exists. No modal; opens the adjacent note directly into the active leaf.
- **Bulk-add (`src/journals/notes/bulk-add/`):**
  - Invoked by the subpage button (above) → `BulkAddFlow` (`flows/bulk-add.flow.ts`): opens `configureBulkAddModal` → `BulkAddService.plan(journalName, params)` scans the vault → opens `processBulkAddModal` (which calls `BulkAddService.apply` on "Run").
  - `ConfigureBulkAddModal.vue` field order: **(1) folder** — `FolderInput` (a native `<input type="text">` with an attached folder suggest; this is the modal's **first text input**); (2) date-place `<select>` (default `"title"`); (3) property-name text input (hidden unless date-place = property); (4) date-format text input (default **`"YYYY-MM-DD"`**); (5) filter combinator `<select>` (default `"no"` → the filter rows + extra toggles stay hidden); (6) existing/(7) other-folder/(8) other-name `<select>`s (defaults `skip`/`keep`/`keep`); **(9) dry-run `UiToggle`** (default **on** — `defaultBulkAddParameters()` sets `dryRun: true`). Submit `UiButton` text **"Continue"** (`m.bulk_add_next()`). With combinator = `no`, the dry-run toggle is the **only `.checkbox-container`** in the dialog.
  - `ProcessBulkAddModal.vue`: shows `m.bulk_add_planned_count` · `m.bulk_add_skipped_count`, one row per planned action / skip, and (while `log === null`) a `cta` `UiButton` text **"Run"** (`m.bulk_add_run()`); after the run completes the view swaps to a results log + a **"Close"** `UiButton` (`m.common_action_close()`).
  - `plan()` matching (`bulk-add-service.ts`): scans `params.folder`; for each note reads the date from the title/filename (date-place `title`) or a property; matches the filename against the regex derived from `params.dateFormat`; rejects unparseable/invalid dates, out-of-bounds anchors, already-connected notes, and filtered notes (skip reasons). A **matching** note for the `daily` journal (folder irrelevant to matching; format `YYYY-MM-DD`) is one whose **basename parses as `YYYY-MM-DD`** and that has **no journal frontmatter yet**, e.g. `bulk-match/2030-09-01.md`. With `otherFolder: keep` / `otherName: keep` the connect leaves the note in place and only adds frontmatter.
- **Settings dialog scoping (chunk 3, reused):** the Obsidian settings panel is itself a `.modal-container` (wrapping `.mod-settings`), so a plugin dialog opened on top is a **second** `.modal-container`. `support/settings.ts` already scopes every modal helper to `DIALOG = ".modal-container:not(:has(.mod-settings))"` via the private `activeModal()`. The bulk-add modals (opened over the settings panel) are correctly targeted by this; in `commands.e2e.ts` the settings panel is closed, so the connect-note / date-picker modal is the only `.modal-container` and `activeModal()` still resolves it.
- **Palette / suggest DOM:** Obsidian's command palette and the plugin's `SuggestModal`s both render a `.prompt` with a text input and `.suggestion-item` rows. The palette is opened via the core built-in id **`command-palette:open`** (a core plugin, enabled by default in the e2e Obsidian). The palette lists a plugin command as `"<plugin name>: <command name>"` (manifest name = **"Journals"**), so a partial `.suggestion-item*=<command name>` match survives the prefix. **The palette only lists commands whose `check()` passes** — that gate is the whole reason chunk 4 uses the palette rather than `executeCommandById`.
- **Index readiness:** `JournalsIndex` registers entries off `metadataCache` resolve events. A foreign-created note (`seedNote` → `vault.create`) with journal frontmatter is indexed once metadataCache parses it; waiting on `waitForJournalFrontmatter` (which reads `metadataCache.getFileCache(...).frontmatter`) confirms the parse and therefore that the index sees the entry — the readiness gate before `open-next`/`open-prev` resolve.
- **No fixture `data.json` change:** every precondition note is **runtime-seeded** in the spec (like `seedDecorationFixture`), not baked into `e2e-journeys/.../data.json`. Runtime mutations write to the per-boot vault copy and never leak across spec files, so chunks 0–3 are untouched. `commands.e2e.ts` and `bulk-add.e2e.ts` each `reloadObsidian` the `e2e-journeys` fixture in their own `before`.
- **Existing jsdom coverage (do not duplicate):** `journal-link-commands` / `note-connection-commands` / `navigation-commands` `.test.ts`, the `*.flow.test.ts`, `ConnectNoteModal`/`ConfigureBulkAddModal`/`ProcessBulkAddModal` `.test.ts`, and `bulk-add-service.test.ts` cover the jsdom-reachable behavior (registration, guard truth tables, modal field logic, plan/apply branches). e2e asserts only the real-Obsidian seam: the palette's filter+choose into a gated command, the real editor/cursor write, the real-vault scan, and the real `saveData`/`process`-modal round-trip.

---

## File end-state

**Create:**

- `e2e/journeys/commands.e2e.ts` — palette-driven per-note command specs (single `e2e-journeys` boot; nested `describe` per command family).
- `e2e/journeys/bulk-add.e2e.ts` — bulk-add vault-scan + 2-modal specs (single `e2e-journeys` boot; reaches the flow through the settings subpage button).

**Modify:**

- `e2e/support/commands.ts` — add the palette/suggest driver (`openPalette`, `promptType`, `promptItem`, `promptChoose`, `waitForPrompt`, `closePalette`, `paletteLists`).
- `e2e/support/vault.ts` — add `openNote`, `closeAllLeaves`, `waitForActiveNote`.
- `e2e/support/settings.ts` — add `clickDialogButton`, `waitForDialogClosed`, `toggleModalCheckbox` (generic dialog drivers next to `submitModal`/`deleteInModal`).
- `docs/e2e-slice-b-build-order.md` — record the realized chunk-4 layout/outcome and the bulk-add-is-settings-driven correction.

**Unchanged (already correct):** `wdio.conf.mts` (`journeys` glob covers both new specs); `tsconfig.e2e`; `support/{wait,editor,errors,plugin-data}.ts`; `e2e/journeys/{calendar,view,decorations}.ts` (`dayAnchor` reused from `decorations.ts`); the `e2e-journeys` fixture `data.json` (no edit — all precondition notes are runtime-seeded).

---

## Task 1: Palette/suggest driver — extend `support/commands.ts`

Grow the command driver from the lone `runCommand` into a palette + suggest driver. The palette and the plugin's `SuggestModal`s share the `.prompt` DOM, so one set of helpers drives both; a freshly opened suggest is disambiguated from the just-closed palette by its placeholder.

**Files:**

- Modify: `e2e/support/commands.ts`

- [ ] **Step 1: Replace the file** with the existing `runCommand` plus the palette/suggest driver

```ts
import { $, browser } from "@wdio/globals";

// `commands` is part of Obsidian's runtime but not its public typings (same shape
// as the smoke test's `plugins` cast).
export async function runCommand(commandId: string): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { commands: { executeCommandById(id: string): boolean } };
    runtime.commands.executeCommandById(id);
  }, commandId);
}

// Obsidian's command palette and the plugin's own SuggestModals share one DOM shape:
// a `.prompt` with a text input and `.suggestion-item` rows. These helpers drive both.
const PROMPT = ".prompt";

// Open the palette through Obsidian's own built-in command id — the one sanctioned
// executeCommandById in slice B, as setup. The click path under test is the palette's own
// filter+choose: the palette omits commands whose check() returns false, which a direct
// executeCommandById of our command would bypass.
export async function openPalette(): Promise<void> {
  await runCommand("command-palette:open");
  await $(`${PROMPT} input`).waitForExist({ timeoutMsg: "command palette did not open" });
}

export async function promptType(text: string): Promise<void> {
  await $(`${PROMPT} input`).setValue(text);
}

export function promptItem(text: string): ReturnType<typeof $> {
  return $(`${PROMPT} .suggestion-item*=${text}`);
}

// Filter the active prompt to `text` and choose the matching suggestion. The palette lists a
// plugin command as "Journals: <name>", so the partial match survives the prefix.
export async function promptChoose(text: string): Promise<void> {
  await promptType(text);
  const item = promptItem(text);
  await item.waitForExist({ timeoutMsg: `prompt did not list "${text}"` });
  await item.click();
}

// A SuggestModal sets its own input placeholder; waiting on it distinguishes a freshly opened
// suggest from the palette prompt that just closed (both render as `.prompt`).
export async function waitForPrompt(placeholder: string): Promise<void> {
  await $(`${PROMPT} input[placeholder="${placeholder}"]`).waitForExist({
    timeoutMsg: `prompt with placeholder "${placeholder}" did not open`,
  });
}

export async function closePalette(): Promise<void> {
  await browser.keys("Escape");
  await $(PROMPT).waitForExist({ reverse: true, timeoutMsg: "command palette did not close" });
}

// Whether the palette lists `text` after filtering to it — the real check() gate, since the
// palette omits commands whose check() returns false. Opens, filters, reads once, closes.
export async function paletteLists(text: string): Promise<boolean> {
  await openPalette();
  await promptType(text);
  const present = await promptItem(text).isExisting();
  await closePalette();
  return present;
}
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `ReturnType<typeof $>` is rejected, it is the same `CellLocator` type alias used in `e2e/journeys/calendar.ts:5` — copy that form. If `isExisting()` types complain, it resolves to `Promise<boolean>` on a wdio element.)

- [ ] **Step 3: Commit**

```bash
git add e2e/support/commands.ts
git commit -m "test(e2e): add command-palette and suggest driver for slice B chunk 4"
```

---

## Task 2: Note-open / no-editor / active-note helpers — extend `support/vault.ts`

Add the command preconditions: open a note into an editor leaf (active editor + active file), tear all editors down (no active editor / no active file), and poll the active note path to an exact value.

**Files:**

- Modify: `e2e/support/vault.ts`

- [ ] **Step 1: Append the three helpers** at the end of `e2e/support/vault.ts`

```ts
// Opens a note in a markdown editor leaf — the active-editor / active-file precondition for
// the per-note command guards (insert-date-link, connect-note, open-next/prev).
export async function openNote(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (file instanceof obsidian.TFile) await app.workspace.getLeaf(false).openFile(file);
  }, path);
}

// Detaches every markdown editor leaf, leaving no active editor and no active file — the
// negative precondition for the editor / active-note command guards.
export async function closeAllLeaves(): Promise<void> {
  await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType("markdown"));
}

export function waitForActiveNote(path: string): Promise<void> {
  return waitForState(activeNotePath, (active) => active === path, `waited for ${path} to become the active note`);
}
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`waitForState` and `activeNotePath` are already imported/defined in this file; `browser`/`obsidian` are already in scope via the existing `executeObsidian` calls.)

- [ ] **Step 3: Commit**

```bash
git add e2e/support/vault.ts
git commit -m "test(e2e): add note-open, leaf-teardown, and active-note helpers"
```

---

## Task 3: Generic dialog drivers — extend `support/settings.ts`

The connect-note modal submits with **"Connect"** and the bulk-add modals with **"Continue"**/**"Run"**/**"Close"** — none of which `submitModal`/`deleteInModal` (hardcoded to Save/Delete) cover. Add a generic dialog-button click, a close-wait, and a single-toggle helper, all scoped through the existing private `activeModal()`.

**Files:**

- Modify: `e2e/support/settings.ts`

- [ ] **Step 1: Append the three helpers** at the end of `e2e/support/settings.ts`

```ts
// Click a button by text inside the active (non-settings) dialog. Unlike submitModal it does
// not wait for the dialog to close — multi-step dialogs (bulk-add) swap content in place, and
// closing callers wait explicitly via waitForDialogClosed.
export async function clickDialogButton(label: string): Promise<void> {
  await activeModal().$(`button=${label}`).click();
}

export async function waitForDialogClosed(): Promise<void> {
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "dialog did not close" });
}

// Click the dialog's sole checkbox toggle (UiToggle renders a .checkbox-container). Used by
// bulk-add to turn off the default dry-run; valid only when the dialog has exactly one toggle.
export async function toggleModalCheckbox(): Promise<void> {
  await activeModal().$(".checkbox-container").click();
}
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`activeModal` is already defined privately in this file.)

- [ ] **Step 3: Commit**

```bash
git add e2e/support/settings.ts
git commit -m "test(e2e): add generic dialog-button and toggle helpers"
```

---

## Task 4: `commands.e2e.ts` — insert-date-link (insert + check-absence)

Create the spec with a single `e2e-journeys` boot and a `before` that runtime-seeds every precondition note (editor note, a plain non-journal note, an unconnected note, and three indexed adjacent daily entries). Add the `insert date link` describe: the editor-cursor insert journey and the no-editor `check()` absence.

**Files:**

- Create: `e2e/journeys/commands.e2e.ts`

- [ ] **Step 1: Write the spec skeleton + the `insert date link` describe**

```ts
import { $, browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose, waitForPrompt } from "../support/commands.js";
import { editorValue } from "../support/editor.js";
import {
  closeAllLeaves,
  openNote,
  seedNote,
  waitForActiveNote,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";
import { clickDialogButton, selectModalSelect, waitForDialogClosed } from "../support/settings.js";

import { dayAnchor } from "./decorations.js";

// Slice B chunk 4 — the command-palette real-click seam. Each per-note command is check()-gated;
// the palette honors check() and only lists an available command, which executeCommandById (used
// by slices A/C/D) bypasses. None of this is reachable through __mocks__/obsidian.ts, which has no
// palette. Single boot; each it sets up its own active-leaf state, so order is irrelevant.

const INSERT = "Insert link to journal note";
const CONNECT = "Connect note to a journal";
const OPEN_NEXT = "Open next note";
const OPEN_PREV = "Open previous note";

// Far-future, fixed adjacents (the daily timeline is unbounded) — well clear of today's anchor
// (which connect-note attaches) so their next/prev neighbours never shift.
const NAV_PREV = "day/2030-03-10.md";
const NAV_MID = "day/2030-03-11.md";
const NAV_NEXT = "day/2030-03-12.md";

function dailyNote(anchor: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n`;
}

describe("commands", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    await seedNote("editor-note.md", "editor body\n");
    await seedNote("plain-note.md", "not a journal note\n");
    await seedNote("unconnected.md", "connect me\n");
    await seedNote(NAV_PREV, dailyNote("2030-03-10"));
    await seedNote(NAV_MID, dailyNote("2030-03-11"));
    await seedNote(NAV_NEXT, dailyNote("2030-03-12"));
    // The JournalsIndex registers entries off metadataCache; waiting on the parsed frontmatter
    // confirms the three adjacents are indexed before open-next/prev can resolve.
    await waitForJournalFrontmatter(NAV_PREV, { journal: "daily", date: "2030-03-10" });
    await waitForJournalFrontmatter(NAV_MID, { journal: "daily", date: "2030-03-11" });
    await waitForJournalFrontmatter(NAV_NEXT, { journal: "daily", date: "2030-03-12" });
  });

  describe("insert date link", () => {
    it("inserts a journal date link at the editor cursor", async () => {
      const anchor = dayAnchor(15);
      await openNote("editor-note.md");
      await openPalette();
      await promptChoose(INSERT);
      // 5 journals → the journal picker suggest opens first; pick the day journal.
      await waitForPrompt("Search journals");
      await promptChoose("daily");
      // Day picking shows the month view; click the in-month cell by its production data-anchor.
      await $(`.modal-container [data-testid="month-cell"][data-anchor="${anchor}"]`).click();

      await browser.waitUntil(async () => (await editorValue())?.includes(anchor) ?? false, {
        timeoutMsg: `editor never received a link containing ${anchor}`,
      });
    });

    it("is absent from the palette without an active editor", async () => {
      await closeAllLeaves();
      expect(await paletteLists(INSERT)).toBe(false);
    });
  });
});
```

(`CONNECT`/`OPEN_NEXT`/`OPEN_PREV`, `waitForFrontmatter`, `waitForActiveNote`, `clickDialogButton`/`selectModalSelect`/`waitForDialogClosed` are declared/imported now though first used in Tasks 5–6. If `eslint` flags any as unused at this step, trim and re-add them in the task that uses them.)

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `no-unused-vars` trips, trim the imports/consts this task doesn't use yet and re-add in Tasks 5–6.)

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: chunk-0/1/2/3 `it`s + the 2 insert `it`s pass. (A red insert means the journal picker didn't open — confirm there are 5 journals so the suggest is shown — or the month cell anchor isn't in the displayed month: `dayAnchor(15)` is the current month's 15th and the picker opens on today's month. A red absence means `closeAllLeaves` left an editor active — triage: detaching markdown leaves should null `activeEditor`; if Obsidian keeps a stale editor, open a non-editor leaf instead. Screenshots land in `e2e/.reports/screenshots/`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/commands.e2e.ts
git commit -m "test(e2e): assert insert-date-link inserts at the cursor and gates on an editor"
```

---

## Task 5: `commands.e2e.ts` — connect-note

Append the `connect note` describe: open the unconnected note, palette-invoke connect-note, pick the journal in the modal, submit, and assert the journal frontmatter attached.

**Files:**

- Modify: `e2e/journeys/commands.e2e.ts`

- [ ] **Step 1: Add the `connect note` describe** inside `describe("commands", …)`, after the `insert date link` describe

```ts
describe("connect note", () => {
  it("connects an unconnected note to a journal", async () => {
    await openNote("unconnected.md");
    await openPalette();
    await promptChoose(CONNECT);
    // ConnectNoteModal: the first <select> is the journal dropdown; the date defaults to today,
    // and rename/move default off, so the note stays in place and only gains frontmatter.
    await selectModalSelect("daily");
    await clickDialogButton("Connect");
    await waitForDialogClosed();

    await waitForFrontmatter(
      "unconnected.md",
      (fm) => fm.journal === "daily",
      "connect-note did not attach journal=daily frontmatter",
    );
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the connect `it` pass. (A red connect means the journal `<select>` value isn't `daily` — confirm `ConnectNoteModal`'s first control is the journal `UiDropdown` with option values = journal names — or the submit button text isn't "Connect". If the modal opened on the _disconnect_ branch, `unconnected.md` was already indexed as a journal note — confirm the seed has no journal frontmatter.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/commands.e2e.ts
git commit -m "test(e2e): assert connect-note attaches journal frontmatter via the palette"
```

---

## Task 6: `commands.e2e.ts` — open-next / open-prev + nav absence

Append the `navigate adjacent entries` describe: open the middle indexed entry and assert next/prev navigation, plus the non-journal-note `check()` absence (one behavior — navigation unavailable off-journal — verified across both commands).

**Files:**

- Modify: `e2e/journeys/commands.e2e.ts`

- [ ] **Step 1: Add the `navigate adjacent entries` describe** inside `describe("commands", …)`, after the `connect note` describe

```ts
describe("navigate adjacent entries", () => {
  it("opens the next adjacent journal entry", async () => {
    await openNote(NAV_MID);
    await openPalette();
    await promptChoose(OPEN_NEXT);
    await waitForActiveNote(NAV_NEXT);
  });

  it("opens the previous adjacent journal entry", async () => {
    await openNote(NAV_MID);
    await openPalette();
    await promptChoose(OPEN_PREV);
    await waitForActiveNote(NAV_PREV);
  });

  it("hides navigation commands on a non-journal note", async () => {
    await openNote("plain-note.md");
    expect(await paletteLists(OPEN_NEXT)).toBe(false);
    expect(await paletteLists(OPEN_PREV)).toBe(false);
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`OPEN_NEXT`/`OPEN_PREV`/`waitForActiveNote`/`NAV_*` are now all consumed.)

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 3 navigation `it`s pass. (A red open-next/prev means the middle note wasn't indexed before the palette opened — the `before` waits on all three adjacents' frontmatter, which gates index readiness; if still red, the index hooks a later event than metadataCache parse — add a poll on the command being listed. A red absence means `plain-note.md` resolved as a journal entry — confirm its seed has no journal frontmatter.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/commands.e2e.ts
git commit -m "test(e2e): assert open-next/prev navigation and off-journal gating"
```

---

## Task 7: `bulk-add.e2e.ts` — vault-scan + 2-modal

Create the bulk-add spec. It reaches `BulkAddFlow` through the **settings subpage button** (not the palette — see the correction above), runs the real two-modal flow with dry-run turned off, and asserts the real-vault scan's outcome: matching notes gain frontmatter; an unparseable note is skipped.

**Files:**

- Create: `e2e/journeys/bulk-add.e2e.ts`

- [ ] **Step 1: Write the spec**

```ts
import { $, browser, expect } from "@wdio/globals";

import {
  clickButton,
  clickDialogButton,
  closeSettings,
  openJournalSubpage,
  openSettings,
  setModalText,
  toggleModalCheckbox,
  waitForDialogClosed,
} from "../support/settings.js";
import { frontmatterOf, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

// Slice B chunk 4 — bulk-add is NOT a palette command: it is the header button on the journal
// edit subpage (m.bulk_add_command()), so the flow is reached through the chunk-3 settings SPA.
// The seam under test is the real-vault scan (BulkAddService.plan) + the two-modal write
// (process modal → BulkAddService.apply → saveData), which __mocks__/obsidian.ts can't drive.
// Single boot; each it scans its own folder so the accumulating connections stay independent.

const BULK_ADD = "Bulk add notes to this journal";

async function runBulkAdd(folder: string): Promise<void> {
  await openSettings();
  await openJournalSubpage("core", "daily");
  await clickButton(BULK_ADD);
  // Configure modal: the folder is the first text input; date format defaults to YYYY-MM-DD.
  await setModalText(folder);
  // With the combinator at "no", the dry-run toggle (default on) is the dialog's only checkbox;
  // turn it off so the run actually writes.
  await toggleModalCheckbox();
  await clickDialogButton("Continue");
  // The process modal opens after plan() scans the vault; Run commits the connections.
  await $("button=Run").waitForExist({ timeoutMsg: "bulk-add process modal did not open" });
  await clickDialogButton("Run");
}

describe("bulk add", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  afterEach(closeSettings);

  it("attaches journal frontmatter to every matching note in the source folder", async () => {
    await seedNote("bulk-match/2030-09-01.md", "first\n");
    await seedNote("bulk-match/2030-09-02.md", "second\n");

    await runBulkAdd("bulk-match");

    await waitForJournalFrontmatter("bulk-match/2030-09-01.md", { journal: "daily", date: "2030-09-01" });
    await waitForJournalFrontmatter("bulk-match/2030-09-02.md", { journal: "daily", date: "2030-09-02" });
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });

  it("leaves a note with no parseable date unconnected", async () => {
    await seedNote("bulk-skip/2030-10-05.md", "dated\n");
    await seedNote("bulk-skip/notes.md", "no date here\n");

    await runBulkAdd("bulk-skip");

    await waitForJournalFrontmatter("bulk-skip/2030-10-05.md", { journal: "daily", date: "2030-10-05" });
    expect((await frontmatterOf("bulk-skip/notes.md"))?.journal).toBeUndefined();
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: all prior `it`s + the 2 bulk-add `it`s pass. (A red "attaches" means the folder input wasn't set — confirm `FolderInput`'s `<input type="text">` is the modal's first text input — or dry-run stayed on (no write) — confirm `toggleModalCheckbox` hit the sole `.checkbox-container`. A red "leaves … unconnected" means `notes.md` matched anyway — confirm date-place defaults to title and `notes` has no `YYYY-MM-DD` form. If the process modal never showed "Run", `plan()` returned a `FolderNotFoundError` — confirm the seeded folder name matches the typed folder exactly.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/bulk-add.e2e.ts
git commit -m "test(e2e): assert bulk-add scans the vault and attaches matching notes"
```

---

## Task 8: Record the chunk-4 outcome + full verification sweep

Update the build-order doc with the realized chunk-4 layout and the bulk-add correction, then run every gate.

**Files:**

- Modify: `docs/e2e-slice-b-build-order.md`

- [ ] **Step 1: Replace the chunk-4 bullets** in `docs/e2e-slice-b-build-order.md` under `### Chunk 4 — Command palette + bulk-add` with the realized layout

```markdown
### Chunk 4 — Command palette + bulk-add

- **Correction:** bulk-add is **not** a palette command — it's the header button on the journal
  edit subpage (`JournalEditSubpage.vue`, `m.bulk_add_command()`), so `bulk-add.e2e.ts` reaches
  the flow through the chunk-3 settings SPA and reuses the `support/settings.ts` dialog driver.
  Only the per-note commands are palette-driven.
- **Support:** `support/commands.ts` grows a palette/suggest driver (`openPalette` via the
  built-in `command-palette:open`, `promptChoose`/`waitForPrompt`/`paletteLists` over the shared
  `.prompt` DOM); `support/vault.ts` gains `openNote`/`closeAllLeaves`/`waitForActiveNote`;
  `support/settings.ts` gains generic `clickDialogButton`/`waitForDialogClosed`/`toggleModalCheckbox`.
- **Fixture:** no `data.json` change — every precondition note (editor note, plain note,
  unconnected note, three indexed adjacents, bulk-add source folders) is runtime-seeded per spec
  (like `seedDecorationFixture`), so chunks 0–3 are untouched.
- **Specs:** `commands.e2e.ts` (single `e2e-journeys` boot): insert-date-link (insert + no-editor
  absence), connect-note, open-next/prev + off-journal absence — 6 `it`s; each asserts the real
  outcome (editor text / attached frontmatter / active note / palette listing). `bulk-add.e2e.ts`
  (single boot, per-`it` source folder): matching notes attach, an unparseable note is skipped —
  2 `it`s. The per-note commands are palette-driven precisely because the palette honors `check()`,
  which `executeCommandById` (slices A/C/D) bypasses.
- **Out of scope (deferred):** CI split (chunk 5); the insert-date-link single-journal auto-pick,
  connect-note override/rename/move toggles, and the bulk-add filter/decision branches (all
  jsdom-covered).
```

- [ ] **Step 2: Full static + unit gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all exit 0. (`npm test` is unchanged by this chunk — no production edit — but confirms nothing regressed.)

- [ ] **Step 3: Full e2e suite (no regression in A/C/D + green journeys)**

Run: `npm run test:e2e`
Expected: builds, boots Obsidian, all suites pass — `smoke`, `integration`, `migration`, `interop`, and `journeys`. The journeys suite is now chunk-0/1/2/3 + chunk-4 (6 command `it`s + 2 bulk-add `it`s). 0 failures.

- [ ] **Step 4: Confirm the chunk-4 surface shape**

Run: `ls e2e/journeys e2e/support && echo '---' && git diff --stat HEAD~7 -- e2e docs`
Expected: `e2e/journeys/` contains `commands.e2e.ts` + `bulk-add.e2e.ts` (alongside the chunk-0/1/2/3 files); the diffstat shows the `commands.ts`/`vault.ts`/`settings.ts` driver additions, the two new specs, and the build-order doc.

- [ ] **Step 5: Commit**

```bash
git add docs/e2e-slice-b-build-order.md
git commit -m "docs(e2e): record slice B chunk 4 command-palette and bulk-add layout"
```

---

## Self-review notes

- **Spec coverage (build-order chunk 4 + journeys-design `commands.e2e.ts` / `bulk-add.e2e.ts`):** insert-date-link insert + no-editor `check()` → Task 4; connect-note → Task 5; open-next/open-prev + off-journal `check()` → Task 6; bulk-add vault-scan + 2-modal (attach + skip) → Task 7. The palette/suggest driver (open built-in palette, filter, assert listed, choose) → Task 1; the editor/active-note preconditions → Task 2; the connect/bulk dialog drivers → Task 3. ✓
- **The bulk-add correction is load-bearing and surfaced** (header section + Task 7 header + Task 8 doc update): bulk-add is settings-subpage-driven, not palette-driven; only the per-note commands use the palette. ✓
- **`check()` is the seam, not incidental:** the two absence `it`s (no-editor insert, off-journal nav) assert the palette omits a gated command — the behavior `executeCommandById` bypasses and the justification for the palette path. ✓
- **Order-independence (single boot per spec):** `commands.e2e` — each `it` opens its own active leaf (editor-note / unconnected / NAV_MID / plain-note) or tears leaves down; the far-future adjacents (2030-03) never neighbour the connect-note today-anchor, so connect-note's mutation can't shift next/prev. `bulk-add.e2e` — each `it` scans its own folder (`bulk-match` / `bulk-skip`) with distinct anchors, so the accumulating daily connections stay independent; `afterEach(closeSettings)` resets the SPA. ✓
- **No production change / no fixture data.json change:** every command, guard, modal, and `BulkAddService` pre-exists and is jsdom-covered; every precondition note is runtime-seeded, so the shared `e2e-journeys` fixture (chunks 0–3) is untouched. ✓
- **Selector grounding:** palette/suggest pin `.prompt` input + `.suggestion-item*=<resolved name>` (partial match survives the "Journals: " prefix); the date picker pins the production `[data-testid="month-cell"][data-anchor]`; connect/bulk dialogs scope through the chunk-3 `activeModal()` (= the non-settings `.modal-container`); dialog buttons pin `button=<resolved label>` ("Connect"/"Continue"/"Run"/"Close"); the dry-run toggle pins the dialog's sole `.checkbox-container`. Every label resolved against `messages/en.json`. ✓
- **Reuse over new surface:** `dayAnchor` from `decorations.ts`, `waitForJournalFrontmatter`/`waitForFrontmatter`/`frontmatterOf`/`seedNote` from `vault.ts`, `selectModalSelect`/`openJournalSubpage`/`clickButton`/`openSettings`/`closeSettings` from `settings.ts` — chunk 4 adds only the genuinely missing helpers. ✓
- **Type/name consistency:** `openPalette`/`promptType`/`promptItem`/`promptChoose`/`waitForPrompt`/`closePalette`/`paletteLists` (Task 1) consumed by Tasks 4/6; `openNote`/`closeAllLeaves`/`waitForActiveNote` (Task 2) by Tasks 4/5/6; `clickDialogButton`/`waitForDialogClosed`/`toggleModalCheckbox` (Task 3) by Tasks 5/7. `promptItem` returns `ReturnType<typeof $>` (the `CellLocator` form in `calendar.ts`). ✓
- **No placeholders:** every helper body, spec `it`, command, and expected-output/triage note is fully written. ✓
- **Out of scope (intentional, deferred):** CI split (chunk 5); insert-date-link single-journal auto-pick (a 1-journal vault path; e2e-journeys has 5), connect-note override/rename/move toggles, bulk-add filters and per-note "ask" decision dropdowns — all jsdom-covered. ✓
