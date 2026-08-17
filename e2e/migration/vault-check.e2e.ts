import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { clickButton, closeSettings, expandSection, openSettings } from "../support/settings.js";
import { frontmatterOf } from "../support/vault.js";

// The fixture ships no calendar override, so the week grid comes from this harness's global
// locale (dow: 0, doy: 6 — Sunday-start), not the ISO grid: 2026-W03 runs 2026-01-11..17, so
// its canonical anchor is 2026-01-11, and the stored 2026-01-14 (Wednesday) sits inside that
// same week without being it — stranded, not merely wrong.
describe("maintenance vault check", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-damaged-week", plugins: ["journals"] });
  });

  it("re-anchors a note the calendar could not see", async () => {
    const before = await frontmatterOf("Weeks/2026-W03.md");
    expect(before?.["journal-date"]).toBe("2026-01-14");

    await openSettings();
    await expandSection(m.maintenance_heading());
    await clickButton(m.maintenance_open());
    await clickButton(m.maintenance_check_fix_all());

    // The repair is only real once the note is indexed at its intended anchor, and that
    // round-trips through metadataCache — poll rather than assert straight after the click.
    await browser.waitUntil(
      async () => {
        const fm = await frontmatterOf("Weeks/2026-W03.md");
        return fm?.["journal-date"] === "2026-01-11";
      },
      { timeoutMsg: "note was never re-anchored to its week's first day" },
    );

    await closeSettings();
  });
});
