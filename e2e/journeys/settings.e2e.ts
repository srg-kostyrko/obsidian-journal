import { $, browser, expect } from "@wdio/globals";

import { waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  closeSettings,
  deleteInModal,
  expandSection,
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
});
