import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { expectDecorated, expectUndecorated } from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import { waitForNotice } from "../support/notices.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openSettings,
  submitModal,
  waitForModalOpen,
} from "../support/settings.js";
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
// The listing renders its empty state until its first async build lands, so an empty listing proves
// nothing. Notes whose listing must lose its task notes carry this open checkbox task too: a listing
// showing it has been built, and one showing it alone has no task note left.
const CHECKBOX_TASK = "Feed the cat";
const FENCE_WITH_CHECKBOX = `- [ ] ${CHECKBOX_TASK}\n\n\`\`\`journal-tasks\n\`\`\``;

async function expectOnlyCheckboxTask(): Promise<void> {
  await rowTitled(CHECKBOX_TASK);
  await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(1);
}

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
  for (const title of [...SHIPPED_TITLES, CHECKBOX_TASK]) await rowTitled(title);
  await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(SHIPPED_TITLES.length + 1);
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

  it("lists no task note once none on the day is open", async () => {
    await seedNote(RECURRING_NOTE, taskNote(["status: done", `due: ${LIST_DAY}`]));
    await seedNote(DAY_NOTE, hostNote("daily", LIST_DAY, FENCE_WITH_CHECKBOX));
    await openInReadingMode(DAY_NOTE);

    await expectOnlyCheckboxTask();
  });
});

describe("task notes the vault already holds at boot", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(SHIPPED_DAY_NOTE, hostNote("daily", SHIPPED_DAY, FENCE_WITH_CHECKBOX));
  });

  // A tag in the frontmatter's list or string form identifies a task note; a #task in the body does
  // not, though that note carries a scheduled date on the same day.
  it("lists the task notes found by the boot walk, by frontmatter tag only", async () => {
    await expectShippedListing();
  });

  it("lists them again after the provider is turned off and back on in settings", async () => {
    await clickProviderToggle("false");
    await openInReadingMode(SHIPPED_DAY_NOTE);
    await expectOnlyCheckboxTask();

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

// Two day journals over one day, each narrowed through its own journal page. `personal`'s timeline
// is confined to 2019, so the seeded Calendar view's "today" — which spans every journal — still
// resolves to `daily` alone for the calendar test above.
const SHARED_DAY = "2019-06-04";
const DAILY_NOTE = `${SHARED_DAY}.md`;
const PERSONAL_NOTE = `Personal/${SHARED_DAY}.md`;
const WORK_TITLE = "Prepare the quarterly review";
const WORKSHOP_TITLE = "Book the pottery workshop";
const HOME_TITLE = "Fix the garden gate";
const SUMMARY = '[data-testid="note-property-journal-summary"]';
const DIALOG = ".modal-container:not(:has(.mod-settings))";

async function expectListing(path: string, titles: readonly string[]): Promise<void> {
  await openInReadingMode(path);
  for (const title of titles) await rowTitled(title);
  await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(titles.length);
}

async function openJournalTaskNotes(journal: string): Promise<void> {
  await openSettings();
  await clickIcon(m.journal_dashboard_edit({ name: journal }));
  await expandSection(m.tasks_settings_title());
  await expect($(SUMMARY)).toHaveText(m.tasks_note_visibility_summary_all());
  await $('[data-testid="note-property-journal-edit"]').click();
  await waitForModalOpen();
}

async function chooseShow(label: string): Promise<void> {
  await $(DIALOG).$('[data-testid="note-visibility-show"]').$(`span=${label}`).click();
}

describe("task notes a journal shows", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(
      "Tasks/Work/Quarterly review.md",
      `---\ntags: [task, work/planning]\nstatus: open\nscheduled: ${SHARED_DAY}\ntitle: ${WORK_TITLE}\n---\n`,
    );
    await seedNote(
      "Tasks/Pottery.md",
      `---\ntags: [task, workshop]\nstatus: open\nscheduled: ${SHARED_DAY}\ntitle: ${WORKSHOP_TITLE}\n---\n`,
    );
    await seedNote("Tasks/Garden gate.md", taskNote(["status: open", `due: ${SHARED_DAY}`, `title: ${HOME_TITLE}`]));
    await seedNote(DAILY_NOTE, hostNote("daily", SHARED_DAY, "```journal-tasks\n```"));
    await seedNote(PERSONAL_NOTE, hostNote("personal", SHARED_DAY, FENCE_WITH_CHECKBOX));
  });

  afterEach(closeSettings);

  it("lists every task note in both journals while neither narrows them", async () => {
    await expectListing(DAILY_NOTE, [WORK_TITLE, WORKSHOP_TITLE, HOME_TITLE]);
    await expectListing(PERSONAL_NOTE, [WORK_TITLE, WORKSHOP_TITLE, HOME_TITLE, CHECKBOX_TASK]);
  });

  // `#work` admits the nested `#work/planning` and not `#workshop`, which shares only a prefix.
  it("narrows one journal to a tag, set on its journal page, and leaves the other alone", async () => {
    await openJournalTaskNotes("daily");
    await chooseShow(m.tasks_note_visibility_show_matching());
    await $(DIALOG).$('[data-testid="note-visibility-add-condition"]').click();
    await $(DIALOG).$('[data-testid="note-visibility-condition"] input[type="text"]').setValue("#work");
    await submitModal();

    await expect($(SUMMARY)).toHaveText(
      m.tasks_note_visibility_summary_matching({
        conditions: m.tasks_note_visibility_condition_tag({ tags: "#work" }),
      }),
    );
    await goBack();
    await closeSettings();

    await expectListing(DAILY_NOTE, [WORK_TITLE]);
    await expectListing(PERSONAL_NOTE, [WORK_TITLE, WORKSHOP_TITLE, HOME_TITLE, CHECKBOX_TASK]);
  });

  // The checkbox task stays: None is about task notes, and the journal's checkbox tasks are its own.
  it("shows no task notes in a journal set to None, while the other keeps its own choice", async () => {
    await openJournalTaskNotes("personal");
    await chooseShow(m.tasks_note_visibility_show_none());
    await submitModal();

    await expect($(SUMMARY)).toHaveText(m.tasks_note_visibility_summary_none());
    await goBack();
    await closeSettings();

    await openInReadingMode(PERSONAL_NOTE);
    await expectOnlyCheckboxTask();
    await expectListing(DAILY_NOTE, [WORK_TITLE]);
  });
});
