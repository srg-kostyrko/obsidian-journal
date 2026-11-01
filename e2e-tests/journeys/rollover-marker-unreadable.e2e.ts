import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { readRawSettings, waitForSettingsVersion } from "../support/plugin-data.js";
import { clickIcon, closeSettings, expandSection, openSettings, toggleSettingRow } from "../support/settings.js";
import { contentOf, openNote, waitForActiveNote } from "../support/vault.js";

// A stored rolled marker the plugin cannot read ("carried" is no tag) is held as it was: rolling is
// refused rather than run against #rolled, which would read the line stamped #carried as open and
// copy it again. Ships in the fixture so the notes' metadata has resolved by the time the command runs.
const FIXTURE = "./e2e-tests/fixtures/e2e-rollover-marker-unreadable";
const SOURCE = "daily/2026-09-25.md";
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

describe("rolling over with a rolled marker the plugin cannot read", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
  });

  after(closeSettings);

  it("refuses with a notice and leaves both notes as they were", async () => {
    const sourceBefore = await contentOf(SOURCE);
    const targetBefore = await contentOf(TARGET);
    expect(sourceBefore).toContain("- [ ] milk #carried");
    expect(targetBefore).toContain(`journal-date: ${TODAY}`);
    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);

    await runCommand("journals:roll-over");

    await waitForNotice(m.tasks_roll_marker_unreadable());
    expect(await contentOf(SOURCE)).toBe(sourceBefore);
    expect(await contentOf(TARGET)).toBe(targetBefore);
  });

  // Booting never saves settings, so a setting change makes the plugin write data.json.
  it("keeps the stored marker in data.json as it was when settings are saved", async () => {
    await openSettings();
    await expandSection(m.view_dashboard_section_title());
    await clickIcon(m.view_dashboard_open({ name: "Calendar" }));
    await toggleSettingRow(m.view_edit_remember_date_label());
    await waitForSettingsVersion();

    const raw = await readRawSettings();
    expect(raw).toBeDefined();
    expect((JSON.parse(raw ?? "{}") as { tasksCheckbox?: unknown }).tasksCheckbox).toMatchObject({
      rolledMarker: "carried",
    });
  });
});
