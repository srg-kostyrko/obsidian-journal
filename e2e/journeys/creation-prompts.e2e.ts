import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  clickDialogButton,
  modalText,
  selectModalOption,
  submitModal,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import {
  createNote,
  noteExists,
  waitForActiveNote,
  waitForContent,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

// e2e-prompts defines two journals. "prompted" names its notes "{{date}} {{mood}}" from a
// required Choice question saved to the "mood" property, so every scenario below that creates
// a note goes through the answer dialog before a path can even be derived. "confirmed" has
// confirmCreation on and a text question ("note") that reaches neither the name nor the folder,
// which is the one combination where the answer dialog's note-path preview is not driven by any
// answer at all — it exists solely because confirmCreation is on.
function notePathPreviewRow(): ReturnType<typeof $> {
  return $(
    `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="${m.journal_prompt_note_path_label()}"]]`,
  );
}

describe("creating a note on a prompting journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("names the note, fills its frontmatter and renders the answers into the body", async () => {
    await openViaUri({ journal: "prompted", date: "2030-07-19" });
    await waitForModalOpen();
    expect(await modalText()).toContain(m.journal_prompt_answers_modal_title({ period: "2030-07-19" }));

    await selectModalOption("okay");
    await expect(notePathPreviewRow()).toHaveText("2030-07-19 okay.md", { containing: true });
    await submitModal();

    await waitForActiveNote("2030-07-19 okay.md");
    await waitForJournalFrontmatter("2030-07-19 okay.md", { journal: "prompted", date: "2030-07-19" });
    await waitForFrontmatter(
      "2030-07-19 okay.md",
      (frontmatter) => frontmatter.mood === "okay",
      "waited for the mood answer to reach the note's frontmatter",
    );
    await waitForContent(
      "2030-07-19 okay.md",
      (content) => content.includes("Mood: okay"),
      "waited for the mood answer to render into the note body",
    );
  });
});

describe("clicking an unresolved journal link to a prompted journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("prompts, renames the placeholder-named file and attaches it", async () => {
    await createNote("links.md", "see [[2030-07-20 (unanswered)]]\n");
    await browser.executeObsidian(
      async ({ app }, linkText, source) => {
        await app.workspace.openLinkText(linkText, source, false);
      },
      "2030-07-20 (unanswered)",
      "links.md",
    );

    await waitForModalOpen();
    await selectModalOption("okay");
    await submitModal();

    await waitForJournalFrontmatter("2030-07-20 okay.md", { journal: "prompted", date: "2030-07-20" });
    expect(await noteExists("2030-07-20 (unanswered).md")).toBe(false);
  });
});

describe("cancelling the creation prompt for an unresolved journal link", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("takes back the empty file Obsidian created for the link", async () => {
    await createNote("links.md", "see [[2030-07-21 (unanswered)]]\n");
    await browser.executeObsidian(
      async ({ app }, linkText, source) => {
        await app.workspace.openLinkText(linkText, source, false);
      },
      "2030-07-21 (unanswered)",
      "links.md",
    );

    await waitForModalOpen();
    await clickDialogButton(m.common_action_cancel());
    await waitForDialogClosed();

    // The link click is what made the file, and its name is a placeholder no rename will ever
    // fill now. Cancelling puts the user back where they started rather than leaving a file
    // named "(unanswered)" behind.
    await browser.waitUntil(async () => !(await noteExists("2030-07-21 (unanswered).md")), {
      timeoutMsg: "expected the placeholder file to be trashed",
    });
  });
});

describe("confirming a note whose name carries no prompt answer", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("shows the note name statically when confirmCreation is on and no prompt reaches it", async () => {
    await openViaUri({ journal: "confirmed", date: "2030-07-22" });
    await waitForModalOpen();

    // The answer dialog is standing in for the creation-confirmation dialog here — the "note"
    // question never touches the name template, so nothing renders it live, but the name must
    // still be shown or confirmCreation's whole purpose (see what you're about to create) is lost.
    expect(await modalText()).toContain(m.journal_prompt_answers_modal_title({ period: "2030-07-22" }));
    await expect(notePathPreviewRow()).toHaveText("2030-07-22.md", { containing: true });

    await clickDialogButton(m.common_action_cancel());
    await waitForDialogClosed();
    expect(await noteExists("2030-07-22.md")).toBe(false);
  });
});
