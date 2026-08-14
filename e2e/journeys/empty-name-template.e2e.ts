import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";

// e2e-empty-name defines a day journal whose nameTemplate is "", so every note it would
// create resolves to the invisible dotfile ".md". The plugin must refuse and say so.
const NOTICE = m.journal_note_name_empty_notice({ journalName: "daily" });

describe("empty note name template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-empty-name", plugins: ["journals"] });
  });

  it("tells the user why no note was created", async () => {
    await runCommand("journals:open-today");
    await waitForNotice(NOTICE);
  });

  it("creates no note", async () => {
    await runCommand("journals:open-today");
    await waitForNotice(NOTICE);
    // The vault's live file map excludes dot-prefixed entries, so getAbstractFileByPath
    // can never see a root-level ".md" dotfile whether or not the plugin wrote one — the
    // adapter reads the raw filesystem instead and does see it.
    const dotfileExists = await browser.executeObsidian(({ app }) => app.vault.adapter.exists(".md"));
    expect(dotfileExists).toBe(false);
  });
});
