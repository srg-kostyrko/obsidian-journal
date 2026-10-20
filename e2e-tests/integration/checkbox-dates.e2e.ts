import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { expectDecorated, expectUndecorated } from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openSettings,
  waitForModalOpen,
} from "../support/settings.js";
import { seedNote, todayAnchor } from "../support/vault.js";

// A checkbox line in a note no journal owns reaches the day its date names: Obsidian's metadataCache
// -> the checkbox provider's vault walk -> TaskIndex's date lookup -> the fence and the decoration
// engine. The fixture's Projects/ folder sits outside every journal folder, so containment cannot
// pass these lines on; only the date relation can.
const FIXTURE = "./e2e-tests/fixtures/e2e-checkbox-dates";

const LIST_DAY = "2026-03-10";
const NEXT_DAY = "2026-03-11";
const DAY_NOTE = `${LIST_DAY}.md`;
const NEXT_DAY_NOTE = `${NEXT_DAY}.md`;
const PROJECT_NOTE = "Projects/Launch.md";

const TASK_ROWS = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks .task-listing-row`;
// The listing renders its empty state until its first async build lands, so an empty listing proves
// nothing: the day note carries this open checkbox task too, and a listing showing it has been built.
const CHECKBOX_TASK = "Feed the cat";
const FENCE_WITH_CHECKBOX = `- [ ] ${CHECKBOX_TASK}\n\n\`\`\`journal-tasks\n\`\`\``;

async function rowTexts(): Promise<string[]> {
  return $$(TASK_ROWS).map((row) => row.$(".task-listing-row__line").getText());
}

async function rowTitled(title: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const texts = await rowTexts();
      return texts.some((text) => text.includes(title));
    },
    {
      timeoutMsg: `no listing row reads "${title}"`,
    },
  );
}

async function expectNoRowTitled(title: string): Promise<void> {
  await rowTitled(CHECKBOX_TASK);
  const texts = await rowTexts();
  expect(texts.some((text) => text.includes(title))).toBe(false);
}

describe("dated checkbox lines in notes no journal owns", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(DAY_NOTE, hostNote("daily", LIST_DAY, FENCE_WITH_CHECKBOX));
    await seedNote(NEXT_DAY_NOTE, hostNote("daily", NEXT_DAY, FENCE_WITH_CHECKBOX));
  });

  it("lists a dated line from a note no journal owns in that day's note", async () => {
    await openInReadingMode(DAY_NOTE);

    await rowTitled("Book the venue");
    await rowTitled(CHECKBOX_TASK);
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(2);
    const rows = await rowTexts();
    const texts = rows.join("\n");
    expect(texts).not.toContain("Undated chore");
    // Archive/ is in the vault's excluded files, so its dated line never reaches the day.
    expect(texts).not.toContain("Archived");
  });

  it("follows an edit to the line's date", async () => {
    await seedNote(PROJECT_NOTE, `- [ ] Book the venue 📅 ${NEXT_DAY}\n- [ ] Undated chore\n`);

    // The new day's row proves the index holds the moved date before the old day is checked.
    await openInReadingMode(NEXT_DAY_NOTE);
    await rowTitled("Book the venue");

    await openInReadingMode(DAY_NOTE);
    await expectNoRowTitled("Book the venue");
  });

  it("dates a nested child line, never its undated parent", async () => {
    await seedNote("Projects/Plan.md", `- [ ] Plan the launch\n\t- [ ] Send invites 📅 ${LIST_DAY}\n`);

    await openInReadingMode(DAY_NOTE);
    await rowTitled("Send invites");
    await expectNoRowTitled("Plan the launch");
  });
});

describe("a dated checkbox line on the calendar", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("lights the day's cell for it, with no note for that day", async () => {
    const today = todayAnchor();
    const dayNoteExists = await browser.executeObsidian(
      ({ app }, anchor) => app.vault.getMarkdownFiles().some((file) => file.basename === anchor),
      today,
    );
    expect(dayNoteExists).toBe(false);

    await openSeededCalendarView();
    await expectUndecorated(calendar.cell(today));

    await seedNote("Projects/Today.md", `- [ ] Call the printer 📅 ${today}\n`);

    await expectDecorated(calendar.cell(today));
  });
});

// `personal` owns its own folder and a timeline of March 2026 alone, so the seeded Calendar view's
// "today" — which spans every journal — still resolves to `daily` alone for the calendar test above.
const PERSONAL_NOTE = `Personal/${LIST_DAY}.md`;
const DATED_SUMMARY = '[data-testid="checkbox-journal-dated-summary"]';
const DIALOG = ".modal-container:not(:has(.mod-settings))";

describe("the dated tasks a journal shows", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(DAY_NOTE, hostNote("daily", LIST_DAY, FENCE_WITH_CHECKBOX));
    await seedNote(PERSONAL_NOTE, hostNote("personal", LIST_DAY, FENCE_WITH_CHECKBOX));
  });

  afterEach(closeSettings);

  it("a journal set to None no longer lists the project line", async () => {
    await openInReadingMode(PERSONAL_NOTE);
    await rowTitled("Book the venue");

    await openSettings();
    await clickIcon(m.journal_dashboard_edit({ name: "personal" }));
    await expandSection(m.tasks_settings_title());
    await expect($(DATED_SUMMARY)).toHaveText(m.tasks_checkbox_dated_summary_all());
    await $('[data-testid="checkbox-journal-edit"]').click();
    await waitForModalOpen();
    await $(DIALOG).$('[data-testid="note-visibility-show"]').$(`span=${m.tasks_note_visibility_show_none()}`).click();
    // The compose buttons carry mod-cta too while Inherit is chosen, so submitModal would click Inherit.
    await $(DIALOG).$(`button=${m.common_action_submit()}`).click();
    await $(DIALOG).waitForExist({ reverse: true, timeoutMsg: "modal did not close after submit" });
    await expect($(DATED_SUMMARY)).toHaveText(m.tasks_checkbox_dated_summary_none());
    await goBack();
    await closeSettings();

    await openInReadingMode(PERSONAL_NOTE);
    await expectNoRowTitled("Book the venue");

    await openInReadingMode(DAY_NOTE);
    await rowTitled("Book the venue");
  });
});

// Obsidian's adapter removes every file under a trashed folder one by one, and the vault raises
// "delete" for each before the folder's own — so the provider's per-path "deleted" handler is what
// drops these lines, with no folder-level sweep needed.
describe("a dated checkbox line in a trashed folder", () => {
  const TRIP = "Scratch/Trip.md";
  const GEAR = "Scratch/Gear/List.md";

  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await seedNote(DAY_NOTE, hostNote("daily", LIST_DAY, FENCE_WITH_CHECKBOX));
    await seedNote(TRIP, `- [ ] Pack the tent 📅 ${LIST_DAY}\n`);
    await seedNote(GEAR, `- [ ] Buy a stove 📅 ${LIST_DAY}\n`);
  });

  it("leaves the day's listing once the folder holding it is trashed", async () => {
    await openInReadingMode(DAY_NOTE);
    await rowTitled("Pack the tent");
    await rowTitled("Buy a stove");

    const deleted = await browser.executeObsidian(async ({ app }) => {
      const folder = app.vault.getFolderByPath("Scratch");
      if (folder === null) return null;
      const paths: string[] = [];
      const ref = app.vault.on("delete", (file) => {
        paths.push(file.path);
      });
      await app.fileManager.trashFile(folder);
      app.vault.offref(ref);
      return paths;
    });
    expect(deleted).toEqual(expect.arrayContaining([TRIP, GEAR, "Scratch"]));

    await browser.waitUntil(
      async () => {
        const texts = await rowTexts();
        return (
          texts.some((text) => text.includes(CHECKBOX_TASK)) &&
          texts.every((text) => !text.includes("Pack the tent") && !text.includes("Buy a stove"))
        );
      },
      { timeoutMsg: "a line from the trashed folder is still listed" },
    );
  });
});
