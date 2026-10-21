import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { contentOf, openNote, waitForActiveNote, waitForContent } from "../support/vault.js";

// The roll's one real-vault seam: vault.process on two notes in a fixed order, the target created
// through the journal's own entry flow, and a source planned against Obsidian's metadataCache
// rather than the fake's. Ships in the fixture so its metadata has resolved by the time the
// command runs.
const FIXTURE = "./e2e-tests/fixtures/e2e-rollover";
const SOURCE_DATE = "2026-09-25";
const SOURCE = `daily/${SOURCE_DATE}.md`;
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

class NoteMissingError extends Error {
  constructor(path: string) {
    super(`expected ${path} to exist`);
    this.name = "NoteMissingError";
  }
}

// WebDriver serializes a missing note's undefined as null, so the guard has to reject both.
async function readNote(path: string): Promise<string> {
  const content = await contentOf(path);
  if (content === undefined || content === null) throw new NoteMissingError(path);
  return content;
}

describe("rolling unfinished tasks forward", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    // The roll reads today when the command runs, so pinning it after boot is enough to fix the
    // target period, and with it the target note's path.
    await pinClock(`${TODAY}T12:00:00`);
  });

  it("copies the open item under the filtered heading into today's note and marks the original", async () => {
    await openNote(SOURCE);
    await waitForActiveNote(SOURCE);

    await runCommand("journals:roll-over");

    await waitForNotice(m.tasks_roll_done({ count: 1, notes: 1, oldest: SOURCE_DATE }));
    await waitForContent(SOURCE, (content) => content.includes("- [ ] milk #rolled"), "waited for the source stamp");

    const target = await readNote(TARGET);
    expect(target.split("\n")).toContain("- [ ] milk");
    // Outside the journal's listing filter, and already done: neither is unfinished work under Tasks.
    expect(target).not.toContain("water");
    expect(target).not.toContain("bread");

    const source = await readNote(SOURCE);
    const sourceLines = source.split("\n");
    expect(sourceLines).toContain("- [ ] milk #rolled");
    expect(sourceLines).toContain("- [x] bread");
    expect(sourceLines).toContain("- [ ] water");
  });
});
