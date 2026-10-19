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

// Real TaskNotes 4.13.9, configured through the fixture's own data.json, which it merges over its
// defaults on load. It names `#chore` as the task tag and excludes `Archive/`, so a listing built
// from Journals' own defaults (`#task`, nothing excluded) differs from one built from the copy.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasknotes-setup";

const DAY = "2026-05-12";
const DAY_NOTE = `${DAY}.md`;
const COPIED_TITLE = "Clean the gutters";
const PROVIDER_TOGGLE = '[data-testid="note-property-enabled"]';
const PROVIDER_SUMMARY = '[data-testid="note-property-summary"]';
const TASK_ROWS = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks .task-listing-row`;

describe("setting task notes up from TaskNotes", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals", "tasknotes"] });
    await seedNote(DAY_NOTE, hostNote("daily", DAY, "```journal-tasks\n```"));
  });

  after(closeSettings);

  // A plugin can be listed as enabled and never instantiate (see Templater's pin in wdio.conf.mts);
  // without this the card's absence would read as a Journals failure.
  it("loads TaskNotes with the fixture's settings", async () => {
    const taskTag = await browser.executeObsidian(({ app }) => {
      const plugins = (app as unknown as { plugins: { getPlugin(id: string): unknown } }).plugins;
      const plugin = plugins.getPlugin("tasknotes") as { settings?: { taskTag?: unknown } } | null;
      return plugin?.settings?.taskTag ?? null;
    });
    expect(taskTag).toBe("chore");
  });

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

  // Left to itself on a first run TaskNotes writes seven .base files and a "Start Here" note into
  // TaskNotes/ and opens that note, stealing the editor's focus; the fixture's data.json turns that
  // off. Checked last so its layout-ready work has had the whole spec to land.
  it("leaves the vault without TaskNotes' first-run files", async () => {
    const created = await browser.executeObsidian(({ app }) => app.vault.getAbstractFileByPath("TaskNotes") !== null);
    expect(created).toBe(false);
  });
});
