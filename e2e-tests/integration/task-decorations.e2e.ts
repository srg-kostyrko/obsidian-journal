import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  closeAnyMenu,
  dayAnchor,
  expectDecorated,
  menuItemTitles,
  note,
  rightClickCell,
} from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import { seedNote } from "../support/vault.js";

// The user-visible change this branch ships: a checkbox marker other than a space used to read
// as completed unconditionally (`task !== " "`), so a day whose only task was `- [/] In progress`
// decorated as "all tasks completed". The checkbox provider now normalizes `/` to `in-progress`
// through the default status map (no configuration needed), which `isOpen` counts as open — so
// the same note should instead satisfy `has-open-task`.
//
// This exercises the real chain the mock-based unit suite cannot: metadataCache's real
// `listItems` -> NoteStructureService -> CheckboxTaskProvider -> TaskIndex -> the decoration
// engine's `has-open-task` check -> the calendar's real render.
const DAY = 14;

describe("task decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-task-decorations", plugins: ["journals"] });
  });

  it("decorates a day cell whose note holds an in-progress checkbox task", async () => {
    const anchor = dayAnchor(DAY);
    await seedNote(`${anchor}.md`, note("daily", anchor, "- [/] In progress"));

    await openSeededCalendarView();

    const cell = calendar.cell(anchor);
    await expectDecorated(cell);

    // A second, independent read of the same decorated state: a genuinely decorated cell offers
    // the "Explain decorations" context-menu entry every other decorated cell does.
    await rightClickCell(anchor);
    const titles = await menuItemTitles();
    expect(titles).toContain(m.decoration_explain_menu_item());
    await closeAnyMenu();
  });
});
