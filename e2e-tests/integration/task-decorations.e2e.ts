import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  closeAnyMenu,
  dayAnchor,
  expectDecorated,
  expectUndecorated,
  menuItemTitles,
  note,
  rightClickCell,
} from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import { seedNote } from "../support/vault.js";

// Exercises the real chain the mock-based unit suite cannot: metadataCache's real
// `listItems` -> NoteStructureService -> CheckboxTaskProvider -> TaskIndex -> the decoration
// engine's `tasks` condition (migrated from the stored `has-open-task`) -> the calendar's real render.
const DAY = 14;
const NOTELET_DAY = 16;

function notelet(anchor: string, body: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: Meeting\n---\n${body}\n`;
}

describe("task decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-task-decorations", plugins: ["journals"] });
  });

  // The fixture stores the pre-7 `has-open-task`; this runs on what the boot migration made of it.
  it("decorates a day cell whose note holds an in-progress checkbox task", async () => {
    const anchor = dayAnchor(DAY);
    await seedNote(`${anchor}.md`, note("daily", anchor, "- [/] In progress"));

    await openSeededCalendarView();

    const cell = calendar.cell(anchor);
    await expectDecorated(cell);

    await rightClickCell(anchor);
    const titles = await menuItemTitles();
    expect(titles).toContain(m.decoration_explain_menu_item());
    await closeAnyMenu();
  });
});

describe("task decoration condition over a notelet", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-task-decorations", plugins: ["journals"] });
  });

  it("decorates a day whose period note has only a done item but whose notelet has an open one", async () => {
    const anchor = dayAnchor(NOTELET_DAY);
    await seedNote(`${anchor}.md`, note("daily", anchor, "- [x] Done"));
    await openSeededCalendarView();
    await expectUndecorated(calendar.cell(anchor));

    await seedNote(`notelets/${anchor} Meeting 1.md`, notelet(anchor, "- [ ] Follow up"));

    await expectDecorated(calendar.cell(anchor));
  });
});
