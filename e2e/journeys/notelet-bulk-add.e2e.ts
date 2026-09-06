import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  clickDialogButton,
  clickIcon,
  closeSettings,
  expandSection,
  openSettings,
  setModalText,
  toggleModalCheckbox,
} from "../support/settings.js";
import { frontmatterOf, seedNote, waitForFrontmatter } from "../support/vault.js";

// Bulk add's notelet arm scans a real folder and writes every match in one pass. The number each
// note gets comes from the run's own allocator rather than from the index — the notes are not
// indexed as notelets yet when the plan is built — so two notes landing in the same period must
// come out 1 and 2 rather than both 1. Only a real vault scan produces that ordering.

const DAY = "2030-07-08";
const FIRST = `notelet-src/${DAY} alpha.md`;
const SECOND = `notelet-src/${DAY} beta.md`;

async function bulkAddMeetings(folder: string): Promise<void> {
  await openSettings();
  await clickIcon(m.journal_dashboard_edit({ name: "daily" }));
  await expandSection(m.journal_notelet_section_title());
  await clickIcon(m.journal_notelet_edit());
  await clickIcon(m.journal_notelet_bulk_add_tooltip());
  await setModalText(folder);
  // With the filter combinator left at "no", the dry-run toggle is the dialog's only checkbox;
  // turn it off so the run actually writes.
  await toggleModalCheckbox();
  await clickDialogButton(m.bulk_add_next());
  await clickDialogButton(m.bulk_add_run());
}

describe("bulk add notelets", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  after(closeSettings);

  it("connects every matching note as a notelet of the type, numbered in scan order", async () => {
    await seedNote(FIRST, "alpha\n");
    await seedNote(SECOND, "beta\n");

    await bulkAddMeetings("notelet-src");

    await waitForFrontmatter(
      FIRST,
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
      "the first scanned note was not connected as a Meeting notelet",
    );
    await waitForFrontmatter(
      SECOND,
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
      "the second scanned note was not connected as a Meeting notelet",
    );

    const first = await frontmatterOf(FIRST);
    const second = await frontmatterOf(SECOND);
    expect(first?.journal).toBe("daily");
    expect(first?.["journal-date"]).toBe(DAY);
    expect(second?.["journal-date"]).toBe(DAY);
    // Both land in one period, so the run's allocator has to hand out two different numbers.
    const numbers = [first?.["journal-notelet-index"], second?.["journal-notelet-index"]];
    expect(numbers).toContain(1);
    expect(numbers).toContain(2);
    await clickDialogButton(m.common_action_close());
  });
});
