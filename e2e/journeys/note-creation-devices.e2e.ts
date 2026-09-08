import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { waitForSettings } from "../support/plugin-data.js";
import { closeSettings, expandSection, openSettings, selectSettingDropdownByLabel } from "../support/settings.js";
import {
  noteExists,
  openNote,
  seedNote,
  todayAnchor,
  waitForActiveNote,
  waitForFrontmatter,
} from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// The Automatic note creation rule, exercised from the side the runner can actually be on. The
// excluded *device* is whichever one the rule leaves out, so pinning the rule to "Mobile only"
// makes this desktop the excluded device and runs the whole guard — the one thing out of reach is
// PlatformService.current() answering "mobile", a one-line read of an Obsidian constant.
//
// Both creating paths run at boot and nowhere else (StartupOpenService on onLayoutReady,
// AutoCreateService once the index is ready), so a reboot is the only place this is observable,
// which is why the unit suite's fake host cannot stand in for it. reloadObsidian() with no vault
// reboots the *same* on-disk vault, so each test builds on the state the previous one left.
const todayNote = (): string => `day/${todayAnchor()}.md`;

describe("automatic note creation restricted to another device", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-note-creation-devices", plugins: ["journals"] });
  });

  it("creates nothing on launch", async () => {
    // The fixture's daily journal is both the startup journal and autoCreate=true, so with the
    // rule allowing this device there would be a note here. Opening Settings is the deterministic
    // signal that the plugin's async initialize() resolved — the same one the migration specs use
    // — rather than a fixed wait before a negative assertion.
    await openSettings();
    await closeSettings();

    expect(await noteExists(todayNote())).toBe(false);
  });

  it("creates today's note once the rule includes this device", async () => {
    // The control for the assertion above: same vault, same journal, only the rule changed. It is
    // what makes the empty vault above evidence of the guard rather than of a boot that did nothing.
    await openSettings();
    await expandSection(m.startup_dashboard_section_title());
    await selectSettingDropdownByLabel(m.note_creation_devices_title(), "all");
    await closeSettings();
    // Settings persist through a debounced saveData, so the reboot has to wait for the write.
    await waitForSettings(
      (settings) => settings.noteCreation?.devices === "all",
      "the note creation rule was not persisted as 'all'",
    );

    await browser.reloadObsidian();

    // Vault state, not the active note: this test's subject is that the rule stopped being the
    // thing suppressing creation. Whether the note also reaches the active leaf is test 3's
    // subject, and asserting it here only borrows that race.
    await waitForState(() => noteExists(todayNote()), Boolean, `${todayNote()} was not created on launch`);
    await waitForFrontmatter(
      todayNote(),
      (frontmatter) => frontmatter.journal === "daily",
      `${todayNote()} did not attach journal=daily frontmatter`,
    );
  });

  it("still opens today's note when the rule excludes this device again", async () => {
    // The note now exists, so this is the read-only branch: the excluded device opens what is
    // there instead of doing nothing. A decoy is left active before the reboot because Obsidian
    // restores the previous layout — asserting on a note that was already open would pass with
    // the branch deleted. The journal note becoming active can only be the plugin opening it.
    await openSettings();
    await expandSection(m.startup_dashboard_section_title());
    await selectSettingDropdownByLabel(m.note_creation_devices_title(), "mobile");
    await closeSettings();
    await waitForSettings(
      (settings) => settings.noteCreation?.devices === "mobile",
      "the note creation rule was not persisted as 'mobile'",
    );
    await seedNote("decoy.md", "not a journal note\n");
    await openNote("decoy.md");

    await browser.reloadObsidian();

    await waitForActiveNote(todayNote());
  });
});
