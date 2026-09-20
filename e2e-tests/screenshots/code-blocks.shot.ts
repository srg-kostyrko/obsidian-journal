import { $, browser } from "@wdio/globals";

import { VISIBLE_LEAF, hostNote, renderBlock } from "../journeys/code-blocks.js";
import { reloadObsidianOn } from "../support/clock.js";

import { captureThemed, recordOutcome, textsOf } from "./capture.js";

// A markdown leaf mounts both a live-preview and a reading-view copy of each block; the
// reading-view copy is the one with a definite width to capture.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
// The canonical `journal-nav` fence name (not the `calendar-nav` alias), matching what the
// docs page itself shows for this option.
const NAV_BLOCK = `${READING_VIEW} .block-language-journal-nav`;
const NAV_VIEW = `${NAV_BLOCK} .nav-view`;
const NAV_CURRENT = `${NAV_BLOCK} .nav-block-current`;
const TIMELINE_BLOCK = `${READING_VIEW} .block-language-calendar-timeline`;
const HOME_VIEW = `${READING_VIEW} .block-language-journals-home`;

// The `adjacent: false` example on the code-blocks reference page.
const NAV_ADJACENT_FALSE_FENCE = "```journal-nav\nadjacent: false\n```";

describe("code-blocks reference screenshots", () => {
  before(async () => {
    // The nav block's relative line ("3 months ago") counts from today.
    await reloadObsidianOn("2026-09-13", { vault: "./e2e-tests/fixtures/e2e-docs-code-blocks", plugins: ["journals"] });
  });

  it("captures a daily note's navigation block with adjacent: false", async () => {
    await renderBlock("day/2026-06-15.md", hostNote("daily", "2026-06-15", NAV_ADJACENT_FALSE_FENCE), NAV_VIEW);
    await $(`${NAV_CURRENT} .nav-row`).waitForExist({ timeoutMsg: "nav block drew no rows" });

    const segmentTexts = await textsOf(`${NAV_CURRENT} .nav-row`);
    const periodColumns = await browser.execute(
      (sel: string) => document.querySelectorAll(sel).length,
      `${NAV_BLOCK} .nav-block`,
    );

    await captureThemed(NAV_VIEW, "code-blocks-nav-adjacent");

    await recordOutcome("code-blocks-nav-adjacent", { segmentTexts, periodColumns });
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

  it("captures a journals-home block showing day, week and month links", async () => {
    // e2e-docs-code-blocks carries daily (day), weekly (week) and sprint (custom) journals but
    // no monthly journal, so the requested `month` entry has nothing to show — a real instance
    // of "shown when a journal of that length is in scope".
    const fence = "```journals-home\nshow:\n  - day\n  - week\n  - month\n```";
    await renderBlock("day/2026-06-18.md", hostNote("daily", "2026-06-18", fence), HOME_VIEW);
    await $(`${HOME_VIEW} .home-code-block`).waitForExist({ timeoutMsg: "journals-home block did not render" });
    await $(`${HOME_VIEW} .home-code-block a`).waitForExist({ timeoutMsg: "journals-home block drew no links" });

    const labels = await textsOf(`${HOME_VIEW} .home-code-block a`);

    await captureThemed(HOME_VIEW, "code-blocks-home");

    await recordOutcome("code-blocks-home", { show: ["day", "week", "month"], labels });
  });
});
