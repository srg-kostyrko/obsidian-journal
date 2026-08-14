import { $, browser, expect } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";
import { noteExists, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

import {
  hostNote,
  NAV_CURRENT_BLOCK,
  NAV_FENCE,
  NAV_NEXT_BLOCK,
  NAV_PREVIOUS_BLOCK,
  openInReadingMode,
  renderBlock,
  TIMELINE_BLOCK,
  TIMELINE_FENCE,
  timelineCalendar,
} from "./code-blocks.js";

import type { CellLocator } from "./calendar.js";

// The e2e-bounds vault holds one bounded day journal, `daily-window`, whose timeline runs
// 2030-06-01 .. 2030-06-30 (a `date`-kind end). A `calendar-timeline` block takes its focus
// month from the host note's journal-date, so a note connected at 2030-05-15 / 2030-06-15 /
// 2030-07-15 renders the May / June / July grid respectively. June is fully in bounds; May
// and July are wholly out, letting us assert on *same-month* cells (spill cells would be
// week-start-dependent and flake).
const JOURNAL = "daily-window";

async function openNavAt(anchor: string, path: string): Promise<void> {
  await seedNote(path, hostNote(JOURNAL, anchor, NAV_FENCE));
  await openInReadingMode(path);
  await $(NAV_CURRENT_BLOCK).waitForExist({ timeoutMsg: `nav block did not render for ${anchor}` });
}

// Reading mode's code-block layout defeats WebDriver's pointer hit-test (the Electron harness
// lacks the rect command scrollIntoView relies on), so a real `.click()` never lands — the same
// limitation clickNavNext works around. A native DOM click still fires the Vue @click handler,
// so the cell's open() genuinely runs.
async function clickCell(anchor: string): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, `${TIMELINE_BLOCK} .notes-month-view__day[data-anchor="${anchor}"]`);
}

describe("timeline bounds", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-bounds", plugins: ["journals"] });
  });

  describe("calendar cells", () => {
    it("marks a day before the timeline start as inactive", async () => {
      await renderBlock(
        "bounds/before-start.md",
        hostNote(JOURNAL, "2030-05-15", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      const cell = timelineCalendar.cell("2030-05-20");
      await expect(cell).toHaveAttribute("data-inactive", "true");
      expect(await cell.getAttribute("role")).toBe(null);
    });

    it("marks a day after the timeline end as inactive", async () => {
      await renderBlock(
        "bounds/after-end.md",
        hostNote(JOURNAL, "2030-07-15", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      const cell = timelineCalendar.cell("2030-07-10");
      await expect(cell).toHaveAttribute("data-inactive", "true");
      expect(await cell.getAttribute("role")).toBe(null);
    });

    it("opens a note when an in-bounds day is clicked", async () => {
      await renderBlock(
        "bounds/in-bounds.md",
        hostNote(JOURNAL, "2030-06-15", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      const cell = timelineCalendar.cell("2030-06-20");
      expect(await cell.getAttribute("data-inactive")).toBe(null);
      await expect(cell).toHaveAttribute("role", "button");

      await clickCell("2030-06-20");
      await waitForJournalFrontmatter("window/2030-06-20.md", { journal: JOURNAL, date: "2030-06-20" });
    });

    it("creates no note when an out-of-bounds day is clicked", async () => {
      await renderBlock(
        "bounds/no-create.md",
        hostNote(JOURNAL, "2030-05-15", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      await clickCell("2030-05-20");
      expect(await noteExists("window/2030-05-20.md")).toBe(false);
    });

    // daily-repeats runs 2030-09-01 for 5 repeats (through 2030-09-05, a repeats-kind end); its
    // September window never overlaps daily-window's June, so an out-of-repeats cell is out for
    // every journal in scope and the countRepeats branch is what decides the cutoff.
    it("keeps the final day within the repeats count actionable", async () => {
      await renderBlock(
        "bounds/repeats-in.md",
        hostNote("daily-repeats", "2030-09-01", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      const cell = timelineCalendar.cell("2030-09-05");
      expect(await cell.getAttribute("data-inactive")).toBe(null);
      await expect(cell).toHaveAttribute("role", "button");
    });

    it("marks a day past the repeats-count end as inactive", async () => {
      await renderBlock(
        "bounds/repeats-out.md",
        hostNote("daily-repeats", "2030-09-01", TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );

      const cell = timelineCalendar.cell("2030-09-06");
      await expect(cell).toHaveAttribute("data-inactive", "true");
      expect(await cell.getAttribute("role")).toBe(null);
    });
  });

  // The nav block's prev/next come from the journal cycle, which for a day journal is
  // unbounded — so without a timeline gate both controls render past the journal's end.
  // An out-of-bounds adjacent must collapse to the empty `.nav-block-placeholder`.
  describe("nav block", () => {
    it("hides the next control at the timeline end", async () => {
      await openNavAt("2030-06-30", "bounds/nav-end.md");

      await expect($(NAV_NEXT_BLOCK)).not.toExist();
      await expect($(NAV_PREVIOUS_BLOCK)).toExist();
    });

    it("hides the previous control at the timeline start", async () => {
      await openNavAt("2030-06-01", "bounds/nav-start.md");

      await expect($(NAV_PREVIOUS_BLOCK)).not.toExist();
      await expect($(NAV_NEXT_BLOCK)).toExist();
    });

    it("shows both controls for an interior in-bounds date", async () => {
      await openNavAt("2030-06-15", "bounds/nav-interior.md");

      await expect($(NAV_PREVIOUS_BLOCK)).toExist();
      await expect($(NAV_NEXT_BLOCK)).toExist();
    });
  });

  // `sprint-window` is a fortnightly custom journal anchored 2031-03-03 and bounded to
  // 2031-03-16, so exactly one of its intervals is in-timeline. Its offset-1 decoration marks
  // each interval's first day, and custom journals paint those on the *day* grid rather than in
  // the interval list. The cycle that resolves an offset runs unbounded in both directions, so
  // without a timeline gate the grid marks 2031-03-17 — the next interval's start, already past
  // the end — exactly like the in-bounds 2031-03-03. March 2031 overlaps no other journal's
  // window here, so these cells answer for sprint-window alone.
  describe("offset decorations", () => {
    const SPRINT_IN_BOUNDS = "2031-03-03";
    const SPRINT_OUT_OF_BOUNDS = "2031-03-17";
    const OFFSET_DECORATION = ".decoration-corner.top-left";

    const inBoundsMark = (): CellLocator => timelineCalendar.cell(SPRINT_IN_BOUNDS).$(OFFSET_DECORATION);

    before(async () => {
      await renderBlock(
        "bounds/offset.md",
        hostNote("sprint-window", SPRINT_IN_BOUNDS, TIMELINE_FENCE),
        `${TIMELINE_BLOCK} .notes-month-view`,
      );
    });

    it("marks the first day of an interval inside the timeline", async () => {
      await inBoundsMark().waitForExist({
        timeoutMsg: "offset decoration did not render on the in-bounds interval's first day",
      });
    });

    it("leaves the first day of an interval past the timeline end unmarked", async () => {
      // Both cells sit in the one grid rendered above, so the in-bounds cell gaining its mark
      // proves the decoration pass has run — without it, an absence assertion would also pass
      // against a grid that simply had not been evaluated yet.
      await inBoundsMark().waitForExist({
        timeoutMsg: "decoration pass never ran (in-bounds cell unmarked before the control assertion)",
      });

      await expect(timelineCalendar.cell(SPRINT_OUT_OF_BOUNDS).$(".decoration-corner")).not.toExist();
    });
  });

  // Availability and execution share one predicate: the command's plan drops journals whose
  // timeline excludes the resolved date, so a command that could only no-op is never listed.
  // The palette therefore cannot offer an action that would do nothing.
  describe("open-today command", () => {
    it("hides the command for a journal whose bounds exclude today", async () => {
      expect(await paletteLists("Open today's note")).toBe(false);
    });
  });
});
