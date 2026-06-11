import { $, browser, expect } from "@wdio/globals";

import {
  activeNotePath,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import {
  DECO_DAY,
  STYLE_HEX,
  dayAnchor,
  expectBackgroundCleared,
  expectBackgroundHex,
  expectBorderTop,
  expectTextHex,
  seedDecorationFixture,
} from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

// Slice B chunk 0 — the view-leaf render + real ribbon-click seam. Our Vue calendar
// mounts in a real Obsidian leaf, a real ribbon click opens it, and a real cell
// click drives OpenDateFlow -> note create+open. None of this is reachable through
// __mocks__/obsidian.ts, which renders no leaf and has no ribbon.

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

    describe("condition decorations", () => {
      it("decorates a day cell whose note title matches the title condition", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "title-condition decoration did not render on the matching day cell",
        });
      });

      it("decorates a day cell whose note carries the matching tag", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.tag)).$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "tag-condition decoration did not render on the matching day cell",
        });
      });

      it("decorates a day cell whose note has the matching frontmatter property", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.property)).$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "property-condition decoration did not render on the matching day cell",
        });
      });

      it("decorates the quarter header when the quarter journal has a note", async () => {
        await calendar.periodCell("header-quarter").$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "has-note decoration did not render on the quarter header",
        });
      });

      it("decorates the week cell when its note has an open task", async () => {
        await calendar.periodCell("week-number-cell").$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "has-open-task decoration did not render on the week cell",
        });
      });

      it("decorates the month header when its note's tasks are all completed", async () => {
        await calendar.periodCell("header-month").$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "all-tasks-completed decoration did not render on the month header",
        });
      });

      it("leaves a cell with no matching note undecorated", async () => {
        // First prove the engine has run (a matched cell is decorated), then assert the
        // control cell — with no seeded note — carries no decoration.
        await calendar.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "decoration engine never ran (title cell undecorated before the control assertion)",
        });
        await expect(calendar.cell(dayAnchor(DECO_DAY.control)).$(".decoration-corner")).not.toExist();
      });
    });

    describe("style decorations", () => {
      it("renders the background color through Obsidian's real CSS cascade", async () => {
        await expectBackgroundHex(calendar.periodCell("header-year"), STYLE_HEX.background);
      });

      it("renders the text color through Obsidian's real CSS cascade", async () => {
        await expectTextHex(calendar.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
      });

      it("renders the border through Obsidian's real CSS cascade", async () => {
        await expectBorderTop(calendar.cell(dayAnchor(DECO_DAY.border)), "3px", STYLE_HEX.border);
      });

      it("renders a shape decoration element", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.shape)).$(".shape-decoration.shape-circle").waitForExist({
          timeoutMsg: "shape decoration did not render on the matching day cell",
        });
      });

      it("renders a corner decoration element at the configured placement", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.corner)).$(".decoration-corner.bottom-right").waitForExist({
          timeoutMsg: "corner-style decoration did not render at bottom-right",
        });
      });

      it("renders an icon decoration element", async () => {
        await calendar.cell(dayAnchor(DECO_DAY.icon)).$(".icon-decoration").waitForExist({
          timeoutMsg: "icon decoration did not render on the matching day cell",
        });
      });
    });

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
});
