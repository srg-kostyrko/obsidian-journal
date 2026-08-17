import { browser } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { clickButton, closeSettings, openSettings } from "../support/settings.js";
import { waitForJournalFrontmatter } from "../support/vault.js";

// The fixture ships no calendar override, so the week grid comes from this harness's global
// locale (dow: 0, doy: 6 — Sunday-start), not the ISO grid: 2026-W03 runs 2026-01-11..17, so
// its canonical anchor is 2026-01-11, and the stored 2026-01-14 (Wednesday) sits inside that
// same week without being it — stranded, not merely wrong.
describe("maintenance vault check", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-damaged-week", plugins: ["journals"] });
  });

  it("re-anchors a note the calendar could not see", async () => {
    // reloadObsidian only guarantees onLayoutReady, not that metadataCache has resolved every
    // note yet, so even this "starts stranded" check has to poll rather than read once.
    await waitForJournalFrontmatter("Weeks/2026-W03.md", { journal: "weekly", date: "2026-01-14" });

    await openSettings();
    await clickButton(m.maintenance_open());
    await clickButton(m.maintenance_check_fix_all());

    // The repair is only real once the note is indexed at its intended anchor, and that
    // round-trips through metadataCache — poll rather than assert straight after the click.
    await waitForJournalFrontmatter("Weeks/2026-W03.md", { journal: "weekly", date: "2026-01-11" });

    await closeSettings();
  });
});
