import { browser } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import { waitForActiveNoteIn, waitForFrontmatter } from "../support/vault.js";

// Issue #183 — a weekly journal whose timeline.start falls mid-week (2026-06-10 is a
// Wednesday) must still own the partial first week. The bug compared the week's *start*
// (which precedes the mid-week timeline.start) and treated the whole week as out of bounds,
// so the first week's note could not be created. TimelineService.contains compares the
// week's *end* instead, so opening any date in that first week — here its start date —
// resolves and creates the note. The week number is locale-dependent, so we assert the note
// lands under the journal's folder rather than pinning the exact YYYY-[W]ww path.
describe("weekly journal with a mid-week start", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-midweek", plugins: ["journals"] });
  });

  it("creates the partial first week's note from a date in that week", async () => {
    await openViaUri({ journal: "weekly", date: "2026-06-10" });

    const path = await waitForActiveNoteIn("week");
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter.journal === "weekly",
      `${path} did not attach journal=weekly frontmatter`,
    );
  });
});
