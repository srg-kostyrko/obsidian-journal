import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { expectDecorated, expectUndecorated } from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import { waitForNotice } from "../support/notices.js";
import { closeSettings, expandSection, openSettings } from "../support/settings.js";
import { frontmatterOf, seedNote, todayAnchor, waitForFrontmatter } from "../support/vault.js";

// The real chain the unit suite fakes end to end: metadataCache's frontmatter and tags ->
// NotePropertyTaskProvider -> TaskIndex's date lookup -> the fence and the decoration engine, and a
// tick written back through Obsidian's own processFrontMatter.
const FIXTURE = "./e2e-tests/fixtures/e2e-task-notes";

// Far from today, so nothing the calendar test seeds can land on this day.
const LIST_DAY = "2026-03-10";
const DAY_NOTE = `${LIST_DAY}.md`;
const TASK_NOTE = "Tasks/Write the report.md";
const RECURRING_NOTE = "Tasks/Water the plants.md";

// The fixture ships these task notes, so they exist at boot and the provider's whole-vault walk is
// what lists them: its "all" publish replaces whatever came before it. That a walk runs at start is
// not falsifiable here — a fresh fixture's cold metadataCache fires "changed" for every note, which
// lists them anyway — so the unit suite owns the trigger. Their day is apart from LIST_DAY and today.
const SHIPPED_DAY = "2026-04-14";
const SHIPPED_DAY_NOTE = `${SHIPPED_DAY}.md`;
const SHIPPED_TITLES = ["Shipped with the vault", "Tagged as a string"] as const;
const BODY_TAGGED_TITLE = "Tagged in the body only";
const PROVIDER_TOGGLE = '[data-testid="note-property-enabled"]';

const TASKS_BLOCK = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks`;
const TASK_ROWS = `${TASKS_BLOCK} .task-listing-row`;
const EMPTY = `${TASKS_BLOCK} .task-listing__empty`;

function taskNote(fields: readonly string[]): string {
  return `---\ntags: [task]\n${fields.join("\n")}\n---\n`;
}

// Picked by rendered text, not by position: the listing's order is not what these tests are about.
async function rowTitled(title: string) {
  let index = -1;
  await browser.waitUntil(
    async () => {
      const texts = await $$(TASK_ROWS).map((row) => row.$(".task-listing-row__line").getText());
      index = texts.findIndex((text) => text.includes(title));
      return index >= 0;
    },
    { timeoutMsg: `no listing row reads "${title}"` },
  );
  return $$(TASK_ROWS)[index];
}

async function expectShippedListing(): Promise<void> {
  await openInReadingMode(SHIPPED_DAY_NOTE);
  for (const title of SHIPPED_TITLES) await rowTitled(title);
  await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(SHIPPED_TITLES.length);
  expect(await $(TASKS_BLOCK).getText()).not.toContain(BODY_TAGGED_TITLE);
}

async function clickProviderToggle(expected: "true" | "false"): Promise<void> {
  await openSettings();
  await expandSection(m.tasks_settings_title());
  await $(PROVIDER_TOGGLE).click();
  await expect($(PROVIDER_TOGGLE)).toHaveAttribute("aria-checked", expected);
  await closeSettings();
}

describe("task notes in a journal-tasks fence", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(TASK_NOTE, taskNote(["status: open", `scheduled: ${LIST_DAY}`, "title: Draft the report"]));
    await seedNote(RECURRING_NOTE, taskNote(["status: open", `due: ${LIST_DAY}`, "recurrence: FREQ=WEEKLY"]));
    await seedNote(DAY_NOTE, hostNote("daily", LIST_DAY, "```journal-tasks\n```"));
  });

  it("lists a task note scheduled on the day as a link titled from its title property", async () => {
    await openInReadingMode(DAY_NOTE);

    const row = await rowTitled("Draft the report");
    await expect(row.$("a.internal-link")).toHaveText("Draft the report");
    await expect(row.$("input[type=checkbox]")).not.toBeChecked();
    // The title property, not the file name, names the row; the file name is never shown.
    expect(await $(TASKS_BLOCK).getText()).not.toContain("Write the report");
    // Due rather than scheduled still places a note on the day under the default date choice.
    await rowTitled("Water the plants");
  });

  it("refuses to tick a recurring task note and leaves its status alone", async () => {
    await openInReadingMode(DAY_NOTE);

    const row = await rowTitled("Water the plants");
    await row.$("input[type=checkbox]").click();

    await waitForNotice(m.tasks_tick_recurring_task_note());
    const frontmatter = await frontmatterOf(RECURRING_NOTE);
    expect(frontmatter?.status).toBe("open");
    expect(frontmatter).not.toHaveProperty("completedDate");
  });

  it("ticking a task note writes done into its status property and drops it from the open listing", async () => {
    await openInReadingMode(DAY_NOTE);

    const row = await rowTitled("Draft the report");
    await row.$("input[type=checkbox]").click();

    await waitForFrontmatter(
      TASK_NOTE,
      (frontmatter) => frontmatter.status === "done",
      `waited for ticking "Draft the report" to write status: done into ${TASK_NOTE}`,
    );
    const frontmatter = await frontmatterOf(TASK_NOTE);
    expect(frontmatter?.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(frontmatter?.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u);
    expect(frontmatter?.scheduled).toBe(LIST_DAY);

    // Only the recurring note is still open, so the done one leaves the default open-only listing.
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(1);
    await rowTitled("Water the plants");
  });

  it("says the listing is empty once no task note on the day is open", async () => {
    await seedNote(RECURRING_NOTE, taskNote(["status: done", `due: ${LIST_DAY}`]));
    await openInReadingMode(DAY_NOTE);

    await expect($(EMPTY)).toHaveText(m.tasks_listing_empty());
  });
});

describe("task notes the vault already holds at boot", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(SHIPPED_DAY_NOTE, hostNote("daily", SHIPPED_DAY, "```journal-tasks\n```"));
  });

  // A tag in the frontmatter's list or string form identifies a task note; a #task in the body does
  // not, though that note carries a scheduled date on the same day.
  it("lists the task notes found by the boot walk, by frontmatter tag only", async () => {
    await expectShippedListing();
  });

  it("lists them again after the provider is turned off and back on in settings", async () => {
    await clickProviderToggle("false");
    await openInReadingMode(SHIPPED_DAY_NOTE);
    await expect($(EMPTY)).toHaveText(m.tasks_listing_empty());

    await clickProviderToggle("true");
    await expectShippedListing();
  });
});

describe("task notes on the calendar", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("lights today's cell for an open task note scheduled today, with no day note for today", async () => {
    const today = todayAnchor();
    // The fixture ships no day note, and nothing below creates one for today: the dot has to come
    // from the task note alone.
    const dayNoteExists = await browser.executeObsidian(
      ({ app }, anchor) => app.vault.getMarkdownFiles().some((file) => file.basename === anchor),
      today,
    );
    expect(dayNoteExists).toBe(false);

    await openSeededCalendarView();
    await expectUndecorated(calendar.cell(today));

    await seedNote("Tasks/Call the bank.md", taskNote(["status: open", `scheduled: ${today}`]));

    await expectDecorated(calendar.cell(today));
  });
});
