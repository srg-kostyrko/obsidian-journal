import { $, browser } from "@wdio/globals";

import { NAV_FENCE, VISIBLE_LEAF, hostNote, renderBlock } from "../journeys/code-blocks.js";

import { captureThemed } from "./capture.js";

// A markdown leaf mounts both a live-preview and a reading-view copy of each block; the
// reading-view copy is the one with a definite width to capture.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NAV_VIEW = `${READING_VIEW} .block-language-calendar-nav .nav-view`;
const TIMELINE_BLOCK = `${READING_VIEW} .block-language-calendar-timeline`;

describe("code-blocks reference screenshots", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-code-blocks", plugins: ["journals"] });
  });

  it("captures a daily note's navigation block", async () => {
    await renderBlock("day/2026-06-15.md", hostNote("daily", "2026-06-15", NAV_FENCE), NAV_VIEW);
    await $(`${NAV_VIEW} .nav-row`).waitForExist({ timeoutMsg: "nav block drew no rows" });
    await captureThemed(NAV_VIEW, "code-blocks-nav-daily");
  });

  it("captures a week timeline", async () => {
    const fence = "```calendar-timeline\nmode: week\n```";
    await renderBlock("day/2026-06-16.md", hostNote("daily", "2026-06-16", fence), TIMELINE_BLOCK);
    await $(`${TIMELINE_BLOCK} [data-anchor]`).waitForExist({ timeoutMsg: "week timeline drew no cells" });
    await captureThemed(TIMELINE_BLOCK, "code-blocks-timeline-week");
  });

  it("captures a month timeline", async () => {
    const fence = "```calendar-timeline\nmode: month\n```";
    await renderBlock("day/2026-06-17.md", hostNote("daily", "2026-06-17", fence), TIMELINE_BLOCK);
    await $(`${TIMELINE_BLOCK} [data-anchor]`).waitForExist({ timeoutMsg: "month timeline drew no cells" });
    await captureThemed(TIMELINE_BLOCK, "code-blocks-timeline-month");
  });
});
