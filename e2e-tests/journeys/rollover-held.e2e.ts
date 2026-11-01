import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { noticeTexts } from "../support/notices.js";
import { contentOf, openNote, waitForActiveNote, waitForContent } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// Today's note already holds the earlier note's task, the way it does after a roll whose mark was
// lost and a restart cleared the pause — one of them with a code block nested under it — and holds
// another only inside a code fence, as an example. Ships in the fixture so both notes are indexed at boot.
const FIXTURE = "./e2e-tests/fixtures/e2e-rollover-held";
const SOURCE_DATE = "2026-09-25";
const SOURCE = `daily/${SOURCE_DATE}.md`;
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

describe("rolling a task today's note already holds", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
  });

  it("marks the original without copying it a second time, and copies the one held only as an example", async () => {
    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);

    await runCommand("journals:roll-over");

    await waitForContent(SOURCE, (content) => content.includes("- [ ] milk #rolled"), "waited for the source stamp");
    const held = m.tasks_roll_already_held({ count: 2 });
    await waitForState(
      noticeTexts,
      (texts) => texts.some((text) => text.includes(held)),
      "waited for the notice to count the task already there",
    );
    const target = await contentOf(TARGET);
    expect(target?.split("\n").filter((line) => line === "- [ ] milk")).toHaveLength(1);
    expect(target?.split("\n").filter((line) => line === "- [ ] eggs")).toHaveLength(2);
    expect(target?.split("\n").filter((line) => line === "- [ ] tea")).toHaveLength(1);
  });
});
