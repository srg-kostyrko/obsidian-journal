import { $, browser, expect } from "@wdio/globals";

import {
  activeNotePath,
  renameNote,
  seedNote,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
  writeNote,
} from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import {
  DECO_DAY,
  STYLE_HEX,
  assertDecorationMatrix,
  dayAnchor,
  expectBackgroundCleared,
  expectBackgroundHex,
  expectDecorated,
  expectTextHex,
  expectUndecorated,
  note,
  seedDecorationFixture,
} from "./decorations.js";
import { calendar, openCalendarView, TOOLBAR } from "./view.js";

// Slice B chunk 0 — the view-leaf render + real ribbon-click seam. Our Vue calendar
// mounts in a real Obsidian leaf, a real ribbon click opens it, and a real cell
// click drives OpenDateFlow -> note create+open. None of this is reachable through
// __mocks__/obsidian.ts, which renders no leaf and has no ribbon.

const headerMonthAnchor = async (): Promise<string | undefined> =>
  (await calendar.periodCell("header-month").getAttribute("data-anchor")) ?? undefined;

describe("calendar view", () => {
  describe("journeys", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    it("creates, opens, and live-activates a day note when its calendar cell is clicked", async () => {
      const anchor = dayAnchor(15);
      const path = `day/${anchor}.md`;

      await openCalendarView();
      await calendar.cell(anchor).click();

      await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
      await calendar.waitForActive(anchor);
      expect(await activeNotePath()).toBe(path);
    });

    it("creates and opens a week note when the week-number cell is clicked", async () => {
      await openCalendarView();
      await calendar.periodCell("week-number-cell").click();

      const path = await waitForActiveNoteIn("week");
      await waitForFrontmatter(path, (fm) => fm.journal === "weekly", `waited for ${path} to attach journal=weekly`);
    });

    it("creates and opens a month note when the month header cell is clicked", async () => {
      await openCalendarView();
      await calendar.periodCell("header-month").click();

      const path = await waitForActiveNoteIn("month");
      await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);
    });

    it("creates and opens a quarter note when the quarter header cell is clicked", async () => {
      await openCalendarView();
      await calendar.periodCell("header-quarter").click();

      const path = await waitForActiveNoteIn("quarter");
      await waitForFrontmatter(
        path,
        (fm) => fm.journal === "quarterly",
        `waited for ${path} to attach journal=quarterly`,
      );
    });

    it("creates and opens a year note when the year header cell is clicked", async () => {
      await openCalendarView();
      await calendar.periodCell("header-year").click();

      const path = await waitForActiveNoteIn("year");
      await waitForFrontmatter(path, (fm) => fm.journal === "yearly", `waited for ${path} to attach journal=yearly`);
    });
  });

  describe("decorations", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
      await seedDecorationFixture();
    });

    assertDecorationMatrix(calendar);

    describe("interactive shelf scope", () => {
      it("re-scopes decorations when a shelf is picked from the toolbar menu", async () => {
        // Precondition: with the default (null) shelf, both the out-of-scope (yearly,
        // shelf "extra") and the in-scope (daily, shelf "core") decorations render.
        await expectBackgroundHex(calendar.periodCell("header-year"), STYLE_HEX.background);
        await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);

        // Drive the real toolbar shelf menu — the click dispatch through Obsidian's own
        // Menu is slice B's seam. Obsidian's Menu exposes no ARIA roles, so the text-
        // pinned .menu-item-title is the only stable handle on chrome we don't own.
        await $("button*=All journals").click();
        const menu = $(".menu");
        await menu.waitForExist({ timeoutMsg: "shelf selector menu did not open" });
        await menu.$(".menu-item-title=core").click();

        await expectBackgroundCleared(calendar.periodCell("header-year"), STYLE_HEX.background);
        await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
      });
    });
  });

  // Distinct from the matrix above, which renders against notes seeded before the cells
  // mount. Here the view is already open and we edit a note in place — the cell must
  // re-decorate off the live metadata-changed / index entryChanged events, no remount.
  // View-leaf surface only: the live re-eval lives in the shared useCellDecorations
  // composable, so proving it on one mount covers the code-block mount too.
  describe("live editing", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
      await openCalendarView();
    });

    it("decorates a day cell when a matching tag is added to its note", async () => {
      const anchor = dayAnchor(8);
      const path = "day/tag-add.md";
      await seedNote(path, note("daily", anchor));
      await waitForFrontmatter(path, (fm) => fm.journal === "daily", `waited for ${path} to be indexed`);
      await expectUndecorated(calendar.cell(anchor));

      await writeNote(path, note("daily", anchor, "marker #ctag"));

      await expectDecorated(calendar.cell(anchor));
    });

    it("clears a day cell's decoration when the matching tag is removed from its note", async () => {
      const anchor = dayAnchor(9);
      const path = "day/tag-remove.md";
      await seedNote(path, note("daily", anchor, "marker #ctag"));
      await expectDecorated(calendar.cell(anchor));

      await writeNote(path, note("daily", anchor, "marker with no tag"));

      await expectUndecorated(calendar.cell(anchor));
    });

    it("decorates a day cell when its note is renamed to match the title condition", async () => {
      const anchor = dayAnchor(11);
      const from = "day/rename-target.md";
      await seedNote(from, note("daily", anchor));
      await waitForFrontmatter(from, (fm) => fm.journal === "daily", `waited for ${from} to be indexed`);
      await expectUndecorated(calendar.cell(anchor));

      await renameNote(from, "day/rename-target-07.md");

      await expectDecorated(calendar.cell(anchor));
    });

    it("clears a day cell's decoration when its note is renamed off the title condition", async () => {
      const anchor = dayAnchor(12);
      const from = "day/keep-07.md";
      await seedNote(from, note("daily", anchor));
      await expectDecorated(calendar.cell(anchor));

      await renameNote(from, "day/keep-plain.md");

      await expectUndecorated(calendar.cell(anchor));
    });

    it("decorates a day cell when a matching property is added to its note", async () => {
      const anchor = dayAnchor(14);
      const path = "day/property-add.md";
      await seedNote(path, note("daily", anchor));
      await waitForFrontmatter(path, (fm) => fm.journal === "daily", `waited for ${path} to be indexed`);
      await expectUndecorated(calendar.cell(anchor));

      // cspell:disable-next-line
      await writeNote(path, note("daily", anchor, "", ["cprop: present"]));

      await expectDecorated(calendar.cell(anchor));
    });

    it("clears a day cell's decoration when the matching property is removed from its note", async () => {
      const anchor = dayAnchor(17);
      const path = "day/property-remove.md";
      // cspell:disable-next-line
      await seedNote(path, note("daily", anchor, "", ["cprop: present"]));
      await expectDecorated(calendar.cell(anchor));

      await writeNote(path, note("daily", anchor));

      await expectUndecorated(calendar.cell(anchor));
    });

    it("clears the week cell's decoration when its note's open task is checked off", async () => {
      const week = (await calendar.periodCell("week-number-cell").getAttribute("data-anchor")) ?? "";
      const path = "week/live-weekly.md";
      await seedNote(path, note("weekly", week, "- [ ] open"));
      await expectDecorated(calendar.periodCell("week-number-cell"));

      await writeNote(path, note("weekly", week, "- [x] done"));

      await expectUndecorated(calendar.periodCell("week-number-cell"));
    });

    it("decorates the month header when its note's last open task is checked off", async () => {
      const month = (await calendar.periodCell("header-month").getAttribute("data-anchor")) ?? "";
      const path = "month/live-monthly.md";
      await seedNote(path, note("monthly", month, "- [ ] open"));
      await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to be indexed`);
      await expectUndecorated(calendar.periodCell("header-month"));

      await writeNote(path, note("monthly", month, "- [x] done"));

      await expectDecorated(calendar.periodCell("header-month"));
    });
  });

  describe("toolbar", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    it("advances the calendar a month when the next-month button is clicked", async () => {
      await openCalendarView();
      const start = await headerMonthAnchor();

      await $(`${TOOLBAR} [aria-label="Next month"]`).click();

      await waitForState(headerMonthAnchor, (anchor) => anchor !== start, "header-month did not advance");
    });

    it("rewinds the calendar a month when the previous-month button is clicked", async () => {
      await openCalendarView();
      const start = await headerMonthAnchor();

      await $(`${TOOLBAR} [aria-label="Next month"]`).click();
      await waitForState(headerMonthAnchor, (anchor) => anchor !== start, "header-month did not advance");

      await $(`${TOOLBAR} [aria-label="Previous month"]`).click();

      await waitForState(headerMonthAnchor, (anchor) => anchor === start, "header-month did not return");
    });

    it("creates and opens this month's note when the month period button is clicked", async () => {
      await openCalendarView();
      await $(`${TOOLBAR} [data-period="month"]`).click();

      const path = await waitForActiveNoteIn("month");
      await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);

      await waitForState(
        async () => (await $(`${TOOLBAR} [data-period="month"]`).getAttribute("data-active")) ?? undefined,
        (active) => active === "true",
        "month period button did not become active after its note opened",
      );
    });

    it("creates and opens today's day note when the Today button is clicked", async () => {
      await openCalendarView();
      await $(`${TOOLBAR} [aria-label="Today"]`).click();

      const path = await waitForActiveNoteIn("day");
      await waitForFrontmatter(path, (fm) => fm.journal === "daily", `waited for ${path} to attach journal=daily`);
    });
  });
});
