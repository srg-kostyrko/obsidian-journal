import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { waitForNotice } from "../support/notices.js";
import { openViaUri } from "../support/uri.js";
import { frontmatterOf, noteExists, todayAnchor, waitForActiveNoteIn } from "../support/vault.js";

// The notelet arm of the obsidian://journals handler. Its two refusals are notice-only — nothing
// is written and no flow error surfaces — so a regression there is silent unless something drives
// the registered handler for real. Both refusals also have to leave the vault untouched, which is
// the half a unit test of the parser cannot state.

describe("notelet uri", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  it("creates and opens a notelet of the named type", async () => {
    const today = todayAnchor();

    await openViaUri({ journal: "daily", notelet: "Meeting", date: "today" });

    const path = await waitForActiveNoteIn("day/meetings");
    const frontmatter = await frontmatterOf(path);
    expect(frontmatter?.journal).toBe("daily");
    expect(frontmatter?.["journal-notelet"]).toBe("Meeting");
    expect(frontmatter?.["journal-date"]).toBe(today);
    // The journal's own note for the day is not created on the way past.
    expect(await noteExists(`day/${today}.md`)).toBe(false);
  });

  // A type name is unique only within a journal, so a link with no journal cannot resolve one.
  it("refuses a notelet link with no journal, writing nothing", async () => {
    await openViaUri({ notelet: "Meeting", date: "today" });

    await waitForNotice(m.uri_notelet_requires_journal());
  });

  it("names the unknown type when the journal has no such notelet type", async () => {
    await openViaUri({ journal: "daily", notelet: "Nope", date: "today" });

    await waitForNotice(m.uri_unknown_notelet_type({ journal: "daily", type: "Nope" }));
  });
});
