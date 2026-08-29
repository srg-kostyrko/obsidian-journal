import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { confirmUpdateLinksDialog } from "../support/rename-links-dialog.js";
import {
  clickDialogButton,
  clickIcon,
  clickModalCta,
  closeSettings,
  dismissDialogs,
  goBack,
  modalText,
  openSettings,
  selectModalOption,
  submitModal,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import {
  createNote,
  noteExists,
  resolvedLinksFrom,
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

    // Submitting renames the placeholder file, and links.md holds a real link pointing at it, so
    // Obsidian's own fileManager.renameFile opens its native "Update links?" dialog before the
    // rename settles — the plugin's answer modal is already gone by then, so a plain submitModal
    // (which waits for "no modal at all") would instead wait on this second, unrelated dialog.
    await clickModalCta();
    await confirmUpdateLinksDialog();

    await waitForJournalFrontmatter("2030-07-20 okay.md", { journal: "prompted", date: "2030-07-20" });
    expect(await noteExists("2030-07-20 (unanswered).md")).toBe(false);

    // The whole point of renaming through fileManager.renameFile (rather than vault.rename) is
    // that it repairs links pointing at the renamed file. Assert the repair itself, not just the
    // rename: links.md's link must resolve to the note's new name, not sit broken on the old one.
    await browser.waitUntil(
      async () => {
        const resolved = await resolvedLinksFrom("links.md");
        return resolved?.["2030-07-20 okay.md"] === 1;
      },
      { timeoutMsg: "expected the link in links.md to resolve to the renamed note" },
    );
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

async function openVariableReference(journal: string): Promise<void> {
  await clickIcon(m.journal_dashboard_edit({ name: journal }));
  // The Note creation section is expanded on arrival, so its name-template row's hint is the
  // first "Supported variables." link on the page.
  await $(`a=${m.journal_edit_variable_reference_link()}`).click();
  await waitForModalOpen();
}

// Every variable row in the open reference, as "<chip>:<carries a modifications link>". Read
// per row rather than by counting links page-wide: the count cannot say which row grew one.
function modificationsByRow(): Promise<string> {
  return browser.execute(() =>
    [...document.querySelectorAll(".variable-reference__row")]
      .map((row) => `${row.querySelector("dt")?.textContent?.trim()}:${row.querySelector("dd a") !== null}`)
      .join(" "),
  );
}

describe("the variable reference of a prompting journal", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
    await openSettings();
  });

  after(closeSettings);

  afterEach(async () => {
    await dismissDialogs();
    await goBack();
  });

  it("lists a question's variable beside the question it answers", async () => {
    await openVariableReference("prompted");

    // The chip alone proves the row rendered; the description proves it carries the question,
    // which is the only thing telling two questions' variables apart in a list of them.
    const text = await modalText();
    expect(text).toContain("{{mood}}");
    expect(text).toContain(m.journal_edit_variable_prompt_description({ question: "How was today?" }));
  });

  it("offers date modifications on a date answer and on no other answer type", async () => {
    await openVariableReference("confirmed");

    // A date answer binds as a date spec, so shifts and formats apply to it exactly as they do
    // to {{date}}; a text answer is a bare string that none of them reach.
    const rows = await modificationsByRow();
    expect(rows).toContain("{{due}}:true");
    expect(rows).toContain("{{note}}:false");
  });

  it("omits a yes/no answer from the note name reference", async () => {
    await openVariableReference("confirmed");

    // The question editor refuses a yes/no answer in a name or folder, so offering it here would
    // advertise a variable that cannot be saved. The other two answers pin the omission to this
    // question rather than to a reference that failed to list any of them.
    const rows = await modificationsByRow();
    expect(rows).not.toContain("{{pinned}}");
    expect(rows).toContain("{{note}}");
    expect(rows).toContain("{{due}}");
  });
});
