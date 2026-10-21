import { expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { reloadObsidianOn } from "../support/clock.js";
import { waitForNotice } from "../support/notices.js";
import { contentOf, waitForContent } from "../support/vault.js";

// Both notes ship in the fixture and no command runs: the boot checkpoint is the only thing that
// can roll. It reads today when the index is ready, so the clock has to be pinned before the
// plugin loads, not after.
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

describe("automatic rollover at boot", () => {
  before(async () => {
    await reloadObsidianOn(TODAY, { vault: "./e2e-tests/fixtures/e2e-auto-rollover", plugins: ["journals"] });
  });

  it("copies the open task into today's note and marks the original, with no command run", async () => {
    // The roll waits for five quiet seconds first; the default wait budget covers it.
    await waitForContent(TARGET, (content) => content.split("\n").includes("- [ ] milk"), "waited for the roll");
    await waitForContent(
      SOURCE,
      (content) => content.split("\n").includes("- [ ] milk #rolled"),
      "waited for the source stamp",
    );
    await waitForNotice(m.tasks_roll_done({ count: 1, notes: 1, oldest: SOURCE_DATE }));

    const target = await readNote(TARGET);
    expect(target).not.toContain("bread");
    const source = await readNote(SOURCE);
    expect(source.split("\n")).toContain("- [x] bread");
  });
});

describe("automatic rollover in copy mode without Mark as rolled", () => {
  before(async () => {
    await reloadObsidianOn(TODAY, { vault: "./e2e-tests/fixtures/e2e-auto-rollover-blocked", plugins: ["journals"] });
  });

  it("rolls nothing and says it is paused", async () => {
    await waitForNotice(m.tasks_auto_roll_paused({ journal: "daily" }));

    expect(await readNote(TARGET)).not.toContain("milk");
    const source = await readNote(SOURCE);
    expect(source.split("\n")).toContain("- [ ] milk");
  });
});
