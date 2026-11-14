import { browser, expect } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

import { openInReadingMode, VISIBLE_LEAF } from "./code-blocks.js";

// Narrow vs wide is decided by each calendar's own width (a container query on each month view),
// never by the window's. The window cannot be resized per block, so each case forces a width on the
// block root and reads a day cell's min-height: the fixture saves 30px wide and 40px narrow.

const DEFAULT_VIEW = "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c";
// The fixture's snippet sets the public wide `--journal-cell-cell-min-height: 50px` on this view only.
const NARROW_SNIPPET_VIEW = "8c1d2e3f-4a5b-4c6d-9e7f-0a1b2c3d4e5f";

const BELOW_BREAKPOINT = "20em";
const ABOVE_BREAKPOINT = "40em";
// A quarter fills the note three months to a row, so each month crosses the breakpoint only once the
// block is about three breakpoints wide. (Month and week mode pin the grid to a 400px strip.)
const QUARTER_ABOVE_BREAKPOINT = "120em";

const viewBlock = (viewId: string): string => `[data-journal-view="${viewId}"] .journal-view-month-calendar`;
const NOTE_BLOCK = `${VISIBLE_LEAF} .markdown-reading-view .block-language-calendar-timeline`;

class MinHeightMismatchError extends Error {
  override name = "MinHeightMismatchError";
}

async function openView(viewId: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    // A collapsed sidebar lays nothing out, and a container with no layout never matches its query.
    await app.workspace.revealLeaf(leaf);
  }, viewId);
}

async function detachJournalViews(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    for (const leaf of app.workspace.getLeavesOfType("journal-view:b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c"))
      leaf.detach();
    for (const leaf of app.workspace.getLeavesOfType("journal-view:8c1d2e3f-4a5b-4c6d-9e7f-0a1b2c3d4e5f"))
      leaf.detach();
  });
}

// Forces the width on the laid-out block root (earlier leaves keep zero-width copies in the DOM),
// then reads its first day cell's min-height, rounded: Obsidian's zoom scales authored pixels.
async function minHeightAtWidth(blockSelector: string, width: string): Promise<number | undefined> {
  const px = await browser.execute(
    (sel: string, forced: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(sel)].find((candidate) => candidate.clientWidth > 0);
      if (!block) return null;
      block.style.width = forced;
      const cell = block.querySelector<HTMLElement>('.notes-calendar-cell[role="gridcell"]');
      return cell ? Number.parseFloat(getComputedStyle(cell).minHeight) : null;
    },
    blockSelector,
    width,
  );
  return px === null ? undefined : Math.round(px);
}

async function expectMinHeight(blockSelector: string, width: string, expected: number): Promise<void> {
  let last: number | undefined;
  const message = `${blockSelector} at ${width}: expected a day cell min-height of ${expected}px`;
  await waitForState(
    async () => {
      last = await minHeightAtWidth(blockSelector, width);
      return last;
    },
    (value) => value === expected,
    message,
  ).catch(() => {
    throw new MinHeightMismatchError(`${message}, last read ${last === undefined ? "no laid-out cell" : `${last}px`}`);
  });
}

// Stages a popover in the first month's last row and reports what the point just inside the next
// month hits, or null while no laid-out quarter holds such a cell.
async function probePopoverOverhang(blockSelector: string, width: string): Promise<string | undefined> {
  const hit = await browser.execute(
    (sel: string, forced: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(sel)].find((candidate) => candidate.clientWidth > 0);
      const months = block ? [...block.querySelectorAll<HTMLElement>(".notes-month-view")] : [];
      if (!block || months.length < 2) return null;
      block.style.width = forced;
      const lastRow = [...months[0].querySelectorAll(".notes-month-view__row")].at(-1);
      const cell = lastRow?.querySelector<HTMLElement>('.notes-calendar-cell[role="gridcell"]');
      if (!cell) return null;
      const popover = document.createElement("div");
      popover.className = "mark-overflow__popover";
      popover.style.cssText = "position:absolute;top:100%;left:0;width:40px;height:300px;z-index:var(--layer-popover)";
      cell.append(popover);
      const x = popover.getBoundingClientRect().left + 10;
      const y = months[1].getBoundingClientRect().top + 30;
      const covered = document.elementFromPoint(x, y) !== popover;
      popover.remove();
      return covered ? "the next month covers the popover" : "popover";
    },
    blockSelector,
    width,
  );
  return hit ?? undefined;
}

describe("calendar appearance by the calendar's own width", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-appearance-snippets", plugins: ["journals"] });
  });

  after(detachJournalViews);

  describe("in a view", () => {
    before(async () => {
      await openView(DEFAULT_VIEW);
    });

    it("a view calendar below the breakpoint uses the narrow value", async () => {
      await expectMinHeight(viewBlock(DEFAULT_VIEW), BELOW_BREAKPOINT, 40);
    });

    it("the same calendar above the breakpoint uses the wide value", async () => {
      await expectMinHeight(viewBlock(DEFAULT_VIEW), ABOVE_BREAKPOINT, 30);
    });
  });

  describe("in a note", () => {
    before(async () => {
      await openInReadingMode("calendar-quarter-note.md");
    });

    it("a code-block calendar in a note follows its own width", async () => {
      await expectMinHeight(NOTE_BLOCK, BELOW_BREAKPOINT, 40);
      await expectMinHeight(NOTE_BLOCK, QUARTER_ABOVE_BREAKPOINT, 30);
    });
  });

  describe("each month is its own container", () => {
    before(async () => {
      await openInReadingMode("calendar-quarter-note.md");
    });

    // Chromium 120 makes a size container a stacking context, so the next month would cover the
    // overhang of a popover lifted inside the month before it. The popover is staged: the lift keys
    // on its class alone, and a real one needs a decorated day in a month's last row. The note opens
    // in a new leaf that renders on a later frame, so the probe polls until the quarter is laid out;
    // the verdict stays outside the wait, so a covered popover fails instead of being waited out.
    it("an open mark popover overhangs the next month of a timeline", async () => {
      let hit: string | undefined;
      await waitForState(
        async () => {
          hit = await probePopoverOverhang(NOTE_BLOCK, BELOW_BREAKPOINT);
          return hit;
        },
        () => true,
        `${NOTE_BLOCK}: no laid-out quarter with a day cell in its first month's last row`,
      );
      expect(hit).toBe("popover");
    });
  });

  describe("with a public wide snippet", () => {
    before(async () => {
      await openView(NARROW_SNIPPET_VIEW);
    });

    // The public wide name sits below the saved narrow one in the narrow order, by design.
    it("a public wide snippet does not beat a saved narrow value at narrow width", async () => {
      await expectMinHeight(viewBlock(NARROW_SNIPPET_VIEW), BELOW_BREAKPOINT, 40);
      await expectMinHeight(viewBlock(NARROW_SNIPPET_VIEW), ABOVE_BREAKPOINT, 50);
    });
  });
});
