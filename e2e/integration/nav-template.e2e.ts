import { $, browser, expect } from "@wdio/globals";

import { NAV_BLOCK, NAV_NOT_CONNECTED, NAV_VIEW } from "../journeys/code-blocks.js";
import { openPalette, promptChoose } from "../support/commands.js";

// The `e2e-nav-template` fixture is a daily journal whose template carries a `calendar-nav`
// fence, in a vault that opens notes in reading mode — the only mode where Obsidian runs
// code-block post-processors, and the mode this bug is visible in.
//
// Creating the note writes its frontmatter and opens it immediately, but metadataCache resolves
// afterwards, so the nav block mounts before JournalsIndex has registered the note. JournalsIndex
// is event-based rather than Vue-reactive, so without useIndexVersion the block's computed caches
// that first "no entry" answer and the note reads as unconnected until it is re-mounted (reopened,
// or toggled edit↔view). Only real Obsidian sequences create → open → resolve this way.
describe("nav code block in a journal template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-nav-template", plugins: ["journals"] });
  });

  it("connects the freshly created note's nav block without reopening it", async () => {
    await openPalette();
    await promptChoose("Open today's note");

    await $(NAV_BLOCK).waitForExist({ timeoutMsg: "the template's nav block never rendered" });
    await $(NAV_VIEW).waitForExist({
      timeoutMsg: "the nav block stayed unconnected after the index registered the new note",
    });
    await expect($(NAV_NOT_CONNECTED)).not.toExist();
  });
});
