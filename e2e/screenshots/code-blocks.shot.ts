import { $, browser } from "@wdio/globals";

import { NAV_FENCE, VISIBLE_LEAF, hostNote, renderBlock } from "../journeys/code-blocks.js";

import { captureThemed, recordOutcome } from "./capture.js";

// A markdown leaf mounts both a live-preview and a reading-view copy of each block; the
// reading-view copy is the one with a definite width to capture.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NAV_VIEW = `${READING_VIEW} .block-language-calendar-nav .nav-view`;
const TIMELINE_BLOCK = `${READING_VIEW} .block-language-calendar-timeline`;
const HOME_VIEW = `${READING_VIEW} .block-language-journals-home`;

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

  it("captures a journals-home block showing day, week and month links", async () => {
    // e2e-docs-code-blocks carries daily (day), weekly (week) and sprint (custom) journals but
    // no monthly journal, so the requested `month` entry has nothing to show — a real instance
    // of "shown when a journal of that length is in scope".
    const fence = "```journals-home\nshow:\n  - day\n  - week\n  - month\n```";
    await renderBlock("day/2026-06-18.md", hostNote("daily", "2026-06-18", fence), HOME_VIEW);
    await $(`${HOME_VIEW} .home-code-block`).waitForExist({ timeoutMsg: "journals-home block did not render" });
    await $(`${HOME_VIEW} .home-code-block a`).waitForExist({ timeoutMsg: "journals-home block drew no links" });

    const labels = await browser.execute(
      (sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.textContent?.trim() ?? ""),
      `${HOME_VIEW} .home-code-block a`,
    );

    await captureThemed(HOME_VIEW, "code-blocks-home");

    await recordOutcome("code-blocks-home", { show: ["day", "week", "month"], labels });
  });
});
