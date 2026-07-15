import { $, browser, expect } from "@wdio/globals";

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
});
