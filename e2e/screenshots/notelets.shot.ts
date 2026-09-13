import { mkdir } from "node:fs/promises";
import path from "node:path";

import { $, browser } from "@wdio/globals";

import { hostNote, openInReadingMode, VISIBLE_LEAF } from "../journeys/code-blocks.js";
import { runCommand } from "../support/commands.js";
import { setModalText, submitModal, waitForModalOpen } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import {
  activeNotePath,
  closeAllLeaves,
  frontmatterOf,
  seedNote,
  todayAnchor,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { recordOutcome } from "./capture.js";

// Same reading-view scoping as code-blocks.shot.ts: a markdown leaf keeps both a live-preview
// and a reading-view copy of a fence mounted, so an unscoped selector would match twice.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NOTELET_BLOCK = `${READING_VIEW} .block-language-journal-notelets`;
const LIST_ROW = `${NOTELET_BLOCK} .journal-notelet-list__row`;
const TYPE_HEADING = `${NOTELET_BLOCK} .journal-notelet-list__type-heading`;

// A non-settings modal's own title element (Obsidian's Modal.setTitle), scoped past the
// settings panel the same way settings.ts's activeModal() is, for the one thing modalText()
// (the dialog's whole rendered text) cannot isolate on its own.
const DIALOG_TITLE = ".modal-container:not(:has(.mod-settings)) .modal-title";

function textsOf(selector: string): Promise<string[]> {
  return browser.execute(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.textContent?.trim() ?? ""),
    selector,
  );
}

const ASSETS = "./docs/user/public/assets";
const THEMES = [
  { id: "moonstone", suffix: "light" },
  { id: "obsidian", suffix: "dark" },
] as const;

// capture.ts's shared captureThemed takes both themes' screenshots from ONE boot, switching
// live between them. For this block that is unreliable in this environment for reasons no DOM
// wait can paper over: empirically (proven by swapping the two themes' order and watching the
// failure follow the SECOND slot rather than either theme), whichever of the two screenshots is
// the second one taken in a session comes back as a stale, wrong frame — the note's own
// title-and-Properties top, scrolled to 0, rather than the block — even though a DOM read taken
// at the very same instant confirms the right rows are mounted. The first screenshot in a
// session is reliable every time this was tried. So: one full reboot per theme, each one taking
// exactly one (first-and-only) screenshot, sidesteps the failure instead of chasing it.
async function seedAndCaptureThemed(
  themeId: (typeof THEMES)[number]["id"],
  today: string,
  path_: string,
  selector: string,
  name: string,
  suffix: string,
): Promise<{ headings: string[]; rows: string[] }> {
  await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  await browser.executeObsidian(({ app }, id) => {
    (app as unknown as { changeTheme(themeId: string): void }).changeTheme(id);
  }, themeId);
  await seedNote(`day/meetings/${today} Meeting 1.md`, noteletNote(today, "Meeting", "journal-notelet-index: 1\n"));
  await seedNote(`day/meetings/${today} Meeting 2.md`, noteletNote(today, "Meeting", "journal-notelet-index: 2\n"));
  await seedNote(`day/retros/${today} Retro.md`, noteletNote(today, "Retro"));
  await seedNote(`day/retros/${today} Retro 1.md`, noteletNote(today, "Retro"));
  await seedNote(path_, hostNote("daily", today, "```journal-notelets\n```"));
  await openInReadingMode(path_);
  await $(selector).waitForExist({ timeoutMsg: `the journal-notelets block did not render (${suffix})` });
  await $(LIST_ROW).waitForExist({ timeoutMsg: `the journal-notelets block listed no rows (${suffix})` });

  await mkdir(ASSETS, { recursive: true });
  // A zero-width element cannot be captured; capture.ts's own stability wait, kept as-is since
  // width really is stable by the time rows exist.
  let consecutive = 0;
  await browser.waitUntil(
    async () => {
      const width = await browser.execute(
        (sel: string) => document.querySelector<HTMLElement>(sel)?.clientWidth ?? 0,
        selector,
      );
      consecutive = width > 0 ? consecutive + 1 : 0;
      return consecutive >= 3;
    },
    { timeoutMsg: `${selector} never settled on a laid-out width`, interval: 100 },
  );
  await browser.pause(250);
  await $(selector).saveScreenshot(path.join(ASSETS, `${name}-${suffix}.png`));

  return { headings: await textsOf(TYPE_HEADING), rows: await textsOf(LIST_ROW) };
}

function noteletNote(anchor: string, type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: ${type}\n${extra}---\n`;
}

describe("notelets examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  it("numbers a Meeting notelet created twice for today", async () => {
    const today = todayAnchor();

    await runCommand("journals:create-meeting");
    const first = await waitForActiveNoteIn("day/meetings");
    await waitForFrontmatter(
      first,
      (frontmatter) => frontmatter["journal-notelet-index"] === 1,
      "waited for the first Meeting notelet's counter to reach metadataCache",
    );
    const firstFrontmatter = await frontmatterOf(first);

    await runCommand("journals:create-meeting");
    // waitForActiveNoteIn would be satisfied instantly by the note the FIRST create already
    // left active (same folder), so the second create has to be waited for by difference.
    let second = "";
    await waitForState(
      activeNotePath,
      (active) => {
        second = active;
        return active.startsWith("day/meetings/") && active !== first;
      },
      "waited for the second Meeting notelet to become active",
    );
    await waitForFrontmatter(
      second,
      (frontmatter) => frontmatter["journal-notelet-index"] === 2,
      "waited for the second Meeting notelet's counter to reach metadataCache",
    );
    const secondFrontmatter = await frontmatterOf(second);

    await recordOutcome("notelets-meeting", {
      today,
      first: { path: first, index: firstFrontmatter?.["journal-notelet-index"] },
      second: { path: second, index: secondFrontmatter?.["journal-notelet-index"] },
    });
  });

  it("suffixes a second Retro notelet whose name does not vary within the day", async () => {
    const today = todayAnchor();

    await runCommand("journals:create-retro");
    const first = await waitForActiveNoteIn("day/retros");
    await waitForFrontmatter(
      first,
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "waited for the first Retro notelet to reach metadataCache",
    );

    await runCommand("journals:create-retro");
    let second = "";
    await waitForState(
      activeNotePath,
      (active) => {
        second = active;
        return active.startsWith("day/retros/") && active !== first;
      },
      "waited for the second Retro notelet to become active",
    );
    await waitForFrontmatter(
      second,
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "waited for the second Retro notelet to reach metadataCache",
    );

    await recordOutcome("notelets-retro", {
      today,
      first,
      second,
      suffixed: second !== first,
    });
  });

  it("lists today's notelets grouped by type in a journal-notelets fence", async () => {
    const today = todayAnchor();
    const path = `day/${today}.md`;

    let outcome: { headings: string[]; rows: string[] } | undefined;
    for (const theme of THEMES) {
      outcome = await seedAndCaptureThemed(theme.id, today, path, NOTELET_BLOCK, "notelets-block", theme.suffix);
    }

    await recordOutcome("notelets-block", { today, ...outcome });
  });

  it("creates a Meeting notelet through an obsidian://journals notelet link", async () => {
    await closeAllLeaves();
    await openViaUri({ journal: "daily", notelet: "Meeting" });

    const path = await waitForActiveNoteIn("day/meetings");
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
      "waited for the link-created Meeting notelet to reach metadataCache",
    );
    const frontmatter = await frontmatterOf(path);

    await recordOutcome("notelets-link", { path, frontmatter });
  });
});

describe("questions examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("answers a sprint's goal question and writes it to a property", async () => {
    const anchor = "2030-07-01";
    const path = "sprint 1.md";

    await openViaUri({ journal: "sprint", date: anchor });
    await waitForModalOpen();
    const title = await $(DIALOG_TITLE).getText();

    await setModalText("Clear the backlog");
    await submitModal();

    await waitForJournalFrontmatter(path, { journal: "sprint", date: anchor });
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter.goal === "Clear the backlog",
      "waited for the goal answer to reach the note's frontmatter",
    );
    const frontmatter = await frontmatterOf(path);

    await recordOutcome("questions-sprint-goal", { anchor, title, path, frontmatter });
  });
});
