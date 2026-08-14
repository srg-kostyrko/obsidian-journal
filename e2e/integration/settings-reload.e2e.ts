import { browser, expect } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";
import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";

// Obsidian Sync edits data.json on disk and calls the plugin's onExternalSettingsChange, which runs
// SettingsService.reload(): it re-reads data.json, refreshes reactive state in place, and emits
// "reloaded". DynamicCommandRegistry reconciles on that event. We add a uniquely-named command to
// data.json out of band, fire the hook, and assert the command palette now lists it — proving the
// reload -> reconcile -> register chain end to end. The fixture boot is a copy, so the disk edit is
// isolated to this run.
const NEW_COMMAND = "Reloaded open today";

describe("external settings reload", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("registers a command added to data.json after an external reload", async () => {
    expect(await paletteLists(NEW_COMMAND)).toBe(false);

    const raw = (await readRawSettings()) ?? "{}";
    const settings = JSON.parse(raw) as { commands?: Record<string, unknown> };
    settings.commands ??= {};
    settings.commands["cmd-reloaded"] = {
      name: NEW_COMMAND,
      icon: "calendar-days",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "day" },
      type: "same",
      context: "today",
    };
    await writeRawSettings(JSON.stringify(settings));
    await triggerExternalSettingsChange();

    await browser.waitUntil(async () => paletteLists(NEW_COMMAND), {
      timeoutMsg: "the reloaded command never appeared in the palette",
    });
  });
});
