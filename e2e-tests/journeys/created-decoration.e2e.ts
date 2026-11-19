import { $, $$, browser } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { dayAnchor, expectDecorated, expectUndecorated, rightClickCell } from "./decorations.js";
import { calendar, LIVE_LEAF, openCalendarView } from "./view.js";

// The created condition dates notes through a vault-wide index fed by real vault and
// metadataCache events, which only a real Obsidian produces. Every seeded note carries a
// `created` property: a file's own creation time is whenever the harness wrote it — today —
// so a note without the property would land on today's cell, which this spec never reads.
//
// The fixture's daily journal has one decoration, "at least 1 note created", and a view whose
// Notes by date block covers the month with Hide journal notes on, so it lists exactly what
// the condition counts.
const [PLAIN_DAY, NOTELET_DAY, PERIOD_NOTE_DAY] = [9, 11, 13, 15].filter((day) => day !== new Date().getDate());

describe("created decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-created-decoration", plugins: ["journals"] });
  });

  it("marks days notes were created on, notelets included, and leaves out the journal's own notes", async () => {
    const plain = dayAnchor(PLAIN_DAY);
    const notelet = dayAnchor(NOTELET_DAY);
    const periodNote = dayAnchor(PERIOD_NOTE_DAY);
    await seedNote("Ideas.md", `---\ncreated: ${plain}\n---\nSome ideas.\n`);
    await seedNote(
      `notelets/${notelet} Meeting.md`,
      `---\njournal: daily\njournal-date: ${notelet}\njournal-notelet: Meeting\ncreated: ${notelet}\n---\n`,
    );
    // Dated by its property to its own day, so only the period-note exclusion keeps it unmarked.
    await seedNote(
      `${periodNote}.md`,
      `---\njournal: daily\njournal-date: ${periodNote}\ncreated: ${periodNote}\n---\n`,
    );

    await openCalendarView();

    await expectDecorated(calendar.cell(plain));
    await expectDecorated(calendar.cell(notelet));
    // Absent elements pass expectUndecorated at once, so it only rules something out after the
    // marked cells have proven this render's creation dates landed.
    await expectUndecorated(calendar.cell(periodNote));

    await rightClickCell(plain);
    const explain = $(`.menu-item-title=${m.decoration_explain_menu_item()}`);
    await explain.waitForClickable({ timeoutMsg: "the explain item did not become clickable" });
    await explain.click();
    const breakdown = $(".decoration-breakdown__cell");
    await breakdown.waitForExist({ timeoutMsg: "the explain modal did not open on the created cell" });
    await waitForState(
      () => breakdown.getText(),
      (text) => text.includes(m.decoration_condition_created_describe({ count: 1 })),
      "the explain modal did not name the created condition",
    );
    await browser.keys("Escape");
    await $(".modal-container").waitForExist({ reverse: true, timeoutMsg: "the explain modal did not close" });

    const notesByDate = `${LIVE_LEAF} section[aria-label="${m.view_block_day_notes_label()}"]`;
    const expected = ["Ideas", `${notelet} Meeting`].toSorted();
    await waitForState(
      async () => {
        const titles = await $$(`${notesByDate} .journal-view-day-notes__title`).map(async (title) => title.getText());
        return titles.map((title) => title.trim()).toSorted();
      },
      (listed) => listed.length === expected.length && listed.every((title, i) => title === expected[i]),
      "Notes by date with Hide journal notes did not list exactly the notes the condition counts",
    );
  });
});
