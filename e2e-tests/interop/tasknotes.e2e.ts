import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import {
  clickButton,
  clickDialogButton,
  closeSettings,
  expandSection,
  openSettings,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { seedNote } from "../support/vault.js";

// The fixture ships a stub `tasknotes` plugin, enabled through its community-plugins.json, whose
// only content is a TaskNotes 4.13.9 settings object: Journals reads nothing else of it. It names
// `#chore` as the task tag and excludes `Archive/`, so a listing built from Journals' own defaults
// (`#task`, nothing excluded) differs from one built from the copy.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasknotes-setup";

const DAY = "2026-05-12";
const DAY_NOTE = `${DAY}.md`;
const COPIED_TITLE = "Clean the gutters";
const PROVIDER_TOGGLE = '[data-testid="note-property-enabled"]';
const PROVIDER_SUMMARY = '[data-testid="note-property-summary"]';
const TASK_ROWS = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks .task-listing-row`;

describe("setting task notes up from TaskNotes", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(DAY_NOTE, hostNote("daily", DAY, "```journal-tasks\n```"));
  });

  after(closeSettings);

  it("copies TaskNotes' settings, turns task notes on, and lists what TaskNotes tracks", async () => {
    await openSettings();
    await expect($(`.setting-item-name*=${m.tasks_tasknotes_notice_heading()}`)).toBeDisplayed();

    await clickButton(m.tasks_tasknotes_notice_set_up());
    await waitForModalOpen();
    // Cancel, not Save: the copy is already written, and the modal only shows it.
    await clickDialogButton(m.common_action_cancel());
    await waitForDialogClosed();

    await expect($(`.setting-item-name*=${m.tasks_tasknotes_notice_heading()}`)).not.toBeExisting();
    await expandSection(m.tasks_settings_title());
    await expect($(PROVIDER_TOGGLE)).toHaveAttribute("aria-checked", "true");
    await expect($(PROVIDER_SUMMARY)).toHaveText(m.tasks_note_property_summary_tag({ tag: "#chore" }));
    await closeSettings();

    await openInReadingMode(DAY_NOTE);
    await browser.waitUntil(
      async () => {
        const texts = await $$(TASK_ROWS).map((row) => row.getText());
        return texts.some((text) => text.includes(COPIED_TITLE));
      },
      { timeoutMsg: `no listing row reads "${COPIED_TITLE}"` },
    );
    // The `#task` note and the `#chore` note under Archive/ share the day; the copy leaves both out.
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(1);
  });
});
