import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openJournalSubpage,
  openSettings,
  setModalText,
  submitModal,
} from "../support/settings.js";

// Cloning copies a journal out of the reactive settings store and fans two cascades off the
// repository's `cloned` event: the shelves service puts the copy beside its source, and the
// command registry re-targets the source's own commands onto it. Unit tests drive those on plain
// objects — only the real store nests reactive proxies inside a journal's decorations, and only
// the real container has journals, shelves and commands wired together at once.

const SOURCE = "sprint";
const COPY = m.journal_clone_copy_name({ name: SOURCE });
const COMMAND = "Sprint opener";

describe("clone journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  after(closeSettings);

  it("clones a shelved journal with its config, its shelf and its commands", async () => {
    await openSettings();
    await openJournalSubpage("spill-me", SOURCE);

    // The fixture ships only all-journal commands, so give the source one of its own first.
    await expandSection(m.command_section_title());
    await clickIcon(m.command_add());
    await setModalText(COMMAND);
    await submitModal();
    await goBack();

    await clickIcon(m.journal_dashboard_clone({ name: SOURCE }));
    await submitModal(); // accept the suggested name

    await waitForSettings((settings) => settings.journals?.[COPY] !== undefined, "clone never reached data.json");

    const settings = await getSettings();
    // Decorations are the nested-proxy part of the config: a shallow copy would either throw or
    // hand the copy the source's own array.
    expect(settings.journals?.[COPY]?.decorations).toEqual(settings.journals?.[SOURCE]?.decorations);
    expect(settings.shelves?.["spill-me"]?.journals).toEqual([SOURCE, COPY]);

    const journalCommands = Object.values(settings.commands ?? {}).filter(
      (command) => command.target?.kind === "journal",
    );
    expect(journalCommands.map((command) => [command.target?.journalName, command.name])).toEqual([
      [SOURCE, COMMAND],
      [COPY, COMMAND],
    ]);
  });
});
