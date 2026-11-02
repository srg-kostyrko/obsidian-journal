import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { pinClock } from "../support/clock.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { contentOf, seedNote, waitForActiveNote } from "../support/vault.js";

import { hostNote, openInReadingMode } from "./code-blocks.js";

const FIXTURE = "./e2e-tests/fixtures/e2e-rollover-unsaved";
const SOURCE_DATE = "2026-09-25";
const SOURCE = `daily/${SOURCE_DATE}.md`;
const TODAY = "2026-09-26";
const TARGET = `daily/${TODAY}.md`;

describe("rolling tasks with a note open in reading mode", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
    await pinClock(`${TODAY}T12:00:00`);
    await seedNote(TARGET, hostNote("daily", TODAY, "## Tasks\n\nToday's notes."));
  });

  it("saves the task in the reading-mode destination before removing the original", async () => {
    await openInReadingMode(TARGET);
    await waitForActiveNote(TARGET);

    await runCommand("journals:roll-over");

    await waitForNotice(m.tasks_roll_done({ count: 1, notes: 1, oldest: SOURCE_DATE }));
    const target = await contentOf(TARGET);
    const source = await contentOf(SOURCE);
    expect(target?.split("\n")).toContain("- [ ] milk");
    expect(source?.split("\n")).not.toContain("- [ ] milk");
  });

  it("removes the original from a reading-mode source after saving the destination", async () => {
    await openInReadingMode(SOURCE);
    await waitForActiveNote(SOURCE);

    await runCommand("journals:roll-over");

    await waitForNotice(m.tasks_roll_done({ count: 1, notes: 1, oldest: SOURCE_DATE }));
    const target = await contentOf(TARGET);
    const source = await contentOf(SOURCE);
    expect(target?.split("\n")).toContain("- [ ] milk");
    expect(source?.split("\n")).not.toContain("- [ ] milk");
  });
});
