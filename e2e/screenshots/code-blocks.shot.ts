import { $, browser } from "@wdio/globals";

import { NAV_FENCE, VISIBLE_LEAF, hostNote, renderBlock } from "../journeys/code-blocks.js";

import { captureThemed } from "./capture.js";

// A markdown leaf keeps two renderings of the same note mounted at once — a live-preview copy
// and a reading-view one. Scoping to the reading-view copy is right, but only once the harness
// window is actually visible and composited (this suite must run through e2e-run — see
// docs/e2e-testing-strategy.md): against a hidden/non-composited window, the reading-view
// container mounted but its code-block post-processor never ran (innerHTML stuck at the raw,
// unprocessed fence), and the live-preview copy's `.nav-view` — a CSS container-query container —
// collapsed to a permanent 0×0 (its parent, the Live Preview editor widget, sizes to content
// rather than to the pane; reading mode hands the block a definite width instead, see
// navViewFill's comment in code-blocks.ts). With the window visible both problems are gone: the
// reading-view copy renders immediately with a real, non-zero-sized `.nav-view`. Confirmed both
// by direct DOM measurement and by reading the captured PNGs — see task-7-report.md.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NAV_VIEW = `${READING_VIEW} .block-language-calendar-nav .nav-view`;
const TIMELINE_BLOCK = `${READING_VIEW} .block-language-calendar-timeline`;

describe("code-blocks reference screenshots", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
  });

  it("captures a daily note's navigation block", async () => {
    await renderBlock("day/2026-06-15.md", hostNote("daily", "2026-06-15", NAV_FENCE), NAV_VIEW);
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
