import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { noticeTexts } from "../support/notices.js";
import { contentOf, openNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// Under Move, an open earlier note whose view takes the removal but cannot save it. The editor no
// longer holds the tasks while its file still does, so a notice saying they "are still there"
// would send the user to delete the copies that are about to be the only ones left.
const FIXTURE = "./e2e-tests/fixtures/e2e-rollover-unsaved";
const SOURCE_DATE = "2026-09-25";
const SOURCE = `daily/${SOURCE_DATE}.md`;
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

function failSavesOf(path: string): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const leaf = app.workspace
      .getLeavesOfType("markdown")
      .find((candidate) => candidate.view instanceof obsidian.MarkdownView && candidate.view.file?.path === notePath);
    if (!(leaf?.view instanceof obsidian.MarkdownView)) return false;
    leaf.view.save = () => Promise.reject(new DOMException("disk full", "QuotaExceededError"));
    return true;
  }, path);
}

function editorText(path: string): Promise<string | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const leaf = app.workspace
      .getLeavesOfType("markdown")
      .find((candidate) => candidate.view instanceof obsidian.MarkdownView && candidate.view.file?.path === notePath);
    return leaf?.view instanceof obsidian.MarkdownView ? leaf.view.editor.getValue() : undefined;
  }, path);
}

describe("rolling under move into a note whose open editor cannot save", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
  });

  it("says the editor holds the removal unsaved, not that the tasks are still in the note", async () => {
    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);
    expect(await failSavesOf(SOURCE)).toBe(true);

    await runCommand("journals:roll-over");

    const unsaved = m.tasks_roll_source_unsaved({ date: SOURCE_DATE, mode: "move" });
    await waitForState(
      noticeTexts,
      (texts) => texts.some((text) => text.includes(unsaved)),
      "waited for the notice to say the earlier note is unsaved",
    );
    const notices = await noticeTexts();
    expect(
      notices.some((text) => text.includes(m.tasks_roll_source_write_failed({ date: SOURCE_DATE, mode: "move" }))),
    ).toBe(false);
    const target = await contentOf(TARGET);
    const sourceEditor = await editorText(SOURCE);
    expect(target?.split("\n")).toContain("- [ ] milk");
    expect(sourceEditor?.split("\n")).not.toContain("- [ ] milk");
  });
});
