import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  clickButton,
  clickIcon,
  closeSettings,
  expandSection,
  openJournalSubpage,
  openSettings,
  submitModal,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";

// Exercises the real chain the mock-based unit suite cannot: TaskProviderToken's multi-registration
// assembling into an actual settings tree, EditCheckboxProviderModal mounted as a real Obsidian
// Modal, and the checkbox slice's valibot schema round-tripping through a real data.json.
const FIXTURE = "./e2e-tests/fixtures/e2e-journeys";

// Mirrors settings.ts's toggleSettingRow xpath convention: an exact match on .setting-item-name,
// scoped to the whole document since a collapsed section's rows render nothing at all (v-if).
function providerRowsNamed(name: string): ReturnType<typeof $$> {
  return $$(`//div[contains(@class,"setting-item-name")][normalize-space(.)="${name}"]`);
}

function statusMapRows(): ReturnType<typeof $$> {
  return $$('[data-testid^="status-map-row-"]');
}

describe("dashboard task provider list", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });
  afterEach(closeSettings);

  it("shows exactly one provider row, for the checkbox provider", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());

    await expect(providerRowsNamed(m.tasks_settings_provider_checkbox())).toBeElementsArrayOfSize(1);
  });
});

describe("checkbox provider modal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });
  afterEach(closeSettings);

  it("opens from the gear with five status rows, and Cancel discards an edit", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();

    await expect(statusMapRows()).toBeElementsArrayOfSize(5);

    await $('[data-testid="status-map-new-symbol"]').setValue("!");
    await $('[data-testid="status-map-add"]').click();
    await expect(statusMapRows()).toBeElementsArrayOfSize(6);

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();

    // Reopening proves Cancel never reached the slice at all, not merely that the draft reset
    // in-memory before this same modal instance was inspected.
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();
    await expect(statusMapRows()).toBeElementsArrayOfSize(5);

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();
  });
});

describe("checkbox provider modal save", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });
  afterEach(closeSettings);

  it("persists an added symbol across Save and reopen", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();

    await $('[data-testid="status-map-new-symbol"]').setValue("!");
    await $('[data-testid="status-map-add"]').click();
    await expect($('[data-testid="status-map-row-!"]')).toExist();

    await submitModal();

    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();
    await expect($('[data-testid="status-map-row-!"]')).toExist();

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();
  });
});

describe("journal tasks section", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });
  afterEach(closeSettings);

  it("is collapsed at first and expands to one provider row", async () => {
    await openSettings();
    await openJournalSubpage("core", "daily");

    await expect($('[data-testid="checkbox-journal-edit"]')).not.toExist();

    await expandSection(m.tasks_settings_title());

    await expect($('[data-testid="checkbox-journal-edit"]')).toExist();
    await expect(providerRowsNamed(m.tasks_settings_provider_checkbox())).toBeElementsArrayOfSize(1);
  });
});
