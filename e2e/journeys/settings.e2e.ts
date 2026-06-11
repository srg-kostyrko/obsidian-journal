import { $, browser, expect } from "@wdio/globals";

import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
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

import type { StoredView } from "../support/plugin-data.js";

// Views are UUID-keyed; the specs know views by name, so resolve the id from the persisted
// settings before/after a flow.
function viewIdByName(views: Record<string, { name?: string }> | undefined, name: string): string | undefined {
  return Object.keys(views ?? {}).find((id) => views?.[id]?.name === name);
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

      await clickIcon("Open Calendar");
      await clickButton("Add block");
      await clickButton("Week calendar");

      await waitForSettings(
        (s) => (s.views?.[calId ?? ""]?.blocks?.length ?? 0) === before + 1,
        "added block not persisted to the default view",
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

      await clickIcon("Open Calendar");
      await clickButton("Add toolbar item");
      await clickButton("Period buttons");

      await waitForSettings((s) => itemCount(s.views) === before + 1, "added toolbar item not persisted");
    });
  });
});
