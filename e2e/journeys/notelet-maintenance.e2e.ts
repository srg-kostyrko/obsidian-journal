import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { clickButton, closeSettings, openSettings } from "../support/settings.js";
import { frontmatterOf, seedNote, waitForFrontmatter } from "../support/vault.js";

// A type deleted in "keep" mode leaves its notelets claiming a name no config resolves. They stay
// indexed and still carry the journal's keys, so the vault check reports them as their own finding
// kind and offers the strip. The scan walks the real vault through metadataCache, so nothing below
// is reachable from the unit suite.

const DAY = "2030-08-19";
const ORPHAN = `day/meetings/${DAY} Ghost.md`;

describe("maintenance — orphaned notelet type", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  after(closeSettings);

  it("reports a notelet whose type the journal no longer has, and strips its claim", async () => {
    await seedNote(ORPHAN, `---\njournal: daily\njournal-date: ${DAY}\njournal-notelet: Ghost\n---\nbody\n`);
    await waitForFrontmatter(
      ORPHAN,
      (frontmatter) => frontmatter["journal-notelet"] === "Ghost",
      "the orphaned notelet never reached metadataCache",
    );

    await openSettings();
    await clickButton(m.maintenance_open());

    // The scan walks the whole vault and its groups render already expanded, so the wait is for
    // the finding to appear — clicking the group trigger here would collapse it instead.
    await $(`.collapsible-trigger*=${m.maintenance_check_group_orphaned_type({ journal: "daily" })}`).waitForExist({
      timeout: 20_000,
      timeoutMsg: "the vault check never grouped an unknown-notelet-type finding",
    });
    const detail = $(`.maintenance-finding-detail*=${ORPHAN}`);
    await detail.waitForExist({ timeout: 20_000, timeoutMsg: "the orphaned notelet was not listed" });
    // The finding names the type the note still carries — that name is all that is left of it.
    expect(await detail.getText()).toContain("Ghost");

    await clickButton(m.maintenance_orphan_clear());

    await browser.waitUntil(
      async () => {
        const frontmatter = await frontmatterOf(ORPHAN);
        return frontmatter?.journal === undefined && frontmatter?.["journal-notelet"] === undefined;
      },
      { timeoutMsg: "the orphaned notelet's claim was not stripped" },
    );
  });
});
