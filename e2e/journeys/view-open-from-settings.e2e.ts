import { browser, expect } from "@wdio/globals";

import { waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  isSettingsOpen,
  openSettings,
  toggleSettingRow,
} from "../support/settings.js";
import { waitForState } from "../support/wait.js";

// Turning "Open on startup" on also opens the view right away, so the user sees what the setting
// will do. Opening it as an *active* leaf makes Obsidian focus that leaf, and focusing a leaf
// closes the settings window the user is still working in (Workspace.focusLeaf ends in
// app.setting.close()). Only the real app wires focus to that dismissal — the mocked unit suite
// has no settings window — so the reveal-without-activating contract is checked here.

const VIEW_ID = "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c";
const VIEW_TYPE = `journal-view:${VIEW_ID}`;

const leafCount = async (): Promise<number> =>
  browser.executeObsidian(({ app }, type) => app.workspace.getLeavesOfType(type).length, VIEW_TYPE);

async function closeView(): Promise<void> {
  await browser.executeObsidian(({ app }, type) => {
    app.workspace.detachLeavesOfType(type);
  }, VIEW_TYPE);
}

describe("view opened from its settings page", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  after(closeSettings);

  it("keeps the settings window open when a hidden view is switched on", async () => {
    await openSettings();
    await expandSection("Views");
    await clickIcon("Configure Calendar");

    // The fixture ships the Calendar opted in and open, so switch it off and close it first —
    // only a missing leaf makes the toggle take the branch that places a new one.
    await toggleSettingRow("Open on startup");
    await waitForSettings(
      (settings) => settings.views?.[VIEW_ID]?.openOnStartup === false,
      "open-on-startup was not turned off",
    );
    await closeView();
    await waitForState(leafCount, (count) => count === 0, "view leaf was not closed");

    await toggleSettingRow("Open on startup");

    await waitForState(leafCount, (count) => count > 0, "toggling open on startup did not open the view");
    expect(await isSettingsOpen()).toBe(true);
  });
});
