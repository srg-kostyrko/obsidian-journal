import { browser, expect } from "@wdio/globals";

import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { noteExists } from "../support/vault.js";

// e2e-empty-name defines a day journal whose nameTemplate is "", so every note it would
// create resolves to the invisible dotfile ".md". The plugin must refuse and say so.
const NOTICE = 'Journal "daily" has a name template that resolves to an empty note name, so no note can be created.';

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
    expect(await noteExists(".md")).toBe(false);
  });
});
