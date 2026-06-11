# E2E Slice B — Chunk 3 (Settings SPA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the **settings subpage-nav SPA** seam — the `PluginSettingTab` Vue app, its `SettingsUiService` push/pop navigation, the per-entity dashboard blocks/subpages/modals, and the async `saveData` round-trip — by driving every config flow (journals, shelves, views, decorations, commands, nav-row) through real Obsidian and asserting **both** contract halves: the change persisted to `data.json` _and_ reflected in the DOM.

**Architecture:** A new cross-slice driver `support/settings.ts` opens the plugin's settings tab via `app.setting.open()/openTabById("journals")` (closing it resets the SPA stack through `PluginSettingTab.hide()`), and exposes thin functions to click icon buttons by `aria-label`, click text buttons, expand collapsible sections, and drive modals. `support/plugin-data.ts` grows a typed `StoredSettings` (views/commands + richer journal shape) and a generic `waitForSettings(predicate)` poller. Two specs — `settings.e2e.ts` (single `e2e-journeys` boot, nested `describe` per entity, every `it` on a **distinct** entity so in-memory `data.json` accumulation is order-independent) and `settings-first-journal.e2e.ts` (`e2e-empty` boot) — assert the flows.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers); Vue 3 SFC settings UI under test. Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**` via `tsconfig.e2e.json`), `npm run check:lint` (`eslint .`), `npm test` (vitest — unchanged here, no production edit), `npm run test:e2e -- --suite journeys` (builds plugin + boots real Obsidian).

**Verification model:** Chunk 3 makes **no production change** — every surface (the setting-tab mount, the SPA stack, each block/subpage/modal, `saveData`) already exists and is unit/component-covered for its jsdom-reachable parts. The e2e specs assert that existing behavior against real Obsidian; a red spec is a real finding (or a fixture/selector bug), not a missing feature. The fixture and helpers are test infrastructure → no tests of their own (repo convention); the specs are their net. Per-task fast gate = `check:types` + `check:lint`; behavioral confirmation = `npm run test:e2e -- --suite journeys`.

---

## Background facts (verified against live v3 source — do not re-derive)

- **Settings tab mount:** `PluginSettingTabAdapter extends PluginSettingTab` (`src/settings/ui/plugin-setting-tab.ts:10-41`). `display()` does `createApp(SettingsDashboard).mount(this.containerEl)`; `hide()` unmounts **and** calls `this.#ui.reset()` (clears the subpage stack). The plugin/tab id is `"journals"` (`manifest.json`). Open/select/close are runtime-only (not in Obsidian's public typings): `app.setting.open()`, `app.setting.openTabById("journals")`, `app.setting.close()` — cast `app as unknown as { setting: {...} }` exactly as `e2e/support/commands.ts` casts `app.commands`.
- **SPA navigation (`SettingsUiService`, `settings-ui-service.ts:15-64`):** a `ref` stack; `current === null` ⇒ dashboard, else the top subpage. `SettingsDashboard.vue:16-21`: when `current === null` it renders `<div class="journal-settings-dashboard">` with one `<component>` per registered block; otherwise it renders **only** the current subpage component (the `.journal-settings-dashboard` wrapper disappears). So `$(".journal-settings-dashboard")` existing ⇔ on the dashboard. Closing settings (`hide()` → `reset()`) returns the stack to the dashboard, so a per-test `afterEach(closeSettings)` + `beforeEach(openSettings)` starts every `it` at the dashboard.
- **Dashboard blocks (registration order):** shelves `order 4` (`ShelvesDashboardBlock`), journals `order 5` (`JournalsDashboardBlock`), commands `order 6` (`CommandsDashboardBlock`), views `order 7` (`ViewsDashboardBlock`) — plus calendar/logging/appearance blocks not under test. **`JournalsDashboardBlock` filters out journals already on a shelf** (`JournalsDashboardBlock.vue`: `.filter((index) => !shelvedNames.has(index.name))`). In `e2e-journeys` **all five journals are shelved**, so that block is empty and journals are reached **through their shelf** (the `+ Create new journal` control still renders in the block's `#controls` slot regardless).
- **UI primitives → DOM:**
  - `UiButton.vue:12-21` → native `<button :class="{'mod-cta':cta,'mod-warning':warning,...}" :aria-label="tooltip"><slot/></button>`. Text buttons (Save/Cancel/Delete/Add block/Add toolbar item) carry their label as **text content**; pin with `button=<text>`.
  - `UiIconButton.vue:12-16` → a `UiButton` (so a `<button>`) with **`aria-label` = the `tooltip` prop** and **no text** (icon only); pin with `button[aria-label="<tooltip>"]`. Row buttons embed the entity name in the tooltip, making the label unique across the page.
  - `UiTextInput.vue` → native `<input type="text">`; `UiDropdown.vue` → native `<select>` with `<option :value>` children; `UiToggle.vue` → `.checkbox-container` wrapping a checkbox; `UiSettingRow.vue` → `<div class="setting-item">` with `.setting-item-name` / `.setting-item-description` / `.setting-item-control`; `UiCollapsibleBlock.vue` → `<div class="collapsible-root">` with a `.collapsible-trigger` (the title text lives here) and a `.collapsible-content`.
- **Modals (`defineModal` → `VueModalHost extends Modal`):** render in Obsidian's `.modal-container`; the title text is set on `this.titleEl` (`.modal-title`); the Vue form mounts in `.modal-content`. Submit button text is `m.common_action_submit()` = **"Save"**; cancel = **"Cancel"**; destructive confirm = `m.common_action_delete()` = **"Delete"**. Field inputs are the same `Ui*` primitives.
- **i18n:** paraglide, `locales = ["en"]`, `baseLocale = "en"` (`src/i18n/paraglide/runtime.js`); `initLocale(getLanguage())` runs at `onload` (`src/main.ts`). Rendered text matches `messages/en.json`. Strings this chunk pins on (resolved):
  - Common: submit "Save", cancel "Cancel", delete "Delete", `common_delete_name` "Delete {name}".
  - Journals block: add tooltip `journal_create` "Create new journal"; row edit tooltip `${journal_dashboard_edit} ${name}` → "Edit {name}"; row delete `${common_action_delete} ${name}` → "Delete {name}"; empty `journal_dashboard_empty` "No journals created yet."; subpage rename `journal_edit_rename_tooltip` "Rename journal"; back `journal_edit_back_tooltip` "Back to list"; frontmatter section trigger `journal_edit_section_frontmatter` "Frontmatter"; date-field edit tooltip `journal_fm_field_label({field:"dateField"}) + " edit"` → "Date property name edit"; sequence section trigger `journal_edit_section_sequential_numbers` "Sequential numbers"; sequence edit tooltip `common_label_property_name + " edit"` → "Property name edit".
  - Shelves block: title `shelf_dashboard_section_title` "Journal shelves"; add `shelf_add` "Add shelf"; row open `shelf_dashboard_open({name})` → "Organize {name}"; row delete `common_delete_name` → "Delete {name}"; subpage rename `shelf_rename` "Rename shelf"; place-journal section pencil `shelf_section_place_tooltip` "Place on a shelf".
  - Views block: add `view_dashboard_add` "Add a view"; row open `view_dashboard_open({name})` → "Open {name}"; row delete `common_delete_name` → "Delete {name}"; subpage rename `view_rename` "Rename view"; blocks section `view_edit_blocks_title` "Blocks" (expanded by default); add-block button `view_add_block` "Add block"; add-toolbar button `view_add_toolbar_item` "Add toolbar item". The default view is named `common_label_calendar` "Calendar" with `showInRibbon: true` (`src/views/default-view.ts:24,27`).
  - Commands block: row edit tooltip `${command_edit} ${name}` → "Edit command {name}"; row delete `${command_delete} ${name}` → "Delete command {name}".
  - Nav block: section trigger `nav_block_section_title` "Navigation block"; row edit tooltip `block_rows_edit_tooltip` "Edit row".
  - Decorations: section trigger `decoration_section_title` "Calendar decorations"; row edit `decoration_edit` "Edit decoration"; row delete `decoration_delete` "Delete decoration".
- **Navigation depth:** journal subpage = dashboard → `Organize <shelf>` (shelf subpage) → `Edit <journal>` (journal subpage). Shelf subpage = dashboard → `Organize <shelf>`. View subpage = dashboard → `Open <view>` (or `Add a view`, which auto-pushes the new view's subpage via `ViewsDashboardBlock.add()`'s `.tap`). Commands/shelves/views rows live on the dashboard; journal-delete fires from the shelf subpage's `JournalList` row; decoration/nav-row/frontmatter/sequence/place fire from the journal subpage.
- **Collapsible defaults inside the journal subpage:** "Frontmatter", "Sequential numbers", "Calendar decorations" (`DecorationsSection.vue` order 50), "Navigation block" (`NavBlockRowsEditor.vue` order 40) are **collapsed by default** (`expanded`/`open` refs init `false`) — a test must click the `.collapsible-trigger` once to expand before the inner edit buttons exist. `JournalShelfSection` (order 5) is **not** a collapsible (renders a heading + a row directly), so the "Place on a shelf" pencil is immediately present. In the **view** subpage the "Blocks" collapsible is `blocksOpen = ref(true)` ⇒ **expanded by default**.
- **Sequence-edit gating (`JournalEditSubpage.vue`):** the property-name row + its pencil render only when `config.numbering.enabled && config.numbering.sources[0]`. The fixture journals all have `numbering:{enabled:false,sources:[]}`, so chunk 3 **seeds `numbering` on `monthly`** with one source (Task 2).
- **`data.json` shapes (verified):**
  - journals: `journals[<name>]` keyed by **name**; rename re-keys (old name key removed, new added). Fields touched: `frontmatter.dateField` (string), `numbering.sources[0].frontmatterKey` (string), `decorations[]` (each `{mode:"and"|"or",conditions,styles}`), `navBlock.rows[]` (each `{template,...}`).
  - shelves: `shelves[<name>]` keyed by name, `{name, journals: string[]}`; rename re-keys; place adds the journal name to the target shelf's `journals`.
  - views: `views[<uuid>]` keyed by **UUID `id`**, `{id,name,icon,defaultShelf,showInRibbon,leaf,blocks:[{id,key,config}]}`; toolbar items persist inside the `toolbar` block's `config.items[]`. The default view auto-seeds when the `views` key is absent (`views/config.ts` `{seed}`) — **do not** add a `views` key to the fixture, or the default (and chunk-0's ribbon path) breaks.
  - commands: `commands[<id>]` keyed by an arbitrary string id, `{name,icon,showInRibbon,openMode,target,type,context}`.
- **Fixture-mutation safety:** `e2e-journeys` is the **shared** fixture for chunks 0–2. Adding **journals** is forbidden (a 6th journal duplicates a write-type and breaks chunk-0's single-journal-per-kind cell-click). Adding **shelves** is safe (the calendar scopes by `shelf=null` = all journals regardless of shelf count; the chunk-1 shelf-menu test pins `core` by text). Enabling `numbering` on `monthly` adds a sequence badge to month cells but does **not** add/remove `.decoration-corner` markers or change computed decoration styles, so the chunk-1/2 decoration matrix is unaffected (triage note if a month-header assertion regresses). Adding `commands` is inert outside the settings boot. Runtime mutations (created views/journals during a run) write to the per-boot vault copy, not the on-disk fixture — they never leak across spec files.
- **Existing jsdom coverage (do not duplicate):** each block/subpage/modal has component tests (`SettingsDashboard.test.ts`, `ShelfEditSubpage.test.ts`, the flows' `*.flow.test.ts`, etc.) for its jsdom-reachable behavior. e2e asserts only the **real-Obsidian** seam: the setting-tab mount, the real click path through the SPA stack into the flows, and the async `saveData` round-trip.

---

## File end-state

**Create:**

- `e2e/support/settings.ts` — the cross-slice settings-SPA driver: `openSettings`/`closeSettings`, `onDashboard`, `clickIcon`/`clickButton`, `expandSection`, `openShelfSubpage`/`openJournalSubpage`/`goBack`, and the modal helpers `setModalText`/`selectModalSelect`/`submitModal`/`deleteInModal`. Plus the exported `DASHBOARD` selector constant.
- `e2e/journeys/settings.e2e.ts` — the chunk-3 settings specs (single `e2e-journeys` boot; nested `describe` per entity).
- `e2e/journeys/settings-first-journal.e2e.ts` — the empty-vault first-journal spec (`e2e-empty` boot).

**Modify:**

- `e2e/support/plugin-data.ts` — widen `StoredSettings` (views/commands + richer journal/shelf shape) and add the generic `waitForSettings(predicate, msg)` poller.
- `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json` — add two empty shelves (`rename-me`, `delete-me`), enable `numbering` on `monthly` (one source), and add a `commands` collection (`cmd-edit` → name "Editable command", `cmd-delete` → name "Disposable command").
- `docs/e2e-slice-b-build-order.md` — record the realized chunk-3 layout/outcome.

**Unchanged (already correct):** `wdio.conf.mts` (`journeys` glob `./e2e/journeys/**/*.e2e.ts` covers both new specs; `tsconfig.e2e` covers `e2e/**`); `e2e/support/{wait,vault}.ts` reused (`waitForState`, `seedNote`); the `e2e-empty` fixture reused as-is.

---

## Task 1: Widen `support/plugin-data.ts` for views/commands + add `waitForSettings`

Extend the persisted-settings reader so the specs can poll journals/shelves/views/commands through one typed object and one generic predicate poller. `readSettings` stays private; the new poller lives in the same module so it can reach it.

**Files:**

- Modify: `e2e/support/plugin-data.ts`

- [ ] **Step 1: Replace the `StoredSettings` interface** with the widened shape

Replace:

```ts
export interface StoredSettings {
  version?: number;
  journals?: Record<string, { name?: string }>;
  shelves?: Record<string, { name?: string }>;
}
```

with:

```ts
export interface StoredJournal {
  name?: string;
  frontmatter?: { dateField?: string };
  numbering?: { sources?: { frontmatterKey?: string }[] };
  decorations?: { mode?: string }[];
  navBlock?: { rows?: { template?: string }[] };
}

export interface StoredShelf {
  name?: string;
  journals?: string[];
}

export interface StoredViewBlock {
  key?: string;
  config?: { items?: unknown[] };
}

export interface StoredView {
  id?: string;
  name?: string;
  blocks?: StoredViewBlock[];
}

export interface StoredCommand {
  name?: string;
}

export interface StoredSettings {
  version?: number;
  journals?: Record<string, StoredJournal>;
  shelves?: Record<string, StoredShelf>;
  views?: Record<string, StoredView>;
  commands?: Record<string, StoredCommand>;
}
```

- [ ] **Step 2: Add the generic poller** at the end of the file

```ts
// Settings flows persist via debounced saveData, so the data.json change lands a tick
// after the modal closes — poll the parsed object until the predicate holds.
export function waitForSettings(predicate: (settings: StoredSettings) => boolean, timeoutMsg: string): Promise<void> {
  return waitForState(readSettings, predicate, timeoutMsg);
}
```

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (`journalNamesOf`/`journalKeysOf`/`shelfKeysOf`/`waitForSettingsVersion` still compile against the widened types — `name?` is unchanged on `StoredJournal`/`StoredShelf`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/support/plugin-data.ts
git commit -m "test(e2e): widen plugin-data settings shape and add waitForSettings poller"
```

---

## Task 2: Seed the fixture for chunk-3 settings flows

Add the entities the settings specs operate on, in shapes that don't collide with chunks 0–2: two empty shelves (rename/delete targets), `numbering` on `monthly` (to surface the sequence-edit row), and a two-command collection. **No new journals** (would break chunk-0's single-journal-per-kind grid).

**Files:**

- Modify: `e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json`

- [ ] **Step 1: Add the two empty shelves** — extend the `shelves` object (after `extra`, before the `}` that closes `shelves`)

```json
,
      "rename-me": { "name": "rename-me", "journals": [] },
      "delete-me": { "name": "delete-me", "journals": [] }
```

- [ ] **Step 2: Enable `numbering` on `monthly`** — replace the `monthly` journal's `numbering` block (currently `{"enabled": false, "anchorDate": "", "allowBefore": false, "sources": []}`) with:

```json
      "numbering": {
        "enabled": true,
        "anchorDate": "2026-01-01",
        "allowBefore": false,
        "sources": [
          { "variable": "index", "frontmatterKey": "journal-index", "anchorValue": 1, "reset": { "kind": "never" } }
        ]
      }
```

(If `check:types`/the boot rejects the `sources[0]` shape, open `src/journals/config.ts`'s `numberingSource` schema and match its field-for-field default — the variable/frontmatterKey/anchorValue/reset keys above mirror the agentic survey; the only load-bearing field for the test is `frontmatterKey`.)

- [ ] **Step 3: Add the `commands` collection** — add a top-level `commands` key (sibling of `journals`/`shelves`)

```json
  "commands": {
    "cmd-edit": {
      "name": "Editable command",
      "icon": "calendar-days",
      "showInRibbon": false,
      "openMode": "active",
      "target": { "kind": "all", "writeType": "day" },
      "type": "same",
      "context": "today"
    },
    "cmd-delete": {
      "name": "Disposable command",
      "icon": "calendar-days",
      "showInRibbon": false,
      "openMode": "active",
      "target": { "kind": "all", "writeType": "day" },
      "type": "same",
      "context": "today"
    }
  }
```

- [ ] **Step 4: Sanity-check the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json','utf8')); console.log('ok')"`
Expected: prints `ok`. (A stray/missing comma prints a `SyntaxError` with the byte offset.)

- [ ] **Step 5: Confirm chunks 0–2 stay green with the fixture changes**

Run: `npm run test:e2e -- --suite journeys`
Expected: the existing chunk-0/1/2 `it`s still pass. The new shelves are inert in the calendar (shelf=null scope) and the chunk-1 shelf-menu text-pins `core`; `numbering` on `monthly` adds a sequence badge but no decoration markers; `commands` is unused by the view/code-block specs. (If a month-header decoration assertion regresses, the numbering badge is interfering — move `numbering` onto a journal whose header isn't asserted, or seed it on a fresh path; record the finding.)

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/e2e-journeys/.obsidian/plugins/journals/data.json
git commit -m "test(e2e): seed shelves, monthly numbering, and commands for slice B chunk 3"
```

---

## Task 3: Settings-SPA driver — `e2e/support/settings.ts`

The cross-slice driver: open/close the tab (close resets the SPA stack), navigate the dashboard→subpage stack by clicking real DOM, and drive modals. All plain functions (no page-object class — repo convention).

**Files:**

- Create: `e2e/support/settings.ts`

- [ ] **Step 1: Write `e2e/support/settings.ts`**

```ts
import { $, browser } from "@wdio/globals";

const PLUGIN_ID = "journals";
const MODAL = ".modal-container";

// The dashboard wrapper renders only when the SPA stack is empty (current === null);
// entering a subpage replaces it with the subpage component, so its presence is the
// "am I on the dashboard?" signal.
export const DASHBOARD = ".journal-settings-dashboard";

// Open the plugin's settings tab. Obsidian calls PluginSettingTab.display(), which mounts
// the SettingsDashboard Vue app. open()/openTabById are runtime-only (cast like commands.ts).
export async function openSettings(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
    setting.open();
    setting.openTabById(id);
  }, PLUGIN_ID);
  await $(DASHBOARD).waitForExist({ timeoutMsg: "settings dashboard did not mount" });
}

// Close settings. PluginSettingTab.hide() runs SettingsUiService.reset(), so the next
// openSettings() starts at the dashboard root with an empty subpage stack.
export async function closeSettings(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    (app as unknown as { setting: { close(): void } }).setting.close();
  });
}

// UiIconButton has no text — its tooltip is the aria-label. Row buttons embed the entity
// name, so the label is unique page-wide.
export async function clickIcon(label: string): Promise<void> {
  await $(`button[aria-label="${label}"]`).click();
}

// UiButton renders its label as text content (Save / Add block / a picker option, ...).
export async function clickButton(text: string): Promise<void> {
  await $(`button=${text}`).click();
}

// Journal-subpage sections are collapsed by default; one click on the trigger expands.
// The title text lives on the .collapsible-trigger element; partial match keeps it stable
// against the trailing flair count.
export async function expandSection(title: string): Promise<void> {
  await $(`.collapsible-trigger*=${title}`).click();
}

export async function goBack(): Promise<void> {
  await clickIcon("Back to list");
}

export async function openShelfSubpage(shelf: string): Promise<void> {
  await clickIcon(`Organize ${shelf}`);
}

// Journals are all shelved in e2e-journeys, so a journal subpage is reached through its
// shelf: dashboard → Organize <shelf> → Edit <journal>.
export async function openJournalSubpage(shelf: string, journal: string): Promise<void> {
  await openShelfSubpage(shelf);
  await clickIcon(`Edit ${journal}`);
}

// Set the first text input in the open modal (the primary field — name/template/new-name).
export async function setModalText(value: string): Promise<void> {
  await $(`${MODAL} input[type="text"]`).setValue(value);
}

// Pick an <option> by its value in the modal's first <select> (journal type, shelf, ...).
export async function selectModalSelect(value: string): Promise<void> {
  await $(`${MODAL} select`).selectByAttribute("value", value);
}

export async function submitModal(): Promise<void> {
  await $(MODAL).$("button=Save").click();
  await $(MODAL).waitForExist({ reverse: true, timeoutMsg: "modal did not close after Save" });
}

export async function deleteInModal(): Promise<void> {
  await $(MODAL).$("button=Delete").click();
  await $(MODAL).waitForExist({ reverse: true, timeoutMsg: "modal did not close after Delete" });
}
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `selectByAttribute` types complain, it is `selectByAttribute(attribute, value)` on a `<select>` element locator — confirm against `@wdio/globals`. `waitForExist({ reverse: true })` is the documented "wait until gone" form.)

- [ ] **Step 3: Commit**

```bash
git add e2e/support/settings.ts
git commit -m "test(e2e): add settings-SPA driver for slice B chunk 3"
```

---

## Task 4: `settings.e2e.ts` — Journals flows (5)

Create the spec with the single `e2e-journeys` boot and the `journals` describe: add (dashboard `+`), rename + edit-frontmatter (via `core`), delete + edit-sequence (via `extra`). Each `it` targets a **distinct** journal so order doesn't matter.

**Files:**

- Create: `e2e/journeys/settings.e2e.ts`

- [ ] **Step 1: Write the spec skeleton + the journals describe**

```ts
import { $, browser, expect } from "@wdio/globals";

import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  DASHBOARD,
  clickButton,
  clickIcon,
  closeSettings,
  deleteInModal,
  expandSection,
  goBack,
  openJournalSubpage,
  openSettings,
  openShelfSubpage,
  selectModalSelect,
  setModalText,
  submitModal,
} from "../support/settings.js";

// Slice B chunk 3 — the settings subpage-nav SPA. The PluginSettingTab mounts a Vue app
// whose navigation is a SettingsUiService push/pop stack; no __mocks__/obsidian.ts setting
// tab exists. Each it asserts both contract halves: the change persisted to data.json
// (poll, saveData is async) and reflected in the DOM. Entities are distinct per it, so the
// single boot's accumulating data.json is order-independent.

describe("settings", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });
  beforeEach(openSettings);
  afterEach(closeSettings);

  describe("journals", () => {
    it("adds a journal from the dashboard and shows its row", async () => {
      await clickIcon("Create new journal");
      await setModalText("Added journal");
      await selectModalSelect("day");
      await submitModal();

      await waitForSettings(
        (s) => "Added journal" in (s.journals ?? {}),
        "added journal was not persisted to data.json",
      );
      await expect($(DASHBOARD).$(".setting-item-name*=Added journal")).toExist();
    });

    it("renames a journal and re-keys it in data.json", async () => {
      await openJournalSubpage("core", "weekly");
      await clickIcon("Rename journal");
      await setModalText("weekly-renamed");
      await submitModal();

      await waitForSettings(
        (s) => "weekly-renamed" in (s.journals ?? {}) && !("weekly" in (s.journals ?? {})),
        "journal rename did not re-key data.json",
      );
    });

    it("deletes a journal and removes it from data.json", async () => {
      await openShelfSubpage("extra");
      await clickIcon("Delete quarterly");
      await deleteInModal();

      await waitForSettings((s) => !("quarterly" in (s.journals ?? {})), "deleted journal still present in data.json");
    });

    it("edits the date-property frontmatter field and persists it", async () => {
      await openJournalSubpage("core", "daily");
      await expandSection("Frontmatter");
      await clickIcon("Date property name edit");
      await setModalText("custom-date");
      await submitModal();

      await waitForSettings(
        (s) => s.journals?.daily?.frontmatter?.dateField === "custom-date",
        "frontmatter dateField change not persisted",
      );
    });

    it("edits the sequence property name and persists it", async () => {
      await openJournalSubpage("extra", "monthly");
      await expandSection("Sequential numbers");
      await clickIcon("Property name edit");
      await setModalText("seq-index");
      await submitModal();

      await waitForSettings(
        (s) => s.journals?.monthly?.numbering?.sources?.[0]?.frontmatterKey === "seq-index",
        "sequence property name change not persisted",
      );
    });
  });
});
```

(`getSettings`, `clickButton`, `goBack` are imported now though first used in Tasks 6–7. If `eslint` flags them as unused, remove them here and re-add in the task that uses them.)

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `no-unused-vars` trips on `getSettings`/`clickButton`/`goBack`, trim the import to the symbols this task uses and re-add the rest in Tasks 6–7.)

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: chunk-0/1/2 `it`s + the 5 journals `it`s pass. (A red `add` means the type select value isn't `day` or the name input wasn't found — confirm the modal's first `input[type=text]` is the name field. A red `rename` means rename didn't re-key — confirm the journal collection is name-keyed. A red `edit-sequence` means the numbering seed (Task 2) didn't surface the property-name row — confirm `numbering.enabled` + `sources[0]`. Screenshots land in `e2e/.reports/screenshots/`.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/settings.e2e.ts
git commit -m "test(e2e): assert journal settings flows persist through the SPA"
```

---

## Task 5: `settings.e2e.ts` — Shelves flows (3)

Append the `shelves` describe: rename (`rename-me`), delete (`delete-me`), place-journal (place `yearly` onto `core` from the journal subpage). Distinct entities; `place` moves `yearly` off `extra` but no other `it` navigates to `yearly`.

**Files:**

- Modify: `e2e/journeys/settings.e2e.ts`

- [ ] **Step 1: Add the `shelves` describe** inside `describe("settings", …)`, after the `journals` describe

```ts
describe("shelves", () => {
  it("renames a shelf and re-keys it in data.json", async () => {
    await openShelfSubpage("rename-me");
    await clickIcon("Rename shelf");
    await setModalText("rename-done");
    await submitModal();

    await waitForSettings(
      (s) => "rename-done" in (s.shelves ?? {}) && !("rename-me" in (s.shelves ?? {})),
      "shelf rename did not re-key data.json",
    );
  });

  it("deletes a shelf and removes it from data.json", async () => {
    await clickIcon("Delete delete-me");
    await deleteInModal();

    await waitForSettings((s) => !("delete-me" in (s.shelves ?? {})), "deleted shelf still present in data.json");
  });

  it("places a journal onto a shelf and records it on the target", async () => {
    await openJournalSubpage("extra", "yearly");
    await clickIcon("Place on a shelf");
    await selectModalSelect("core");
    await submitModal();

    await waitForSettings(
      (s) => (s.shelves?.core?.journals ?? []).includes("yearly"),
      "placed journal not recorded on the target shelf",
    );
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 3 shelves `it`s pass. (A red `delete` may mean `delete-me` carried journals and the modal showed a "move to" step before the Delete button — the fixture seeds it empty, so confirm Task 2. A red `place` means the `PlaceJournalModal` select had no `core` option — confirm the dropdown lists shelf names by value.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/settings.e2e.ts
git commit -m "test(e2e): assert shelf settings flows persist through the SPA"
```

---

## Task 6: `settings.e2e.ts` — Views flows (4)

Append the `views` describe: rename + delete operate on dedicated views created in-test via "Add a view" (add auto-pushes the new view's subpage); add-block + add-toolbar-item operate on the auto-seeded default "Calendar" view (which carries a `toolbar` block) with count-delta assertions (order-independent).

**Files:**

- Modify: `e2e/journeys/settings.e2e.ts`

- [ ] **Step 1: Add a `viewIdByName` helper** near the top of the file (after the imports, before the top `describe`)

```ts
// Views are UUID-keyed; the specs know views by name, so resolve the id from the persisted
// settings before/after a flow.
function viewIdByName(views: Record<string, { name?: string }> | undefined, name: string): string | undefined {
  return Object.keys(views ?? {}).find((id) => views?.[id]?.name === name);
}
```

- [ ] **Step 2: Add the `views` describe** inside `describe("settings", …)`, after the `shelves` describe

```ts
describe("views", () => {
  it("renames a view and persists the new name", async () => {
    await clickIcon("Add a view");
    await setModalText("rename-view-src");
    await submitModal();
    // Add auto-pushes the new view's subpage; rename from its header.
    await clickIcon("Rename view");
    await setModalText("rename-view-done");
    await submitModal();

    await waitForSettings((s) => viewIdByName(s.views, "rename-view-done") !== undefined, "view rename not persisted");
  });

  it("deletes a view and removes it from data.json", async () => {
    await clickIcon("Add a view");
    await setModalText("delete-view-src");
    await submitModal();
    await goBack();
    await clickIcon("Delete delete-view-src");
    await deleteInModal();

    await waitForSettings(
      (s) => viewIdByName(s.views, "delete-view-src") === undefined,
      "deleted view still present in data.json",
    );
  });

  it("adds a block to the default calendar view", async () => {
    const calId = viewIdByName((await getSettings()).views, "Calendar");
    const before = (await getSettings()).views?.[calId!]?.blocks?.length ?? 0;

    await clickIcon("Open Calendar");
    await clickButton("Add block");
    await clickButton("Week calendar");

    await waitForSettings(
      (s) => (s.views?.[calId!]?.blocks?.length ?? 0) === before + 1,
      "added block not persisted to the default view",
    );
  });

  it("adds a toolbar item to the default calendar view's toolbar block", async () => {
    const calId = viewIdByName((await getSettings()).views, "Calendar")!;
    const toolbarItems = (s: typeof storedAfter): number => {
      const tb = (s.views?.[calId]?.blocks ?? []).find((b) => b.key === "toolbar");
      return tb?.config?.items?.length ?? 0;
    };
    const storedAfter = await getSettings();
    const before = toolbarItems(storedAfter);

    await clickIcon("Open Calendar");
    await clickButton("Add toolbar item");
    await clickButton("Period buttons");

    await waitForSettings((s) => toolbarItems(s) === before + 1, "added toolbar item not persisted");
  });
});
```

> Simplify the toolbar-item `it` if the `typeof storedAfter` self-reference reads awkwardly to the type-checker — inline the item-count read instead:
>
> ```ts
> it("adds a toolbar item to the default calendar view's toolbar block", async () => {
>   const calId = viewIdByName((await getSettings()).views, "Calendar")!;
>   const itemCount = (views: Record<string, import("../support/plugin-data.js").StoredView> | undefined): number => {
>     const tb = (views?.[calId]?.blocks ?? []).find((b) => b.key === "toolbar");
>     return tb?.config?.items?.length ?? 0;
>   };
>   const before = itemCount((await getSettings()).views);
>   await clickIcon("Open Calendar");
>   await clickButton("Add toolbar item");
>   await clickButton("Period buttons");
>   await waitForSettings((s) => itemCount(s.views) === before + 1, "added toolbar item not persisted");
> });
> ```
>
> Use whichever passes `check:types` cleanly; the inlined `import("...").StoredView` form avoids the self-referential type.

- [ ] **Step 3: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 4: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 4 views `it`s pass. (A red `add block` means the picker option text isn't "Week calendar" or the default view name isn't "Calendar" — confirm `m.common_label_calendar` and the block label. A red `add toolbar item` means the default view lacks a `toolbar` block (it shouldn't — `default-view.ts` seeds one) or the picker label isn't "Period buttons". A red `rename`/`delete` means "Add a view" didn't push/return the new view's subpage — confirm `ViewsDashboardBlock.add()`'s `.tap` push.)

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/settings.e2e.ts
git commit -m "test(e2e): assert view settings flows persist through the SPA"
```

---

## Task 7: `settings.e2e.ts` — Decorations (2), Commands (2), Nav-row (1)

Append the remaining describes. Decorations + nav-row fire from the `daily` journal subpage (distinct sub-targets: decoration mode edits index 0, decoration delete removes the last row, nav-row edits the template — none collide with each other or with the Task-4 `daily` frontmatter edit). Commands fire from the dashboard.

**Files:**

- Modify: `e2e/journeys/settings.e2e.ts`

- [ ] **Step 1: Add the `decorations` describe** inside `describe("settings", …)`, after the `views` describe

```ts
describe("decorations", () => {
  it("edits a decoration's match mode and persists it", async () => {
    await openJournalSubpage("core", "daily");
    await expandSection("Calendar decorations");
    // The first decoration row's edit pencil; multiple rows share the tooltip, so take the
    // first. The EditDecorationModal's first <select> is the and/or mode.
    await $('button[aria-label="Edit decoration"]').click();
    await $(".modal-container select").selectByAttribute("value", "or");
    await $(".modal-container").$("button=Save").click();
    await $(".modal-container").waitForExist({ reverse: true, timeoutMsg: "decoration modal did not close" });

    await waitForSettings(
      (s) => s.journals?.daily?.decorations?.[0]?.mode === "or",
      "decoration mode change not persisted",
    );
  });

  it("deletes a decoration and shrinks the list in data.json", async () => {
    const before = (await getSettings()).journals?.daily?.decorations?.length ?? 0;
    await openJournalSubpage("core", "daily");
    await expandSection("Calendar decorations");
    // Delete the LAST decoration row so the index doesn't collide with the edit test's index 0.
    const trash = await $$('button[aria-label="Delete decoration"]');
    await trash[trash.length - 1].click();
    await deleteInModal();

    await waitForSettings(
      (s) => (s.journals?.daily?.decorations?.length ?? 0) === before - 1,
      "decoration delete not persisted",
    );
  });
});
```

- [ ] **Step 2: Add the `commands` describe** (after `decorations`)

```ts
describe("commands", () => {
  it("edits a command's name and persists it", async () => {
    await clickIcon("Edit command Editable command");
    await setModalText("Renamed command");
    await submitModal();

    await waitForSettings(
      (s) => Object.values(s.commands ?? {}).some((c) => c.name === "Renamed command"),
      "command name change not persisted",
    );
  });

  it("deletes a command and removes it from data.json", async () => {
    await clickIcon("Delete command Disposable command");
    await deleteInModal();

    await waitForSettings(
      (s) => !Object.values(s.commands ?? {}).some((c) => c.name === "Disposable command"),
      "deleted command still present in data.json",
    );
  });
});
```

- [ ] **Step 3: Add the `navigation block row` describe** (after `commands`)

```ts
describe("navigation block row", () => {
  it("edits a nav block row template and persists it", async () => {
    await openJournalSubpage("core", "daily");
    await expandSection("Navigation block");
    await clickIcon("Edit row");
    // The EditNavBlockRowModal's first text input is the template field.
    await setModalText("{{date}} edited");
    await submitModal();

    await waitForSettings(
      (s) => s.journals?.daily?.navBlock?.rows?.[0]?.template === "{{date}} edited",
      "nav row template change not persisted",
    );
  });
});
```

- [ ] **Step 4: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0. (If `$$(...)` returns a type without numeric indexing, `await $$(...)` resolves to an array of elements in this wdio build — confirm against the chunk-1 usage of `$$`; otherwise use `(await $$(sel).getElements())`.)

- [ ] **Step 5: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: previous `it`s + the 2 decoration + 2 command + 1 nav-row `it`s pass. (A red decoration-edit means the modal's first `<select>` isn't the mode dropdown — confirm `EditDecorationModal.vue`'s first `UiDropdown`. A red command-edit means the first modal `input[type=text]` isn't the name field (the `UiIconSuggest` may also render an input — confirm name renders before icon). A red nav-row-edit means the first text input isn't the template — confirm field order in `EditNavBlockRowModal.vue`.)

- [ ] **Step 6: Commit**

```bash
git add e2e/journeys/settings.e2e.ts
git commit -m "test(e2e): assert decoration, command, and nav-row settings flows persist"
```

---

## Task 8: `settings-first-journal.e2e.ts` — empty-vault first journal (1)

The empty→first-journal path on the `e2e-empty` boot: the dashboard shows the empty state, "Create new journal" → modal → Save persists the journal and replaces the empty state with its row.

**Files:**

- Create: `e2e/journeys/settings-first-journal.e2e.ts`

- [ ] **Step 1: Write the spec**

```ts
import { $, browser, expect } from "@wdio/globals";

import { waitForSettings } from "../support/plugin-data.js";
import {
  DASHBOARD,
  clickIcon,
  openSettings,
  selectModalSelect,
  setModalText,
  submitModal,
} from "../support/settings.js";

// Slice B chunk 3 — first-journal-from-empty. e2e-empty has no journals (views auto-seed
// the default calendar view at onload); the dashboard renders the empty state until the
// first journal is created through the Add-journal modal.
describe("first journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-empty", plugins: ["journals"] });
  });

  it("creates the first journal from an empty vault and replaces the empty state", async () => {
    await openSettings();
    await expect($(DASHBOARD).$(".setting-item-description*=No journals created yet")).toExist();

    await clickIcon("Create new journal");
    await setModalText("My first journal");
    await selectModalSelect("day");
    await submitModal();

    await waitForSettings((s) => "My first journal" in (s.journals ?? {}), "first journal not persisted to data.json");
    await expect($(DASHBOARD).$(".setting-item-name*=My first journal")).toExist();
  });
});
```

- [ ] **Step 2: Gates**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Run the journeys suite**

Run: `npm run test:e2e -- --suite journeys`
Expected: all prior `it`s + the 1 first-journal `it` pass. (A red empty-state means the empty text differs — confirm `m.journal_dashboard_empty` = "No journals created yet.". A red persist means `e2e-empty` didn't enable the plugin — confirm `plugins: ["journals"]` and that `journals` is declared in `wdio.conf.mts`'s plugin list. A boot error means `e2e-empty` lacks an `.obsidian` config — Obsidian creates defaults, but if the boot hangs, copy a minimal `.obsidian/community-plugins.json` like the other fixtures.)

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/settings-first-journal.e2e.ts
git commit -m "test(e2e): assert first-journal creation from an empty vault"
```

---

## Task 9: Record the chunk-3 outcome + full verification sweep

Update the build-order doc with the realized chunk-3 layout, then run every gate.

**Files:**

- Modify: `docs/e2e-slice-b-build-order.md`

- [ ] **Step 1: Replace the chunk-3 bullets** in `docs/e2e-slice-b-build-order.md` under `### Chunk 3 — Settings SPA (independent seam)` with the realized layout

```markdown
### Chunk 3 — Settings SPA (independent seam)

- **Fixture +:** two empty shelves (`rename-me`/`delete-me`), `numbering` enabled on
  `monthly` (one source, to surface the sequence-edit row), and a `commands` collection
  (`cmd-edit`/`cmd-delete`). **No new journals** — a 6th would duplicate a write-type and
  break chunk-0's single-journal-per-kind cell-click. Views are left to auto-seed (adding a
  `views` key would suppress the default view and chunk-0's ribbon path).
- **Support:** `support/settings.ts` (open/close the tab — close resets the SPA stack via
  `hide()`; click-by-aria-label / by-text; expand collapsibles; navigate dashboard→shelf→
  journal; drive modals) + a widened `support/plugin-data.ts` (`StoredSettings` views/commands
  shape + a generic `waitForSettings` poller).
- **Specs:** `settings.e2e.ts` (single `e2e-journeys` boot; per-`it` distinct entity so the
  accumulating `data.json` is order-independent; per-`it` open/close resets to the dashboard):
  journals (add/rename/delete/edit-frontmatter/edit-sequence), shelves (rename/delete/place),
  views (rename/delete/add-block/add-toolbar-item), decorations (edit/delete), commands
  (edit/delete), nav-row (edit) — 17 `it`s. Plus `settings-first-journal.e2e.ts` (`e2e-empty`
  boot, 1 `it`). Every `it` asserts both halves: persisted `data.json` (polled) + DOM.
- **Surface note:** journals are all shelved in `e2e-journeys`, so the `JournalsDashboardBlock`
  list is empty and journal subpages are reached through `Organize <shelf>` → `Edit <journal>`;
  the block's `+ Create new journal` control still renders for the add flow.
```

- [ ] **Step 2: Full static + unit gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all exit 0. (`npm test` is unchanged by this chunk — no production edit — but confirms nothing regressed.)

- [ ] **Step 3: Full e2e suite (no regression in A/C/D + green journeys)**

Run: `npm run test:e2e`
Expected: builds, boots Obsidian, all suites pass — `smoke`, `integration`, `migration`, `interop`, and `journeys`. The journeys suite is now chunk-0/1/2 + chunk-3 (17 settings `it`s + 1 first-journal `it`). 0 failures.

- [ ] **Step 4: Confirm the chunk-3 surface shape**

Run: `ls e2e/journeys e2e/support && echo '---' && git diff --stat HEAD~8 -- e2e docs`
Expected: `e2e/journeys/` contains `settings.e2e.ts` + `settings-first-journal.e2e.ts` (alongside the chunk-0/1/2 files); `e2e/support/` contains `settings.ts`; the diffstat shows the fixture edit, `plugin-data.ts` widening, the two new specs, the new driver, and the build-order doc.

- [ ] **Step 5: Commit**

```bash
git add docs/e2e-slice-b-build-order.md
git commit -m "docs(e2e): record slice B chunk 3 settings-SPA layout and outcome"
```

---

## Self-review notes

- **Spec coverage (build-order chunk 3 + journeys-design `settings.e2e.ts` / `settings-first-journal.e2e.ts`):** journals add/rename/delete/edit-frontmatter/edit-sequence → Task 4; shelves edit-name/delete/place-journal → Task 5; views edit-name/delete/add-block/add-toolbar-item → Task 6; decorations edit/delete + commands edit/delete + nav-row edit → Task 7; empty→first-journal → Task 8. "open settings tab via API, navigate the subpage SPA, poll persisted data.json, read list rows" → Tasks 1+3 (`waitForSettings` poll, DOM row reads, SPA navigation helpers). ✓
- **Order-independence (single boot, accumulating data.json):** every `it` targets a distinct entity — journals: `Added journal` (new), `weekly` (rename), `quarterly` (delete), `daily` (frontmatter), `monthly` (sequence); shelves: `rename-me`, `delete-me`, place `yearly`→`core`; views: in-test `rename-view-src`/`delete-view-src` + the default `Calendar` (add-block/add-toolbar via count-delta); decorations: `daily` index-0 mode (edit) vs last-row (delete) — non-overlapping indices; commands: `Editable command` (edit) vs `Disposable command` (delete); nav-row: `daily` row-0 template. `daily` hosts four non-colliding sub-edits (frontmatter / decoration mode[0] / decoration delete-last / navBlock row[0]). `place yearly→core` doesn't strand any other test's navigation (`extra` keeps `quarterly`+`monthly`; `core` keeps `daily`+`weekly`). ✓
- **Per-`it` SPA reset:** `beforeEach(openSettings)` + `afterEach(closeSettings)` — `hide()` runs `SettingsUiService.reset()`, so each `it` starts at the dashboard regardless of where the previous one left the stack. ✓
- **Fixture-mutation safety vs chunks 0–2:** only shelves (inert in shelf=null scope; chunk-1 menu text-pins `core`), `monthly` numbering (sequence badge, not a decoration marker), and `commands` (unused outside settings) are added — verified no-journal-addition (would break chunk-0 cell-click); Task 2 Step 5 re-runs chunks 0–2 as the regression net. ✓
- **Selector grounding:** icon buttons pin `button[aria-label="<verified tooltip>"]` (UiIconButton → UiButton `:aria-label`); text buttons pin `button=<verified label>` (UiButton slot text); collapsibles `*=` partial-text on `.collapsible-trigger`; modals scoped to `.modal-container`; rows read via `.setting-item-name`/`.setting-item-description`. Every label resolved against `messages/en.json`. ✓
- **No production change:** every surface pre-exists and is jsdom-covered for its reachable parts; specs assert only the real-Obsidian SPA-mount + real-click + async-`saveData` seam. ✓
- **No placeholders:** every helper body, fixture object, spec `it`, command, and expected-output/triage note is fully written. The one design alternative (Task 6's toolbar-item count read) is spelled out both ways with a pick-what-type-checks instruction. ✓
- **Type/name consistency:** `StoredSettings`/`StoredView`/`StoredJournal` (Task 1) consumed by the spec predicates (Tasks 4–8) and `viewIdByName`; `openSettings`/`closeSettings`/`clickIcon`/`clickButton`/`expandSection`/`goBack`/`openShelfSubpage`/`openJournalSubpage`/`setModalText`/`selectModalSelect`/`submitModal`/`deleteInModal`/`DASHBOARD` (Task 3) match every import in Tasks 4–8; `waitForSettings`/`getSettings` reused from `plugin-data.ts`; fixture command/shelf/numbering shapes match the verified valibot schemas. ✓
- **Out of scope (intentional, deferred):** command-palette + bulk-add (chunk 4), CI split (chunk 5); add-view/clone-view, view icon/shelf/ribbon/leaf field edits, decoration condition/style internals, command field internals beyond name, nav-row fields beyond template (all jsdom-covered); shelf "move journals to" on delete (the fixture seeds empty shelves). ✓
