import { $, browser, expect } from "@wdio/globals";

import { seedNote } from "../support/vault.js";

import {
  CODE_BLOCK_ERROR,
  HOME_BLOCK,
  HOME_FENCE,
  NAV_BLOCK,
  NAV_FENCE,
  NAV_VIEW,
  TIMELINE_BAD_FENCE,
  TIMELINE_BLOCK,
  TIMELINE_FENCE,
  hostNote,
  openInReadingMode,
  plainNote,
  renderBlock,
} from "./code-blocks.js";

// Slice B chunk 2 — the code-block mount seam. Our Vue surfaces mount via
// VueCodeBlockHost (a reading-mode MarkdownRenderChild) instead of createApp on an
// ItemView. Code blocks only render in reading mode, which no __mocks__/obsidian.ts
// post-processor pipeline reproduces.

// A daily host note carries a calendar-nav fence and connects via frontmatter so the
// nav renders its `.nav-view` (vs the not-connected fallback).
function navHost(anchor: string, body: string): string {
  return hostNote("daily", anchor, `${body}\n\n${NAV_FENCE}`);
}

describe("code blocks", () => {
  describe("navigation code block", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    describe("rendering", () => {
      it("renders the nav view for a connected note and not the error fallback", async () => {
        await renderBlock("nav/render.md", navHost("2026-06-04", ""), NAV_VIEW);
        await expect($(`${NAV_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });
    });
  });

  describe("timeline and home code blocks", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    describe("rendering", () => {
      it("renders the timeline month grid and not the error fallback", async () => {
        await renderBlock("blocks/timeline.md", plainNote(TIMELINE_FENCE), `${TIMELINE_BLOCK} .notes-month-view`);
        await expect($(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });

      it("renders the journals-home block and not the error fallback", async () => {
        await renderBlock("blocks/home.md", plainNote(HOME_FENCE), `${HOME_BLOCK} .home-code-block`);
        await expect($(`${HOME_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });

      it("renders the error fallback for a timeline fence with an invalid mode", async () => {
        await seedNote("blocks/bad-timeline.md", plainNote(TIMELINE_BAD_FENCE));
        await openInReadingMode("blocks/bad-timeline.md");
        await $(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`).waitForExist({
          timeoutMsg: "schema-invalid timeline fence did not render the .code-block-error fallback",
        });
        await expect($(`${TIMELINE_BLOCK} .notes-month-view`)).not.toExist();
      });
    });
  });
});
