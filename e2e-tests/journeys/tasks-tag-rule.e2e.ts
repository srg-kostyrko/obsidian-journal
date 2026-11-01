import { $$, browser, expect } from "@wdio/globals";

import { VISIBLE_LEAF, openInReadingMode } from "./code-blocks.js";

// A fence's tag is matched the way Obsidian's tag search matches it: case does not matter and a
// nested tag counts. The unit tier compares hand-written tag strings; only a real metadataCache shows
// which spelling of `#Work` the listing actually receives.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasks-tag-rule";

// Ships in the fixture: seedNote does not survive browser.reloadObsidian (CLAUDE.md).
const DAY_NOTE = "daily/2026-09-25.md";

// Reading view only, inside the visible leaf — see tasks.e2e.ts for why both scopes are needed.
const TASK_ROWS = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks .task-listing-row`;

describe("journal-tasks tag rule", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("lists a differently cased tag and a nested tag, never a longer tag sharing the prefix", async () => {
    await openInReadingMode(DAY_NOTE);

    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(2);

    const texts = await $$(TASK_ROWS).map((row) => row.$(".task-listing-row__line").getText());
    expect(texts[0]).toContain("Call the client");
    expect(texts[1]).toContain("Send the invoice");
    expect(texts.some((text) => text.includes("Book the venue"))).toBe(false);
    expect(texts.some((text) => text.includes("Water the plants"))).toBe(false);
  });
});
