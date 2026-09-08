import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, seedNote } from "../support/vault.js";

import {
  TIMELINE_MERGED_NAV,
  TIMELINE_NAV_FENCE,
  TIMELINE_NAV_LABEL_ROW,
  TIMELINE_NAV_NEXT,
  TIMELINE_NAV_PADDED_FENCE,
  TIMELINE_NAV_RESET,
  clickTimelineNav,
  livePreviewNote,
  openInLivePreview,
  editBlockButtonOverlap,
  timelineNavCentreOffset,
  timelineWeekAnchors,
} from "./code-blocks.js";

// Live Preview is where the timeline block usually sits while a note is being read, and the
// navigation row is the first control in any of our code blocks that has to hold state across
// a click — a MarkdownRenderChild that remounts would silently reset it. Reading mode is
// covered by code-blocks.e2e.ts; this spec exists for the state, not for the rendering.
const HOST = "nav/timeline-navigation.md";
const HOST_ANCHOR = "2026-05-27";

function shiftAnchor(anchor: string, days: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Paging must not write anything: the whole point of the control is looking around without
// creating notes, which clicking a cell would do.
function markdownFileCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => app.vault.getMarkdownFiles().length);
}

async function openHost(): Promise<void> {
  await seedNote(HOST, livePreviewNote("daily", HOST_ANCHOR, TIMELINE_NAV_FENCE));
  await openInLivePreview(HOST);
  await $(TIMELINE_NAV_NEXT).waitForExist({
    timeoutMsg: "timeline navigation controls did not render in live preview",
  });
}

describe("timeline navigation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  beforeEach(async () => {
    await openHost();
  });

  // A single week grid has one heading, which already names the week the label would, so the
  // controls join it instead of taking a row of their own.
  it("seats the controls in the grid heading rather than in a row of their own", async () => {
    await expect($(TIMELINE_MERGED_NAV)).toBeExisting();
    await expect($(TIMELINE_NAV_LABEL_ROW)).not.toBeExisting();
  });

  it("moves the window one week forward without opening or creating a note", async () => {
    const before = await timelineWeekAnchors();
    const filesBefore = await markdownFileCount();

    await clickTimelineNav(TIMELINE_NAV_NEXT);
    await browser.waitUntil(
      async () => {
        const anchors = await timelineWeekAnchors();
        return anchors[0] !== before[0];
      },
      { timeoutMsg: "week did not advance after clicking next" },
    );

    expect(await timelineWeekAnchors()).toEqual(before.map((anchor) => shiftAnchor(anchor, 7)));
    expect(await markdownFileCount()).toBe(filesBefore);
    expect(await activeNotePath()).toBe(HOST);
  });

  it("returns to the host note's week from the reset control", async () => {
    const before = await timelineWeekAnchors();

    await clickTimelineNav(TIMELINE_NAV_NEXT);
    await clickTimelineNav(TIMELINE_NAV_NEXT);
    const twoOn = shiftAnchor(before[0] ?? "", 14);
    await browser.waitUntil(
      async () => {
        const anchors = await timelineWeekAnchors();
        return anchors[0] === twoOn;
      },
      { timeoutMsg: "week did not advance twice" },
    );

    await clickTimelineNav(TIMELINE_NAV_RESET);
    await browser.waitUntil(
      async () => {
        const anchors = await timelineWeekAnchors();
        return anchors[0] === before[0];
      },
      { timeoutMsg: "reset did not return to the host note's week" },
    );
  });

  // The reason this spec is in Live Preview at all: typing in the note must not throw the
  // block back to the host note's period.
  it("keeps the paged window across an edit elsewhere in the note", async () => {
    const before = await timelineWeekAnchors();

    await clickTimelineNav(TIMELINE_NAV_NEXT);
    const paged = before.map((anchor) => shiftAnchor(anchor, 7));
    await browser.waitUntil(
      async () => {
        const anchors = await timelineWeekAnchors();
        return anchors[0] === paged[0];
      },
      { timeoutMsg: "week did not advance after clicking next" },
    );

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const editor = view?.editor;
      if (!editor) return;
      const last = editor.lastLine();
      editor.setCursor({ line: last, ch: editor.getLine(last).length });
      editor.replaceSelection(" edited");
    });

    await expect($(TIMELINE_NAV_NEXT)).toBeExisting();
    expect(await timelineWeekAnchors()).toEqual(paged);
  });

  // Obsidian puts its edit-block affordance on the block's top-right corner. A control parked
  // under it never receives the click — the corner belongs to Obsidian in every mode, and at
  // every pane width.
  describe("clearing Obsidian's edit-block button", () => {
    for (const mode of ["week", "month", "quarter", "calendar"] as const) {
      it(`keeps the next control clear of it in ${mode} mode`, async () => {
        const path = `nav/edit-overlap-${mode}.md`;
        await seedNote(
          path,
          livePreviewNote("daily", HOST_ANCHOR, `\`\`\`calendar-timeline\nmode: ${mode}\nnavigation: true\n\`\`\``),
        );
        await openInLivePreview(path);
        await $(TIMELINE_NAV_NEXT).waitForExist({ timeoutMsg: `navigation controls did not render in ${mode} mode` });

        const overlap = await editBlockButtonOverlap(
          '.block-language-calendar-timeline [data-nav="next"]',
          ".block-language-calendar-timeline",
        );

        expect(overlap.measured).toBe(true);
        expect(overlap.overlaps).toBe(false);
      });
    }
  });

  // The reset control occupies a slot that is held open whether or not it is rendered, so what
  // sits beside it does not jump sideways when you page away. That slot must not push those
  // contents off the row's centre while it is empty.
  describe("centring", () => {
    it("centres the merged row's heading cells while the reset slot is empty", async () => {
      const offset = await timelineNavCentreOffset(TIMELINE_MERGED_NAV, '[data-testid^="header-"]');

      expect(Math.abs(offset ?? 999)).toBeLessThanOrEqual(1);
    });

    it("keeps them centred once the reset control appears", async () => {
      const before = await timelineNavCentreOffset(TIMELINE_MERGED_NAV, '[data-testid^="header-"]');

      await clickTimelineNav(TIMELINE_NAV_NEXT);
      await $(TIMELINE_NAV_RESET).waitForExist({ timeoutMsg: "reset control did not appear" });

      expect(await timelineNavCentreOffset(TIMELINE_MERGED_NAV, '[data-testid^="header-"]')).toBe(before);
    });

    // The padded window keeps the label row, which is where the same slot pair started.
    describe("the label row a padded window keeps", () => {
      const LABEL = ".timeline-navigation__label";

      beforeEach(async () => {
        const path = "nav/timeline-navigation-padded.md";
        await seedNote(path, livePreviewNote("daily", HOST_ANCHOR, TIMELINE_NAV_PADDED_FENCE));
        await openInLivePreview(path);
        await $(TIMELINE_NAV_LABEL_ROW).waitForExist({ timeoutMsg: "padded block did not keep the label row" });
      });

      it("centres the label while the reset slot is empty", async () => {
        const offset = await timelineNavCentreOffset(TIMELINE_NAV_LABEL_ROW, LABEL);

        expect(Math.abs(offset ?? 999)).toBeLessThanOrEqual(1);
      });

      it("keeps the label centred once the reset control appears", async () => {
        const before = await timelineNavCentreOffset(TIMELINE_NAV_LABEL_ROW, LABEL);

        await clickTimelineNav(TIMELINE_NAV_NEXT);
        await $(TIMELINE_NAV_RESET).waitForExist({ timeoutMsg: "reset control did not appear" });

        expect(await timelineNavCentreOffset(TIMELINE_NAV_LABEL_ROW, LABEL)).toBe(before);
      });
    });
  });
});
