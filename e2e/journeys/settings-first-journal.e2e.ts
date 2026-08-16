import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  openSettings,
  selectModalSelect,
  setModalText,
  settingsTabLabel,
  submitModal,
} from "../support/settings.js";

// Slice B chunk 3 — first-journal-from-empty. e2e-empty has no journals (views auto-seed
// the default calendar view at onload); the dashboard renders the empty state until the
// first journal is created through the Add-journal modal.
describe("first journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-empty", plugins: ["journals"] });
  });

  // Obsidian seeds the sidebar entry from the manifest name and caches its DOM inside
  // addSettingTab, so only a real boot proves the translated title lands there.
  it("labels its settings sidebar entry with the translated tab title", async () => {
    await openSettings();

    expect(await settingsTabLabel()).toBe(m.settings_tab_title());
  });

  it("creates the first journal from an empty vault and replaces the empty state", async () => {
    await openSettings();
    await expect($(".setting-item-description*=No journals created yet")).toExist();

    await clickIcon("Create new journal");
    await setModalText("My first journal");
    await selectModalSelect("day");
    await submitModal();

    await waitForSettings((s) => "My first journal" in (s.journals ?? {}), "first journal not persisted to data.json");
    await expect($(".setting-item-name*=My first journal")).toExist();
  });
});
