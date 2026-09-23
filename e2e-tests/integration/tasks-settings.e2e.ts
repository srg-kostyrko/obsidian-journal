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

// File-level, not nested in the first describe below: every describe in this file shares this one
// reboot, and a `before` scoped to "dashboard task provider list" would silently stop covering the
// rest if a describe were ever added or reordered above it. Sharing is safe here because every
// scenario after the first either reverts itself (Cancel) or persists a change nothing downstream
// reads (the added "!" symbol) — see each describe's own comment for which.
before(async () => {
  await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
});

describe("dashboard task provider list", () => {
  afterEach(closeSettings);

  it("shows exactly one provider row, for the checkbox provider", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());

    await expect(providerRowsNamed(m.tasks_settings_provider_checkbox())).toBeElementsArrayOfSize(1);
  });
});

// Shares the boot the first describe established: this scenario mutates the status map then
// Cancels, so it is self-reverting (a broken Cancel fails its own reopen assertion below) and
// cannot contaminate what runs after it.
describe("checkbox provider modal", () => {
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

// Persists a symbol into data.json and leaves it there — nothing after this reads the status
// map, so the leftover state is harmless.
describe("checkbox provider modal save", () => {
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

// Self-reverting: Cancel discards the added condition, so nothing here carries forward into
// data.json for a later describe to trip over.
describe("checkbox provider modal validation", () => {
  afterEach(closeSettings);

  // identifies() treats an empty tags/headings list as "no constraint", so an unfinished
  // condition silently widens the rule to match every checkbox item — the real bug this
  // guard exists for. Exercised against a real Obsidian Modal, not the mock-based unit suite.
  it("disables Save while a rule condition has no values", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();

    await clickButton(m.tasks_settings_add_condition());

    await expect($(`button=${m.common_action_submit()}`)).toBeDisabled();

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();
  });
});

// Persists a two-value condition and leaves it — nothing after this reads the global rule, same
// as "checkbox provider modal save" above leaving its added status symbol.
describe("checkbox provider modal condition values", () => {
  afterEach(closeSettings);

  // The unit suite covers RuleConditionRow's own commit boundary against a mocked settings
  // container; this exercises the same field through a real Obsidian Modal end to end, entering
  // and saving a condition with two comma-separated values and reading them back after a reopen.
  it("enters and saves a condition with two comma-separated values", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();

    await clickButton(m.tasks_settings_add_condition());
    const input = $(`[aria-label="${m.tasks_settings_condition_tag()}"]`);
    await input.setValue("#work, #home");
    await browser.keys("Tab");

    await submitModal();

    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();
    await expect($(`[aria-label="${m.tasks_settings_condition_tag()}"]`)).toHaveValue("#work, #home");

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();
  });

  // The layer that would have caught the original bug: a per-keystroke commit re-derives the
  // whole value list from the field on every keystroke, including deletions, so backspacing a
  // value down to a bare "#" reads as empty and drops the ", " before it too — one Backspace
  // erasing characters it was never asked to touch.
  it("keeps the rest of a value and its separator when backspacing removes only its last character", async () => {
    await openSettings();
    await expandSection(m.tasks_settings_title());
    await clickIcon(m.tasks_settings_configure());
    await waitForModalOpen();

    await clickButton(m.tasks_settings_add_condition());
    const input = $(`[aria-label="${m.tasks_settings_condition_tag()}"]`);
    await input.setValue("#work, #home");
    await input.click();
    await browser.keys("End");
    await browser.keys(["Backspace", "Backspace", "Backspace", "Backspace"]);

    await expect(input).toHaveValue("#work, #");

    await clickButton(m.common_action_cancel());
    await waitForDialogClosed();
  });
});

describe("journal tasks section", () => {
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
