import { $, $$, browser, expect } from "@wdio/globals";

import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  clickModalToggleOption,
  closeSettings,
  deleteInModal,
  dismissDialogs,
  expandSection,
  goBack,
  openJournalSubpage,
  openSettings,
  openShelfSubpage,
  pickModalIcon,
  selectModalOption,
  selectModalSelect,
  setModalText,
  submitModal,
  submitOverlaidModal,
  toggleSettingRow,
  waitForModalOpen,
} from "../support/settings.js";
import { seedNote, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

import type { StoredView } from "../support/plugin-data.js";

// Views are UUID-keyed; the specs know views by name, so resolve the id from the persisted
// settings before/after a flow.
function viewIdByName(views: Record<string, { name?: string }> | undefined, name: string): string | undefined {
  return Object.keys(views ?? {}).find((id) => views?.[id]?.name === name);
}

// The Calendar view has two toolbar blocks; their items, concatenated in block order, are the
// ordered strip the editor renders one frame per. Each item carries a stable id used to assert
// the persisted drag reorder.
function calendarToolbarItems(views: Record<string, StoredView> | undefined): { id: string }[] {
  const calId = viewIdByName(views, "Calendar") ?? "";
  const toolbars = (views?.[calId]?.blocks ?? []).filter((block) => block.key === "toolbar");
  return toolbars.flatMap((toolbar) => (toolbar?.config?.items ?? []) as { id: string }[]);
}

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

  // Dismiss any dialog a failing test left open before closing settings, so one failure can't
  // shadow every later test's modal (activeModal resolves the first .modal-container).
  afterEach(async () => {
    await dismissDialogs();
    await closeSettings();
  });

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
      // AddJournalFlow pushes the new journal's edit subpage on success, so the dashboard is
      // gone; the subpage heading row's name carries the journal name.
      await expect($(".setting-item-name*=Added journal")).toExist();
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
      // Same as the shelf case: the re-key must not bounce the user off the journal's page.
      await expect($('button[aria-label="Rename journal"]')).toExist();
      await expect($(".setting-item-name*=weekly-renamed")).toExist();
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
      await clickIcon("Edit date property name");
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
      await clickIcon("Edit sequential number property name");
      await setModalText("seq-index");
      await submitModal();

      await waitForSettings(
        (s) => s.journals?.monthly?.numbering?.sources?.[0]?.frontmatterKey === "seq-index",
        "sequence property name change not persisted",
      );
    });
  });

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
      // Re-keying invalidates the nav frame's shelf name, so the page has to follow the rename
      // instead of falling back to the dashboard. The rename pencil only exists on the subpage.
      await expect($('button[aria-label="Rename shelf"]')).toExist();
      await expect($(".setting-item-name*=rename-done")).toExist();
    });

    it("deletes a shelf and removes it from data.json", async () => {
      await clickIcon("Delete delete-me");
      await deleteInModal();

      await waitForSettings((s) => !("delete-me" in (s.shelves ?? {})), "deleted shelf still present in data.json");
    });

    it("moves the deleted shelf's journals onto the chosen destination", async () => {
      await clickIcon("Delete spill-me");
      await selectModalSelect("catch-me");
      await deleteInModal();

      await waitForSettings(
        (s) => (s.shelves?.["catch-me"]?.journals ?? []).includes("sprint"),
        "deleted shelf's journal was not moved to the destination shelf",
      );
    });

    it("places a journal onto a shelf and records it on the target", async () => {
      await openJournalSubpage("extra", "yearly");
      await expandSection("Shelf");
      await clickIcon("Place on a shelf");
      await selectModalSelect("core");
      await submitModal();

      await waitForSettings(
        (s) => (s.shelves?.core?.journals ?? []).includes("yearly"),
        "placed journal not recorded on the target shelf",
      );
    });
  });

  describe("views", () => {
    // The add modal's icon field is a UiIconSuggest, whose popup overlays the dialog: only a real
    // Obsidian run proves the suggestion click commits the icon and that the CTA underneath is
    // still reachable afterwards. The picked icon diverges from the one a view gets by default,
    // so the assertion fails if the modal's choice never reaches ViewsService.create.
    it("creates a view with the icon picked in the add modal", async () => {
      await clickIcon("Add a view");
      await setModalText("icon-pick-view");
      await pickModalIcon("lucide-book-open");
      await submitModal();

      await waitForSettings(
        (s) => s.views?.[viewIdByName(s.views, "icon-pick-view") ?? ""]?.icon === "lucide-book-open",
        "icon chosen in the add-view modal was not persisted",
      );
    });

    it("renames a view and persists the new name", async () => {
      await clickIcon("Add a view");
      await setModalText("rename-view-src");
      await submitModal();
      // Add auto-pushes the new view's subpage; rename from its header.
      await clickIcon("Rename view");
      await setModalText("rename-view-done");
      await submitModal();

      await waitForSettings(
        (s) => viewIdByName(s.views, "rename-view-done") !== undefined,
        "view rename not persisted",
      );
    });

    it("deletes a view and removes it from data.json", async () => {
      await clickIcon("Add a view");
      await setModalText("delete-view-src");
      await submitModal();
      await goBack();
      await expandSection("Views");
      await clickIcon("Delete delete-view-src");
      await deleteInModal();

      await waitForSettings(
        (s) => viewIdByName(s.views, "delete-view-src") === undefined,
        "deleted view still present in data.json",
      );
    });

    it("adds a block to the default calendar view", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar");
      const before = initial.views?.[calId ?? ""]?.blocks?.length ?? 0;

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await clickIcon("Add block");
      await clickIcon("Add Week calendar");
      // Adding a configurable block auto-opens its config editor; this test is about the add, so
      // decline the initial configuration and let the block keep its defaults.
      await waitForModalOpen();
      await dismissDialogs();

      await waitForSettings(
        (s) => (s.views?.[calId ?? ""]?.blocks?.length ?? 0) === before + 1,
        "added block not persisted to the default view",
      );
    });

    it("auto-opens the config editor when a configurable block is added", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar") ?? "";
      const lastBlockWeeks = (views: Record<string, StoredView> | undefined): string | undefined => {
        const blocks = views?.[calId]?.blocks ?? [];
        return (blocks.at(-1) as { config?: { weeks?: string } } | undefined)?.config?.weeks;
      };

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await clickIcon("Add block");
      await clickIcon("Add Week calendar");

      // Configuring through the auto-opened editor — never touching the row's edit pencil — must
      // reach the block that was just added, so assert a value that differs from its default.
      await waitForModalOpen();
      await selectModalSelect("right");
      await submitOverlaidModal();

      await waitForSettings(
        (s) => lastBlockWeeks(s.views) === "right",
        "config submitted through the auto-opened editor not persisted",
      );
    });

    it("adds a toolbar item to the default calendar view's toolbar block", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar") ?? "";
      const itemCount = (views: Record<string, StoredView> | undefined): number => {
        const tb = (views?.[calId]?.blocks ?? []).find((b) => b.key === "toolbar");
        return tb?.config?.items?.length ?? 0;
      };
      const before = itemCount(initial.views);

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await clickIcon("Add toolbar item");
      await clickIcon("Add Period buttons");
      await submitOverlaidModal();

      await waitForSettings((s) => itemCount(s.views) === before + 1, "added toolbar item not persisted");
    });

    it("auto-opens the config editor when a configurable toolbar item is added", async () => {
      const initial = await getSettings();
      const before = calendarToolbarItems(initial.views).length;

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      const adders = await $$('button[aria-label="Add toolbar item"]').getElements();
      await adders.at(-1)?.click();
      await clickIcon("Add Period buttons");

      await waitForModalOpen();

      // Close it so it does not pollute the next test.
      await submitOverlaidModal();

      // Persist before the next test reads getSettings(); without this the next test's `before`
      // baseline would be stale (missing this item), causing its count assertion to fail.
      await waitForSettings(
        (s) => calendarToolbarItems(s.views).length === before + 1,
        "auto-opened config item not persisted",
      );
    });

    it("edits a toolbar button's behavior and persists the new mode", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar") ?? "";
      const toolbarItems = (views: Record<string, StoredView> | undefined): { key?: string; config?: unknown }[] => {
        const tbs = (views?.[calId]?.blocks ?? []).filter((b) => b.key === "toolbar");
        return tbs.flatMap((tb) => (tb?.config?.items ?? []) as { key?: string; config?: unknown }[]);
      };
      const lastButtonMode = (views: Record<string, StoredView> | undefined): string | undefined => {
        const buttons = toolbarItems(views).filter((i) => i.key === "button");
        const config = buttons.at(-1)?.config as { action?: { mode?: string } } | undefined;
        return config?.action?.mode;
      };
      const before = toolbarItems(initial.views).length;

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      // Two toolbar blocks each render an "Add toolbar item" button; add to the last strip so the
      // new item is globally last — matching the last edit button and last-button reads below.
      const adders = await $$('button[aria-label="Add toolbar item"]').getElements();
      await adders.at(-1)?.click();
      await clickIcon("Add Pick date");
      // The explicit edit below then changes the mode. Same icon-suggest overlay issue as above:
      // fire the click programmatically to bypass it.
      await $(".modal-container:not(:has(.mod-settings)) button.mod-cta").waitForExist({
        timeoutMsg: "config editor Save button did not appear",
      });
      await browser.execute(() => {
        document.querySelector<HTMLElement>(".modal-container:not(:has(.mod-settings)) button.mod-cta")?.click();
      });
      await $(".modal-container:not(:has(.mod-settings))").waitForExist({
        reverse: true,
        timeoutMsg: "config editor did not close after Save",
      });
      await waitForSettings(
        (s) => toolbarItems(s.views).length === before + 1 && lastButtonMode(s.views) === "navigate",
        "added pick-date button not persisted",
      );

      // Multiple toolbar items carry the edit button; the one just added is last. The button is
      // pointer-events:none until its frame is hovered, and this harness's pointer Actions can't
      // hover (see the drag test below), so fire the click programmatically on the last one.
      await browser.execute(() => {
        const editButtons = [...document.querySelectorAll<HTMLElement>('button[aria-label="Edit toolbar item"]')];
        editButtons.at(-1)?.click();
      });
      // The button editor renders the Journal dropdown before the mode dropdown, so target the
      // <select> that actually carries the "create" mode rather than the modal's first one.
      await selectModalOption("create");
      await submitModal();

      await waitForSettings((s) => lastButtonMode(s.views) === "create", "edited button mode not persisted");
    });

    it("edits a block's config and persists the change", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar") ?? "";
      const lastBlock = (
        views: Record<string, StoredView> | undefined,
      ): { key?: string; config?: { weeks?: string } } | undefined => {
        const blocks = views?.[calId]?.blocks ?? [];
        return blocks.at(-1) as { key?: string; config?: { weeks?: string } } | undefined;
      };

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await clickIcon("Add block");
      await clickIcon("Add Week calendar");
      // Decline the auto-opened config editor: this test edits through the row's edit pencil.
      await waitForModalOpen();
      await dismissDialogs();
      await waitForSettings((s) => {
        const block = lastBlock(s.views);
        return block?.key === "week-calendar" && block.config?.weeks === "default";
      }, "added week-calendar block not persisted");

      // Edit buttons show only for blocks with a config editor; the one just added is last.
      const editButtons = await $$('button[aria-label="Edit block"]').getElements();
      await editButtons.at(-1)?.click();
      await selectModalSelect("right");
      await submitModal();

      await waitForSettings((s) => lastBlock(s.views)?.config?.weeks === "right", "edited block config not persisted");
    });

    it("renders real component previews inside the toolbar editor strip", async () => {
      // Earlier view flows in this shared boot add toolbar items to the same Calendar view, so the
      // count is read from persisted settings rather than hardcoded to the seeded eight.
      const initial = await getSettings();
      const itemCount = calendarToolbarItems(initial.views).length;
      expect(itemCount).toBeGreaterThanOrEqual(8);

      await expandSection("Views");
      await clickIcon("Configure Calendar");

      // The editor mounts one frame per persisted item.
      await browser.waitUntil(async () => (await $$(".jv-item-frame").length) === itemCount, {
        timeoutMsg: "toolbar editor did not mount one frame per persisted item",
      });

      // WYSIWYG previews render the REAL toolbar-item components: button / period-buttons items
      // each render genuine <button>s inside their preview, so at least one must be present.
      expect(await $$(".jv-item-frame .jv-item-preview button").length).toBeGreaterThan(0);
    });

    it("hides a weekday via a calendar block's config picker and persists it", async () => {
      const initial = await getSettings();
      const calId = viewIdByName(initial.views, "Calendar") ?? "";
      const lastBlockHidden = (views: Record<string, StoredView> | undefined): number[] | undefined => {
        const blocks = views?.[calId]?.blocks ?? [];
        return (blocks.at(-1) as { config?: { hiddenWeekdays?: number[] } } | undefined)?.config?.hiddenWeekdays;
      };

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await clickIcon("Add block");
      await clickIcon("Add Week calendar");
      // Decline the auto-opened config editor: this test edits through the row's edit pencil.
      await waitForModalOpen();
      await dismissDialogs();
      await waitForSettings(
        (s) => Array.isArray(lastBlockHidden(s.views)) && lastBlockHidden(s.views)?.length === 0,
        "added week-calendar block did not default to no hidden weekdays",
      );

      const editButtons = await $$('button[aria-label="Edit block"]').getElements();
      await editButtons.at(-1)?.click();
      // Saturday is weekday index 6 (Sunday-based); checking it should persist [6].
      await clickModalToggleOption("Sat");
      await submitModal();

      await waitForSettings(
        (s) => JSON.stringify(lastBlockHidden(s.views)) === "[6]",
        "hidden weekday not persisted to the block config",
      );
    });
  });

  describe("view editor drag reorder", () => {
    it("persists a new toolbar item order after dragging an item", async () => {
      const initial = await getSettings();
      const ids = calendarToolbarItems(initial.views).map((item) => item.id);
      const firstId = ids[0];
      const secondId = ids[1];

      await expandSection("Views");
      await clickIcon("Configure Calendar");
      await $(".jv-item-frame").waitForExist({ timeoutMsg: "toolbar editor strip did not mount" });

      // SortableJS runs in native HTML5 drag mode here; WDIO's pointer Actions don't trigger it,
      // so the drag is driven by synthetic native DragEvents dispatched at element coordinates,
      // sharing one DataTransfer across the sequence. SortableJS finishes its drag-start setup
      // (BZ.active, the document dragover listener) inside a requestAnimationFrame scheduled from
      // its dragstart handler, so the move/onEnd only run if dragover is dispatched a frame later.
      await browser.execute(async () => {
        const frames = [...document.querySelectorAll<HTMLElement>(".jv-item-frame")];
        const sourceFrame = frames[0];
        const targetFrame = frames[1];
        const grip = sourceFrame.querySelector<HTMLElement>("[data-drag-handle]") ?? sourceFrame;

        const centerOf = (el: HTMLElement): { x: number; y: number } => {
          const rect = el.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };
        const source = centerOf(sourceFrame);
        const target = centerOf(targetFrame);
        const dataTransfer = new DataTransfer();

        const firePointer = (el: HTMLElement, type: string, point: { x: number; y: number }): void => {
          el.dispatchEvent(
            new PointerEvent(type, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y }),
          );
        };
        const fireDrag = (el: HTMLElement, type: string, point: { x: number; y: number }): void => {
          el.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer,
              clientX: point.x,
              clientY: point.y,
            }),
          );
        };

        // pointerdown on the grip flips SortableJS into drag-start prep (sets draggable=true).
        firePointer(grip, "pointerdown", source);
        fireDrag(sourceFrame, "dragstart", source);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        fireDrag(targetFrame, "dragenter", target);
        fireDrag(targetFrame, "dragover", target);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        fireDrag(targetFrame, "dragover", target);
        fireDrag(targetFrame, "drop", target);
        fireDrag(sourceFrame, "dragend", target);
        firePointer(sourceFrame, "pointerup", target);
      });

      await waitForSettings((s) => {
        const now = calendarToolbarItems(s.views).map((item) => item.id);
        return now[0] === secondId && now[1] === firstId;
      }, "drag reorder did not persist a swapped toolbar item order");
    });
  });

  describe("decorations", () => {
    it("edits a decoration's match mode and persists it", async () => {
      await openJournalSubpage("core", "daily");
      await expandSection("Calendar decorations");
      // The first decoration row's edit button; multiple rows share the tooltip, so clickIcon
      // (which targets the first match) lands on index 0. The modal's first <select> is the
      // and/or mode dropdown.
      await clickIcon("Edit decoration");
      await selectModalSelect("or");
      await submitModal();

      await waitForSettings(
        (s) => s.journals?.daily?.decorations?.[0]?.mode === "or",
        "decoration mode change not persisted",
      );
    });

    it("deletes a decoration and shrinks the list in data.json", async () => {
      const initial = await getSettings();
      const before = initial.journals?.daily?.decorations?.length ?? 0;
      await openJournalSubpage("core", "daily");
      await expandSection("Calendar decorations");
      // Delete the LAST decoration row so the index doesn't collide with the edit test's index 0.
      // These trash buttons are subpage rows (not in a modal), so query them page-scoped.
      const trash = await $$('button[aria-label="Delete decoration"]').getElements();
      await trash.at(-1)?.click();
      await deleteInModal();

      await waitForSettings(
        (s) => (s.journals?.daily?.decorations?.length ?? 0) === before - 1,
        "decoration delete not persisted",
      );
    });
  });

  describe("commands", () => {
    it("edits a command's name and persists it", async () => {
      await expandSection("Commands");
      await clickIcon("Edit Editable command");
      await setModalText("Renamed command");
      await submitModal();

      await waitForSettings(
        (s) => Object.values(s.commands ?? {}).some((c) => c.name === "Renamed command"),
        "command name change not persisted",
      );
    });

    it("deletes a command and removes it from data.json", async () => {
      await expandSection("Commands");
      await clickIcon("Delete Disposable command");
      await deleteInModal();

      await waitForSettings(
        (s) => Object.values(s.commands ?? {}).every((c) => c.name !== "Disposable command"),
        "deleted command still present in data.json",
      );
    });
  });

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

  // Kept last: the toggle mutates the monthly journal's config for the rest of the boot.
  describe("frontmatter toggle rewrite", () => {
    it("backfills the start date property on an existing note when the toggle turns on", async () => {
      await seedNote("month/2030-07-01.md", "---\njournal: monthly\njournal-date: 2030-07-01\n---\n");
      await waitForJournalFrontmatter("month/2030-07-01.md", { journal: "monthly", date: "2030-07-01" });

      await openJournalSubpage("extra", "monthly");
      await expandSection("Frontmatter");
      await toggleSettingRow("Add start date property");

      await waitForFrontmatter(
        "month/2030-07-01.md",
        (fm) => fm["journal-start-date"] === "2030-07-01",
        "existing note was not backfilled with the start date property",
      );
    });
  });
});
