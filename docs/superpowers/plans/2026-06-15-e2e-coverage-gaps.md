# E2E Coverage Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified gaps in the wdio/Obsidian e2e suite by covering the runtime seams that fakes cannot validate — auto-create on boot, destructive bulk-add outcomes, connect move/rename, the confirm-creation modal, custom-interval index assignment, external settings reload, plugin re-enable, and custom first-day-of-week.

**Architecture:** Each gap is a black-box e2e spec that drives the _real_ Obsidian instance through its real seam (ribbon click, command palette, `obsidian://` URI handler, settings modal, or the plugin's `onExternalSettingsChange` hook) and asserts an observable outcome (a created/moved/deleted note's parsed frontmatter, persisted `data.json`, or rendered DOM). Features already exist and work; these specs _guard_ them. A new spec going green confirms the behavior; a spec going red is either a real regression (switch to `superpowers:systematic-debugging`) or a test-setup error — never silence it.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (one Obsidian boot per spec via `browser.reloadObsidian`), Mocha BDD, `browser.executeObsidian` for in-renderer state, the existing `e2e/support/*` helpers, and JSON fixtures under `e2e/fixtures/e2e-*`.

**Key facts established during investigation (do not re-derive):**

- `wdio-obsidian-service` boots each spec against a _per-boot copy_ of the fixture vault, so specs may mutate `data.json`/notes freely without dirtying the committed fixture.
- `AutoCreateService.initialize()` runs its first `#tick()` _immediately_ on boot (the `setTimeout` is only the midnight re-tick), so the boot-tick is observable with real time. The midnight re-tick stays unit-only (`auto-create.test.ts`).
- The ConnectNote modal renders the rename/move toggles **only when** the note's current folder/name differ from the configured destination, and renders an override toggle **only when** an occupant exists. `UiToggle` renders `.checkbox-container` with `aria-label={tooltip}`.
- The bulk-add **Configure** modal carries the occupant policy up front: a `<select aria-label="When a note is already connected to that date">` with values `skip` / `override` / `merge` / `ask`. Setting it there avoids the per-note process-modal pickers.
- Default journal `nameTemplate` is `"{{date}}"`; default index source is `{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1 }`.

**Non-goals (deliberately excluded — record, do not implement):**

- The midnight **re-tick** of auto-create — needs renderer time-mocking; already unit-covered.
- Decoration **offset** condition — cycle-relative, awkward to assert in the DOM, and covered by `engine-checks.test.ts`. (Task 10 covers `date` + `weekday`, which render distinctly.)
- Command **transition matrix** and URI **relative-date parsing** — pure functions, unit-covered; an e2e per permutation would be a wiring test.
- Full settings-form field breadth, decoration style editing — component-tested with testing-library.
- SelfWriteGuard e2e, community-Calendar interop, non-interactive v1→v2 migration — recorded prior decisions; intentionally absent.

---

## File Structure

**New support helpers (Task 1):**

- `e2e/support/plugin.ts` (create) — plugin lifecycle + external-reload drivers (`isPluginEnabled`, `disablePlugin`, `enablePlugin`, `triggerExternalSettingsChange`).
- `e2e/support/settings.ts` (modify) — add `selectModalDropdownByLabel`, `toggleNamedModalToggle`.
- `e2e/support/plugin-data.ts` (modify) — add `readRawSettings`, `writeRawSettings`.
- `e2e/support/vault.ts` (modify) — add `todayAnchor`.

**New fixtures:**

- `e2e/fixtures/e2e-auto-create/` (Task 2) — copy of `e2e-daily` with `daily.autoCreate = true`.
- `e2e/fixtures/e2e-confirm/` (Task 5) — copy of `e2e-daily` with `daily.confirmCreation = true`.
- `e2e/fixtures/e2e-custom/` (Task 6) — copy of `e2e-daily`, journals replaced with one custom `sprint` journal, numbering enabled.
- `e2e/fixtures/e2e-locale/` (Task 9) — copy of `e2e-journeys` with a custom calendar slice (`dow = 1`).

**New specs:**

- `e2e/integration/auto-create.e2e.ts` (Task 2)
- `e2e/journeys/confirm-creation.e2e.ts` (Task 5)
- `e2e/journeys/custom-interval.e2e.ts` (Task 6)
- `e2e/integration/settings-reload.e2e.ts` (Task 7)
- `e2e/integration/re-enable.e2e.ts` (Task 8)
- `e2e/journeys/calendar-locale.e2e.ts` (Task 9)

**Extended specs:**

- `e2e/journeys/bulk-add.e2e.ts` (Task 3) — add override + merge.
- `e2e/journeys/commands.e2e.ts` (Task 4) — add move+rename connect.
- `e2e/journeys/decorations.ts` + `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` (Task 10) — date + weekday conditions.

**Per-task verification commands** (specs are TypeScript; the quality gates apply):

- Lint/types on touched files: `npm run check:lint` and `npm run check:types`.
- Run one spec: `npm run build && npx wdio run ./wdio.conf.mts --spec <spec-path>`.
  The `npm run build` rebuilds the plugin bundle the harness loads. Specs-only changes still need it once (the harness loads `./build`), but a rebuild is cheap and safe — always include it.

---

## Task 1: Shared e2e support helpers

**Files:**

- Create: `e2e/support/plugin.ts`
- Modify: `e2e/support/settings.ts`
- Modify: `e2e/support/plugin-data.ts`
- Modify: `e2e/support/vault.ts`

- [ ] **Step 1: Create the plugin lifecycle helper**

Create `e2e/support/plugin.ts`:

```ts
import { browser } from "@wdio/globals";

// app.plugins is runtime-only (not in Obsidian's public typings), cast like commands.ts does.
const PLUGIN_ID = "journals";

export function isPluginEnabled(): Promise<boolean> {
  return browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { plugins: { enabledPlugins: Set<string> } };
    return runtime.plugins.enabledPlugins.has(id);
  }, PLUGIN_ID);
}

export async function disablePlugin(): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const runtime = app as unknown as { plugins: { disablePlugin(id: string): Promise<void> } };
    await runtime.plugins.disablePlugin(id);
  }, PLUGIN_ID);
}

export async function enablePlugin(): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const runtime = app as unknown as { plugins: { enablePlugin(id: string): Promise<void> } };
    await runtime.plugins.enablePlugin(id);
  }, PLUGIN_ID);
}

// Invoke the plugin's own onExternalSettingsChange hook — the exact entry point Obsidian Sync
// calls when data.json changes on disk. Drives SettingsService.reload() without a real Sync round trip.
export async function triggerExternalSettingsChange(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as {
      plugins: { plugins: Record<string, { onExternalSettingsChange?: () => void }> };
    };
    runtime.plugins.plugins[id]?.onExternalSettingsChange?.();
  }, PLUGIN_ID);
}
```

- [ ] **Step 2: Add dropdown + named-toggle drivers to settings.ts**

In `e2e/support/settings.ts`, append after `toggleModalCheckbox`:

```ts
// Select an <option> by value inside a specific UiDropdown in the open dialog, identified by its
// aria-label. Unlike selectModalSelect (first <select>), this disambiguates a modal with several
// dropdowns (the bulk-add configure modal's date-place / combinator / existing-note selects).
export async function selectModalDropdownByLabel(ariaLabel: string, value: string): Promise<void> {
  await activeModal().$(`select[aria-label="${ariaLabel}"]`).selectByAttribute("value", value);
}

// Toggle a specific UiToggle in the open dialog by its tooltip, which UiToggle renders as the
// .checkbox-container's aria-label. Needed when a modal has several toggles (connect-note's
// rename + move) that the single-checkbox toggleModalCheckbox cannot disambiguate.
export async function toggleNamedModalToggle(ariaLabel: string): Promise<void> {
  await activeModal().$(`.checkbox-container[aria-label="${ariaLabel}"]`).click();
}
```

- [ ] **Step 3: Add raw data.json IO to plugin-data.ts**

In `e2e/support/plugin-data.ts`, append (the module already defines `PLUGIN_DATA_PATH` and imports `browser`):

```ts
// Raw read/write of the persisted data.json, for the external-reload (Obsidian Sync) seam where a
// test simulates an out-of-band edit and then triggers the plugin's reload hook.
export function readRawSettings(): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app }, dataPath) => {
    if (!(await app.vault.adapter.exists(dataPath))) return undefined;
    return app.vault.adapter.read(dataPath);
  }, PLUGIN_DATA_PATH);
}

export async function writeRawSettings(raw: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, dataPath, body) => {
      await app.vault.adapter.write(dataPath, body);
    },
    PLUGIN_DATA_PATH,
    raw,
  );
}
```

- [ ] **Step 4: Add todayAnchor to vault.ts**

In `e2e/support/vault.ts`, append:

```ts
// Today's date as a YYYY-MM-DD anchor, computed in the Node test process. The runner and the
// Obsidian renderer share the machine's local date, so this matches the plugin's notion of today
// (modulo the midnight boundary, same assumption the decoration fixtures already rely on).
export function todayAnchor(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 5: Lint and type-check the helpers**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS (no errors in the new/modified support files).

- [ ] **Step 6: Commit**

```bash
git add e2e/support/plugin.ts e2e/support/settings.ts e2e/support/plugin-data.ts e2e/support/vault.ts
git commit -m "test(e2e): add plugin-lifecycle, modal-dropdown, raw-data, and today-anchor support helpers"
```

---

## Task 2: Auto-create boot-tick

**Files:**

- Create: `e2e/fixtures/e2e-auto-create/` (copied from `e2e-daily`, patched)
- Create: `e2e/integration/auto-create.e2e.ts`

- [ ] **Step 1: Create the fixture**

```bash
cp -r e2e/fixtures/e2e-daily e2e/fixtures/e2e-auto-create
python3 - <<'PY'
import json
p = "e2e/fixtures/e2e-auto-create/.obsidian/plugins/journals/data.json"
d = json.load(open(p))
d["journals"]["daily"]["autoCreate"] = True
json.dump(d, open(p, "w"), indent=2)
PY
```

- [ ] **Step 2: Write the spec**

Create `e2e/integration/auto-create.e2e.ts`:

```ts
import { browser } from "@wdio/globals";

import { todayAnchor, waitForJournalFrontmatter } from "../support/vault.js";

// AutoCreateService.initialize() fires its first tick immediately on boot (the setTimeout only
// schedules the midnight re-tick), so a journal with autoCreate=true must materialise today's note
// shortly after the plugin loads. This boot-time vault write is invisible to __mocks__/obsidian.ts;
// the midnight re-tick stays in auto-create.test.ts. The note is created but NOT opened, so we
// assert the parsed frontmatter at the expected path rather than the active file.
describe("auto-create", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-auto-create", plugins: ["journals"] });
  });

  it("creates today's note on boot for a journal with auto-create enabled", async () => {
    const today = todayAnchor();
    await waitForJournalFrontmatter(`day/${today}.md`, { journal: "daily", date: today });
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/integration/auto-create.e2e.ts`
Expected: PASS — "creates today's note on boot for a journal with auto-create enabled". If it fails because the note never appears, the auto-create boot-tick is broken — investigate with `superpowers:systematic-debugging`, do not weaken the assertion.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-auto-create e2e/integration/auto-create.e2e.ts
git commit -m "test(e2e): cover auto-create's boot-tick note creation"
```

---

## Task 3: Bulk-add override + merge

**Files:**

- Modify: `e2e/journeys/bulk-add.e2e.ts`

- [ ] **Step 1: Extend the imports and the runBulkAdd helper**

In `e2e/journeys/bulk-add.e2e.ts`, change the `../support/settings.js` import to add `selectModalDropdownByLabel`, and the `../support/vault.js` import to add `contentOf` and `waitForContent`. The full updated import block:

```ts
import { browser, expect } from "@wdio/globals";

import {
  clickButton,
  clickDialogButton,
  closeSettings,
  openJournalSubpage,
  openSettings,
  selectModalDropdownByLabel,
  setModalText,
  toggleModalCheckbox,
  waitForDialogClosed,
} from "../support/settings.js";
import { contentOf, frontmatterOf, seedNote, waitForContent, waitForJournalFrontmatter } from "../support/vault.js";
```

Replace the existing `runBulkAdd` function with this occupant-policy-aware version:

```ts
const EXISTING_LABEL = "When a note is already connected to that date";

async function runBulkAdd(folder: string, options: { existing?: "override" | "merge" } = {}): Promise<void> {
  await openSettings();
  await openJournalSubpage("core", "daily");
  await clickButton(BULK_ADD);
  await setModalText(folder);
  // Set the occupant policy up front in the configure modal so the process modal needs no per-note
  // picker (the per-note dropdown renders only when the policy is "ask").
  if (options.existing) {
    await selectModalDropdownByLabel(EXISTING_LABEL, options.existing);
  }
  // With the combinator at "no", the dry-run toggle (default on) is the dialog's only checkbox;
  // turn it off so the run actually writes.
  await toggleModalCheckbox();
  await clickDialogButton("Continue");
  await clickDialogButton("Run");
}
```

- [ ] **Step 2: Add the override test**

Inside the `describe("bulk add", ...)` block, after the existing `it("leaves a note with no parseable date unconnected", ...)`, add:

```ts
it("replaces the occupant when the override policy is chosen", async () => {
  // An occupant already owns the 2031-01-01 anchor; the source carries the same date elsewhere.
  await seedNote("day/2031-01-01.md", "---\njournal: daily\njournal-date: 2031-01-01\n---\noccupant\n");
  await waitForJournalFrontmatter("day/2031-01-01.md", { journal: "daily", date: "2031-01-01" });
  await seedNote("bulk-override/2031-01-01.md", "incoming\n");

  await runBulkAdd("bulk-override", { existing: "override" });

  // The source becomes the connected note for the anchor; the former occupant is disconnected.
  await waitForJournalFrontmatter("bulk-override/2031-01-01.md", { journal: "daily", date: "2031-01-01" });
  const occupantFm = await frontmatterOf("day/2031-01-01.md");
  expect(occupantFm?.journal).toBeUndefined();
  await clickDialogButton("Close");
  await waitForDialogClosed();
});

it("merges the source into the occupant and deletes the source when the merge policy is chosen", async () => {
  await seedNote("day/2031-02-01.md", "---\njournal: daily\njournal-date: 2031-02-01\n---\noccupant body\n");
  await waitForJournalFrontmatter("day/2031-02-01.md", { journal: "daily", date: "2031-02-01" });
  await seedNote("bulk-merge/2031-02-01.md", "merged source line\n");

  await runBulkAdd("bulk-merge", { existing: "merge" });

  // The occupant absorbs the source content; the source file is trashed.
  await waitForContent(
    "day/2031-02-01.md",
    (content) => content.includes("merged source line"),
    "occupant note did not absorb the merged source content",
  );
  const sourceFm = await frontmatterOf("bulk-merge/2031-02-01.md");
  expect(sourceFm).toBeUndefined();
  await clickDialogButton("Close");
  await waitForDialogClosed();
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/bulk-add.e2e.ts`
Expected: PASS — all four `it`s, including the two new ones. If override doesn't disconnect the occupant or merge doesn't delete the source, that is a real bulk-add bug — debug, don't relax the assertion.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/bulk-add.e2e.ts
git commit -m "test(e2e): cover bulk-add override and merge occupant policies"
```

---

## Task 4: Connect-note move + rename

**Files:**

- Modify: `e2e/journeys/commands.e2e.ts`

- [ ] **Step 1: Extend the imports**

In `e2e/journeys/commands.e2e.ts`, change the `../support/settings.js` import to add `toggleNamedModalToggle`, and the `../support/vault.js` import to add `frontmatterOf` and `todayAnchor`. The updated import lines:

```ts
import {
  clickDialogButton,
  selectModalSelect,
  toggleNamedModalToggle,
  waitForDialogClosed,
} from "../support/settings.js";
import {
  closeAllLeaves,
  frontmatterOf,
  openNote,
  seedNote,
  todayAnchor,
  waitForActiveNote,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";
```

- [ ] **Step 2: Add the move+rename test**

Inside `describe("connect note", ...)`, after the existing `it("connects an unconnected note to a journal", ...)`, add:

```ts
it("moves and renames the note into the journal when both options are enabled", async () => {
  // A loose note whose folder AND name differ from the daily destination, so the modal renders
  // both the rename and move toggles. No occupant exists at today's anchor, so no override toggle.
  await seedNote("inbox/loose-note.md", "move me\n");
  await openNote("inbox/loose-note.md");
  await openPalette();
  await promptChoose(CONNECT);
  await selectModalSelect("daily");
  await toggleNamedModalToggle("Rename file to match the journal");
  await toggleNamedModalToggle("Move file into the journal's folder");
  await clickDialogButton("Connect");
  await waitForDialogClosed();

  // The date defaults to today, so the destination is day/<today>.md; the original path is gone.
  const today = todayAnchor();
  await waitForJournalFrontmatter(`day/${today}.md`, { journal: "daily", date: today });
  expect(await frontmatterOf("inbox/loose-note.md")).toBeUndefined();
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/commands.e2e.ts`
Expected: PASS — all command tests, including the new move+rename one. If `day/<today>.md` never gains frontmatter or `inbox/loose-note.md` still exists, the connect move/rename path is broken — debug.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/commands.e2e.ts
git commit -m "test(e2e): cover connect-note move and rename options"
```

---

## Task 5: Confirm-creation modal

**Files:**

- Create: `e2e/fixtures/e2e-confirm/` (copied from `e2e-daily`, patched)
- Create: `e2e/journeys/confirm-creation.e2e.ts`

- [ ] **Step 1: Create the fixture**

```bash
cp -r e2e/fixtures/e2e-daily e2e/fixtures/e2e-confirm
python3 - <<'PY'
import json
p = "e2e/fixtures/e2e-confirm/.obsidian/plugins/journals/data.json"
d = json.load(open(p))
d["journals"]["daily"]["confirmCreation"] = True
json.dump(d, open(p, "w"), indent=2)
PY
```

- [ ] **Step 2: Write the spec**

Create `e2e/journeys/confirm-creation.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { clickDialogButton, waitForDialogClosed } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

// A journal with confirmCreation=true gates NoteCreationService.ensureNote behind a modal. Opening
// an entry via the journals:// URI routes through OpenJournalEntryFlow -> ensureNote, which opens
// the "Create a new journal note?" dialog before writing. Accepting creates the note; cancelling
// aborts (UserAborted) and leaves no file. Fixed future dates avoid any collision with today.
describe("confirm note creation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-confirm", plugins: ["journals"] });
  });

  it("creates the note when the confirmation is accepted", async () => {
    await openViaUri({ journal: "daily", date: "2030-07-15" });
    await clickDialogButton("Create");
    await waitForDialogClosed();
    await waitForJournalFrontmatter("day/2030-07-15.md", { journal: "daily", date: "2030-07-15" });
  });

  it("does not create the note when the confirmation is cancelled", async () => {
    await openViaUri({ journal: "daily", date: "2030-08-20" });
    await clickDialogButton("Cancel");
    await waitForDialogClosed();
    // Cancel maps to UserAborted before any write, so the file never exists.
    expect(await frontmatterOf("day/2030-08-20.md")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/confirm-creation.e2e.ts`
Expected: PASS — both `it`s. If the modal never opens (note created without confirmation), the confirmCreation gate is broken — debug.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-confirm e2e/journeys/confirm-creation.e2e.ts
git commit -m "test(e2e): cover the confirm-creation modal accept and cancel paths"
```

---

## Task 6: Custom-interval creation + index assignment

**Files:**

- Create: `e2e/fixtures/e2e-custom/` (copied from `e2e-daily`, journals replaced)
- Create: `e2e/journeys/custom-interval.e2e.ts`

- [ ] **Step 1: Create the fixture**

```bash
cp -r e2e/fixtures/e2e-daily e2e/fixtures/e2e-custom
python3 - <<'PY'
import json
p = "e2e/fixtures/e2e-custom/.obsidian/plugins/journals/data.json"
d = json.load(open(p))
d["journals"] = {
    "sprint": {
        "name": "sprint",
        "write": {"type": "custom", "every": "week", "duration": 2, "anchorDate": "2026-01-05"},
        "folder": "sprint",
        "dateFormat": "YYYY-MM-DD",
        "frontmatter": {
            "dateField": "journal-date",
            "startDateField": "journal-start-date",
            "endDateField": "journal-end-date",
            "addStartDate": False,
            "addEndDate": False,
        },
        "numbering": {
            "enabled": True,
            "anchorDate": "2026-01-05",
            "allowBefore": False,
            "sources": [
                {"variable": "index", "frontmatterKey": "journal-index", "anchorValue": 1, "reset": {"kind": "never"}}
            ],
        },
        "timeline": {"start": "", "end": {"kind": "never"}},
    }
}
json.dump(d, open(p, "w"), indent=2)
PY
```

- [ ] **Step 2: Write the spec**

Create `e2e/journeys/custom-interval.e2e.ts`:

```ts
import { browser } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import { waitForFrontmatter } from "../support/vault.js";

// A custom (2-week) journal with numbering enabled assigns a per-interval index on creation. The
// anchorDate 2026-01-05 is interval #1; the next interval starts 2026-01-19 (#2). Creating via the
// journals:// URI exercises NumberingService.compute + CycleService.countRepeats against the real
// vault and writes the index into journal-index frontmatter — the runtime seam the unit tests fake.
describe("custom interval note creation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-custom", plugins: ["journals"] });
  });

  it("assigns index 1 to a note created at the interval anchor", async () => {
    await openViaUri({ journal: "sprint", date: "2026-01-05" });
    await waitForFrontmatter(
      "sprint/2026-01-05.md",
      (fm) => fm.journal === "sprint" && fm["journal-date"] === "2026-01-05" && fm["journal-index"] === 1,
      "the sprint anchor note did not receive journal-index 1",
    );
  });

  it("assigns index 2 to the following interval", async () => {
    await openViaUri({ journal: "sprint", date: "2026-01-19" });
    await waitForFrontmatter(
      "sprint/2026-01-19.md",
      (fm) => fm["journal-index"] === 2,
      "the second sprint note did not receive journal-index 2",
    );
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/custom-interval.e2e.ts`
Expected: PASS — both `it`s. If `journal-index` is a string `"1"` rather than the number `1`, Obsidian parsed it as a string: change the predicate to compare `String(fm["journal-index"]) === "1"` / `"2"` and note it in the commit. If the index is wrong (not 1/2), the numbering/cycle computation is broken — debug.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-custom e2e/journeys/custom-interval.e2e.ts
git commit -m "test(e2e): cover custom-interval index assignment on note creation"
```

---

## Task 7: External settings reload (Obsidian Sync seam)

**Files:**

- Create: `e2e/integration/settings-reload.e2e.ts`

This spec reuses the `e2e-daily` fixture (a per-boot copy, so mutating its `data.json` is safe).

- [ ] **Step 1: Write the spec**

Create `e2e/integration/settings-reload.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";

// Obsidian Sync edits data.json on disk and calls the plugin's onExternalSettingsChange, which runs
// SettingsService.reload(): it re-reads data.json, refreshes reactive state in place, and emits
// "reloaded". DynamicCommandRegistry reconciles on that event. We add a uniquely-named command to
// data.json out of band, fire the hook, and assert the command palette now lists it — proving the
// reload -> reconcile -> register chain end to end. The fixture boot is a copy, so the disk edit is
// isolated to this run.
const NEW_COMMAND = "Reloaded open today";

describe("external settings reload", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("registers a command added to data.json after an external reload", async () => {
    expect(await paletteLists(NEW_COMMAND)).toBe(false);

    const raw = (await readRawSettings()) ?? "{}";
    const settings = JSON.parse(raw) as { commands?: Record<string, unknown> };
    settings.commands ??= {};
    settings.commands["cmd-reloaded"] = {
      name: NEW_COMMAND,
      icon: "calendar-days",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "day" },
      type: "same",
      context: "today",
    };
    await writeRawSettings(JSON.stringify(settings));
    await triggerExternalSettingsChange();

    await browser.waitUntil(async () => paletteLists(NEW_COMMAND), {
      timeoutMsg: "the reloaded command never appeared in the palette",
    });
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/integration/settings-reload.e2e.ts`
Expected: PASS — "registers a command added to data.json after an external reload". If the command never appears, the reload→reconcile chain is broken — debug.

- [ ] **Step 3: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/integration/settings-reload.e2e.ts
git commit -m "test(e2e): cover external settings reload re-registering commands"
```

---

## Task 8: Plugin disable → re-enable

**Files:**

- Create: `e2e/integration/re-enable.e2e.ts`

Reuses `e2e-journeys`, which ships an always-available command named "Editable command" (target all/day, context today) — present after any clean boot.

- [ ] **Step 1: Write the spec**

Create `e2e/integration/re-enable.e2e.ts`:

```ts
import { browser } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";
import { disablePlugin, enablePlugin, isPluginEnabled } from "../support/plugin.js";

// Disabling disposes the DI container (timers, watchers, registered commands/views); re-enabling
// runs onload again. A clean second boot must re-register the dynamic commands — if disposal leaked
// a binding or onload double-registered, the palette query is the observable that catches it. The
// "Editable command" lives in the e2e-journeys fixture and is unconditionally available.
const COMMAND = "Editable command";

describe("plugin re-enable", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("re-registers its commands after a disable/enable cycle", async () => {
    await disablePlugin();
    await browser.waitUntil(async () => !(await isPluginEnabled()), {
      timeoutMsg: "plugin did not disable",
    });

    await enablePlugin();
    await browser.waitUntil(async () => isPluginEnabled(), {
      timeoutMsg: "plugin did not re-enable",
    });

    await browser.waitUntil(async () => paletteLists(COMMAND), {
      timeoutMsg: "commands were not re-registered after re-enable",
    });
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/integration/re-enable.e2e.ts`
Expected: PASS — "re-registers its commands after a disable/enable cycle". A failure here often means a container-disposal/boot-cycle bug (the kind only e2e catches) — debug with `superpowers:systematic-debugging`.

- [ ] **Step 3: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/integration/re-enable.e2e.ts
git commit -m "test(e2e): cover plugin disable/re-enable re-registering commands"
```

---

## Task 9: Custom calendar first-day-of-week

**Files:**

- Create: `e2e/fixtures/e2e-locale/` (copied from `e2e-journeys`, patched)
- Create: `e2e/journeys/calendar-locale.e2e.ts`

`e2e-journeys` is the base because it is the proven calendar-rendering fixture (the "Open Calendar" ribbon mounts the month view there).

- [ ] **Step 1: Create the fixture**

```bash
cp -r e2e/fixtures/e2e-journeys e2e/fixtures/e2e-locale
python3 - <<'PY'
import json
p = "e2e/fixtures/e2e-locale/.obsidian/plugins/journals/data.json"
d = json.load(open(p))
# Custom locale: dow=1 starts the week on Monday. doy=4 keeps 1 <= 7+dow-doy <= 7 valid.
d["calendar"] = {"mode": "custom", "dow": 1, "doy": 4, "global": False}
json.dump(d, open(p, "w"), indent=2)
PY
```

- [ ] **Step 2: Write the spec**

Create `e2e/journeys/calendar-locale.e2e.ts`:

```ts
import { $, browser, expect } from "@wdio/globals";

import { LIVE_LEAF, openCalendarView } from "./view.js";

// calendar.mode=custom with dow=1 calls moment.updateLocale(week.dow=1) at boot (CalendarSettingsBridge),
// which rotates the weekday header so Monday leads. NotesMonthView builds its weekday labels from
// moment's localeData via .format("ddd"); the first .notes-month-view__weekday must read "Mon". This
// is a global moment-locale effect that a unit/component test cannot exercise through real rendering.
describe("calendar locale", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-locale", plugins: ["journals"] });
  });

  it("starts the week on Monday when the custom first-day-of-week is Monday", async () => {
    await openCalendarView();
    const firstWeekday = $(`${LIVE_LEAF} .notes-month-view__weekday`);
    await firstWeekday.waitForExist({ timeoutMsg: "the weekday header did not render" });
    expect(await firstWeekday.getText()).toBe("Mon");
  });
});
```

- [ ] **Step 3: Run the spec**

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/calendar-locale.e2e.ts`
Expected: PASS — first weekday header reads "Mon". If it reads "Sun", the custom dow did not reach moment's locale (the bridge/boot wiring regressed) — debug. If `openCalendarView` times out (no "Open Calendar" ribbon), the default view did not register for this fixture; confirm the copy retained the same shape as `e2e-journeys` and re-run.

- [ ] **Step 4: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-locale e2e/journeys/calendar-locale.e2e.ts
git commit -m "test(e2e): cover custom first-day-of-week calendar rendering"
```

---

## Task 10: Decoration date + weekday conditions

The existing decoration matrix (`e2e/journeys/decorations.ts`) covers title / tag / property / has-note / has-open-task / all-tasks-completed conditions and every style. It does **not** cover the two date-based conditions that render distinctly: `date` (a specific month/day) and `weekday` (a set of weekday indices). This task adds them to the `e2e-journeys` fixture's `daily` journal decorations and asserts them in the matrix. (The `offset` condition is intentionally left to `engine-checks.test.ts` per Non-goals.)

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`
- Modify: `e2e/journeys/decorations.ts`

- [ ] **Step 1: Inspect the existing daily decorations to match their shape**

Run:

```bash
python3 -c "import json; d=json.load(open('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json')); import pprint; pprint.pprint(d['journals']['daily'].get('decorations'))"
```

Expected: prints the array of existing decoration objects (each `{ mode, conditions: [...], styles: [...] }`). Read one entry to learn the exact `conditions`/`styles` field names and the corner style shape used elsewhere, so the two new decorations match it byte-for-byte.

- [ ] **Step 2: Append two date-based decorations to the daily journal**

Add two decorations to `daily.decorations`, each producing a top-left corner (the handle the matrix reads). The corner style and condition field names below are the verified shapes already used in this fixture (`src/decorations/config.ts:49-58,146-156`):

```bash
python3 - <<'PY'
import json
p = "e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json"
d = json.load(open(p))
daily = d["journals"]["daily"]
daily.setdefault("decorations", [])
corner = {"type": "corner", "placement": "top-left", "color": {"type": "custom", "color": "#ff0000"}}
daily["decorations"].append({
    "mode": "and",
    "conditions": [{"type": "date", "day": 4, "month": -1, "year": None}],  # the 4th of any month (month -1 = any)
    "styles": [corner],
})
daily["decorations"].append({
    "mode": "and",
    "conditions": [{"type": "weekday", "weekdays": [1]}],  # every Monday (0=Sun)
    "styles": [corner],
})
json.dump(d, open(p, "w"), indent=2)
PY
```

- [ ] **Step 3: Add the date-condition assertions to the matrix**

In `e2e/journeys/decorations.ts`, inside `assertDecorationMatrix`'s `describe("condition decorations", ...)`, add two tests. The date decoration marks the 4th of the visible month; the weekday decoration marks every Monday. Both are date-only (no seeded note needed), so the cell exists from mount and the corner appears once the engine runs:

```ts
it("decorates the configured day-of-month via the date condition", async () => {
  await surface.cell(dayAnchor(4)).$(".decoration-corner.top-left").waitForExist({
    timeoutMsg: "date-condition decoration did not render on the 4th",
  });
});

it("decorates a matching weekday via the weekday condition", async () => {
  // Find the first in-month Monday's day-of-month, then assert its cell carries the corner.
  const monday = firstMondayOfMonth();
  await surface.cell(dayAnchor(monday)).$(".decoration-corner.top-left").waitForExist({
    timeoutMsg: "weekday-condition decoration did not render on a Monday cell",
  });
});
```

Add this helper near `dayAnchor` in `decorations.ts`:

```ts
// The day-of-month of the first Monday in the current month — the weekday-condition test needs a
// concrete in-month day whose weekday is Monday (matching the [1] weekday decoration).
export function firstMondayOfMonth(): number {
  const now = new Date();
  for (let day = 1; day <= 7; day++) {
    if (new Date(now.getFullYear(), now.getMonth(), day).getDay() === 1) return day;
  }
  return 1;
}
```

- [ ] **Step 4: Run the affected decoration specs**

The matrix runs against both the view leaf and the timeline code block. Run the two specs that invoke `assertDecorationMatrix`:

Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/view.e2e.ts --spec ./e2e/journeys/code-blocks.e2e.ts`
Expected: PASS — including the two new condition tests on each surface. If a new test fails because the corner never renders, the condition did not parse (check Step 2 field names against the schema) or the date math missed the visible month — debug.

- [ ] **Step 5: Lint and type-check**

Run: `npm run check:lint && npm run check:types`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/journeys/decorations.ts e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(e2e): cover date and weekday decoration conditions"
```

---

## Final verification (after all tasks)

- [ ] **Run the full e2e suites touched by this plan**

Run: `npm run build && npx wdio run ./wdio.conf.mts --suite integration --suite journeys`
Expected: all specs PASS, including every new/extended one. (`smoke`, `migration`, `interop` are unaffected.)

- [ ] **Run the unit gates one last time**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS — confirms no support-helper or fixture change broke the unit build.

---

## Implementation deviations (recorded after execution — all reviewed + tests green)

The plan executed cleanly across all 10 tasks (commits `ae147939`..`3461b97b` on `v3-ai`); three spots differed from the text above and were verified during review:

- **Task 2 (auto-create) — note path:** the `e2e-daily` `daily` journal has no `folder`, so the note lands at the vault **root** (`<today>.md`), not `day/<today>.md`. The plan conflated it with the `e2e-journeys` `daily` (folder `day`). Spec asserts the root path.
- **Task 4 (connect move/rename) — date:** the preceding test in `commands.e2e.ts` already connects a note to **today's** daily anchor (same boot), occupying it and disabling Connect. The test uses a fixed free anchor `2030-05-01` (set via the modal's `<input type="date">`) instead of today, so destination is `day/2030-05-01.md`.
- **Task 10 — `weekday` condition descoped:** `weekdays:[1]` decorates every Monday in the visible month (nondeterministic) and would decorate the matrix's control cell (day 2) in any month where the 2nd is a Monday — an intermittent break of the existing "leaves a cell undecorated" assertion. Only the deterministic `date` condition (day 4, a free cell) was implemented; `weekday` joins `offset` in the Non-goals as unit-covered (`engine-checks.test.ts`).

Also: `frontmatterOf` returns `undefined` for a missing file, which the WebDriver wire serializes as `null` — deleted/absent-file assertions use `.toBeNull()` (Tasks 3, 4, 5), and `isPluginEnabled` checks `id in app.plugins.plugins` (the runtime-instance map) because Obsidian's `disablePlugin()` leaves `enabledPlugins` intact (Task 8).

## Self-Review notes (verified while writing)

- **Gap coverage:** Tier-1 (auto-create, bulk-add merge/override, connect move/rename) → Tasks 2/3/4. Tier-2 (confirm-creation, custom-interval index) → Tasks 5/6. Tier-3 (settings reload, calendar dow) → Tasks 7/9. Lifecycle (re-enable) → Task 8. Date/weekday decorations → Task 10. Offset condition and midnight re-tick are documented Non-goals, not omissions.
- **Type/name consistency:** helper names used in later tasks (`selectModalDropdownByLabel`, `toggleNamedModalToggle`, `triggerExternalSettingsChange`, `readRawSettings`/`writeRawSettings`, `todayAnchor`) are all defined in Task 1 with full code.
- **Modal label literals** are resolved English strings from `messages/en.json`: "Connect", "Create", "Cancel", "Rename file to match the journal", "Move file into the journal's folder", "When a note is already connected to that date", "Replace"/"Merge"/"Skip".
- **Determinism:** connect/auto-create use `todayAnchor()` (no occupant at today's daily note in those fixtures); confirm/custom use fixed future/anchor dates; decoration date/weekday use current-month day math matching the existing `dayAnchor` convention.
