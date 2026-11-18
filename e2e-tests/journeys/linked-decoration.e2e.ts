import { $, browser } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { seedNote, waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor, expectDecorated, expectUndecorated, rightClickCell } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

// The linked condition counts links Obsidian reports in metadataCache — resolved links once a
// note exists, unresolved link text before — which only a real Obsidian produces; the unit
// suite's index is fed by hand. The fixture's one decoration is the motivating recipe:
// "linked from at least 1 note" AND "has note: missing", so a date marks while notes link to
// it and has no note, and clears once its note is created.
const LINKED_DAY = 20;
const UNLINKED_DAY = 22;

describe("linked decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-linked-decoration", plugins: ["journals"] });
  });

  it("marks a linked date that has no note, explains why, and clears once the calendar creates its note", async () => {
    const anchor = dayAnchor(LINKED_DAY);
    await seedNote("plan.md", `Ship it on [[${anchor}]].\n`);

    await openSeededCalendarView();

    await expectDecorated(calendar.cell(anchor));
    // Absent elements pass expectUndecorated at once, so it only rules something out after the
    // linked cell has proven this render's link counts landed.
    await expectUndecorated(calendar.cell(dayAnchor(UNLINKED_DAY)));

    await rightClickCell(anchor);
    const explain = $(`.menu-item-title=${m.decoration_explain_menu_item()}`);
    await explain.waitForClickable({ timeoutMsg: "the explain item did not become clickable" });
    await explain.click();
    const breakdown = $(".decoration-breakdown__cell");
    await breakdown.waitForExist({ timeoutMsg: "the explain modal did not open on the linked cell" });
    await browser.waitUntil(
      async () => {
        const text = await breakdown.getText();
        return (
          text.includes(m.decoration_condition_linked_describe({ count: 1 })) &&
          text.includes(m.decoration_condition_has_note_describe_missing())
        );
      },
      { timeoutMsg: "the explain modal did not name the linked and missing-note conditions" },
    );
    await browser.keys("Escape");
    // Obsidian fades the modal container out after the content unmounts; a click sent
    // during the fade lands on the overlay, not the cell.
    await $(".modal-container").waitForExist({ reverse: true, timeoutMsg: "the explain modal did not close" });

    // The seeded view opens in the right sidebar, which a narrow window leaves partly
    // off-screen; bring the cell in rather than let WebDriver retry the click blind.
    await calendar.cell(anchor).scrollIntoView({ block: "center", inline: "center" });
    await calendar.cell(anchor).click();
    await waitForJournalFrontmatter(`${anchor}.md`, { journal: "daily", date: anchor });

    await expectUndecorated(calendar.cell(anchor));
  });
});
