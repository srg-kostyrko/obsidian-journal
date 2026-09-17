import { $, browser } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { promptChoose } from "../support/commands.js";
import { FixtureFileMissingError } from "../support/errors.js";
import { confirmUpdateLinksDialog } from "../support/rename-links-dialog.js";
import { clickDialogButton, waitForDialogClosed, waitForModalOpen } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { seedNote, todayAnchor, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

function holdsOnly(value: unknown, link: string): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === link;
}

async function frontmatterLinksOf(path: string): Promise<string[]> {
  const links = await browser.executeObsidian(
    ({ app }, notePath) =>
      app.metadataCache.getCache(notePath)?.frontmatterLinks?.map((link) => `${link.key}=${link.link}`) ?? null,
    path,
  );
  return links ?? [];
}

// The suggestion popup renders at the document root, outside the dialog. Unlike
// pickModalProperty, the candidate list here (NotesService.listFiles()) needs no registry to
// catch up, so retyping the query on every poll only fights the popup: each retype clears the
// field first, which closes the (now-empty-query) popup, and polling faster than the reopen can
// land the check inside that gap on every attempt. Type once and wait for the row instead.
//
// The row's own text lives entirely in two child divs (name, folder) that carry no class of
// their own, so isElementClickable's overlap check resolves to a child at the row's center
// point. WebdriverIO's JS-side isClickable/waitForClickable rejects that as not displayed (its
// isDisplayed walk over Obsidian's popup styling reads it as clipped), even though a real click
// lands on the row all the same — descendant hits resolve to the row through native event
// bubbling. Wait for existence, then click directly, the way pickModalIcon does for the same
// kind of document-root popup.
async function pickNoteSuggestion(query: string, name: string): Promise<void> {
  const input = $(".modal-container .setting-item-control input[type='text']");
  await input.setValue(query);
  const row = $(`.journal-suggestion-note*=${name}`);
  await row.waitForExist({ timeoutMsg: `"${name}" was never suggested` });
  await row.click();
}

// vault.ts's renameNote awaits app.fileManager.renameFile's own promise inside the executeObsidian
// round trip, but that promise does not settle until Obsidian's native "Update links?" dialog is
// answered — and nothing can answer it while the call raising it is the one Node is still waiting
// on. Chromedriver's own script-execution timeout (30s) then gives up on that pending request and
// webdriverio retries the identical script (a 500 response is one of its retryable statuses),
// re-running the callback a second time against a file the first, actually-successful attempt
// already renamed — surfacing as vault.ts's own "no fixture file" error, not a real gap in the
// feature. Fire the rename without awaiting its settlement, then drive the dialog to a close.
async function renameAndAcceptLinkUpdate(from: string, to: string): Promise<void> {
  const started = await browser.executeObsidian(
    ({ app, obsidian }, fromPath, toPath) => {
      const file = app.vault.getAbstractFileByPath(fromPath);
      if (!(file instanceof obsidian.TFile)) return false;
      void app.fileManager.renameFile(file, toPath);
      return true;
    },
    from,
    to,
  );
  if (!started) throw new FixtureFileMissingError(from);
  await confirmUpdateLinksDialog();
}

describe("a note link question", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-note-link", plugins: ["journals"] });
    await seedNote("Projects/Roadmap 2027.md", "# Roadmap\n");
  });

  it("stores a picked note as a one-item list Obsidian indexes as a link, and follows its rename", async () => {
    await openViaUri({ journal: "log", date: "2030-07-19" });
    await waitForModalOpen();

    await pickNoteSuggestion("Roadmap", "Roadmap 2027");
    await clickDialogButton(m.journal_prompt_submit());
    await waitForDialogClosed();

    const path = "Log/2030-07-19.md";
    await waitForJournalFrontmatter(path, { journal: "log", date: "2030-07-19" });
    await waitForFrontmatter(
      path,
      (frontmatter) => holdsOnly(frontmatter.project, "[[Roadmap 2027]]"),
      "waited for the answer to be saved as a one-item list of links",
    );
    await browser.waitUntil(
      async () => {
        const links = await frontmatterLinksOf(path);
        return links.includes("project.0=Roadmap 2027");
      },
      { timeoutMsg: "Obsidian never indexed the property as a link" },
    );

    await renameAndAcceptLinkUpdate("Projects/Roadmap 2027.md", "Projects/Roadmap 2028.md");
    await waitForFrontmatter(
      path,
      (frontmatter) => holdsOnly(frontmatter.project, "[[Roadmap 2028]]"),
      "waited for Obsidian to rewrite the link when its note was renamed",
    );
  });

  it("links a journal note that does not exist yet by its full path", async () => {
    await openViaUri({ journal: "log", date: "2030-07-20" });
    await waitForModalOpen();

    await $(`.modal-container button[aria-label="${m.journal_prompt_pick_journal_note()}"]`).click();
    await promptChoose("daily");
    const today = todayAnchor();
    // The date picker opens as a second dialog over the answers dialog.
    const cell = $(`.modal-container [data-testid="month-cell"][data-anchor="${today}"]`);
    await cell.waitForClickable({ timeoutMsg: `date picker did not render the ${today} cell` });
    await cell.click();

    await clickDialogButton(m.journal_prompt_submit());
    await waitForDialogClosed();

    const path = "Log/2030-07-20.md";
    await waitForJournalFrontmatter(path, { journal: "log", date: "2030-07-20" });
    await waitForFrontmatter(
      path,
      (frontmatter) => holdsOnly(frontmatter.project, `[[Daily/${today}]]`),
      "waited for the not-yet-created journal note to be linked by its full path",
    );
  });
});
