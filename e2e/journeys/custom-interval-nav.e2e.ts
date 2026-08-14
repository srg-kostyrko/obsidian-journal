import { $, browser } from "@wdio/globals";

import {
  NAV_CURRENT,
  NAV_FENCE,
  NAV_NEXT_BLOCK,
  NAV_PREVIOUS_BLOCK,
  NAV_VIEW,
  hostNote,
  renderBlock,
} from "./code-blocks.js";

// The nav block's previous/next slots reference adjacent intervals that have no note yet.
// Their `Sprint {{index}}` row must resolve the index from NumberingService at render time;
// before the fix it only read the number off an existing note's frontmatter, so an uncreated
// interval rendered the raw `{{index}}` token. The sprint anchor 2026-01-05 is interval #1, so
// #2 starts 2026-01-19 and #3 starts 2026-02-02.
async function navRowText(blockSelector: string): Promise<string> {
  const sel = `${blockSelector} .nav-row`;
  await $(sel).waitForExist({ timeoutMsg: `nav row did not render in ${blockSelector}` });
  return browser.execute((s: string) => document.querySelector(s)?.textContent?.trim() ?? "", sel);
}

describe("custom interval navigation block", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-custom", plugins: ["journals"] });
    // Connect a host note at interval #2 (2026-01-19) so the nav block mounts; its previous
    // (#1, 2026-01-05) and next (#3, 2026-02-02) intervals stay un-created.
    await renderBlock("sprint/2026-01-19.md", hostNote("sprint", "2026-01-19", NAV_FENCE), NAV_VIEW);
  });

  it("resolves index for the previous interval that has no note", async () => {
    await browser.waitUntil(async () => (await navRowText(NAV_PREVIOUS_BLOCK)) === "Sprint 1", {
      timeoutMsg: "previous nav row did not resolve the computed index (expected 'Sprint 1')",
    });
  });

  it("resolves index for the next interval that has no note", async () => {
    await browser.waitUntil(async () => (await navRowText(NAV_NEXT_BLOCK)) === "Sprint 3", {
      timeoutMsg: "next nav row did not resolve the computed index (expected 'Sprint 3')",
    });
  });

  // The sprint journal belongs to no shelf (e2e-custom has no shelves). Its has-note→corner
  // decoration must still render on the current block, whose interval #2 note exists. Scoping
  // nav decorations to the owning shelf silently dropped them for shelf-less journals.
  it("decorates the current nav block of a journal that belongs to no shelf", async () => {
    await $(NAV_CURRENT)
      .$(".decoration-corner.top-left")
      .waitForExist({ timeoutMsg: "shelf-less journal's own nav decoration did not render on the current block" });
  });
});
