import { browser } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import { waitForFrontmatter } from "../support/vault.js";

// A custom (2-week) journal with numbering enabled assigns a per-interval index on creation. The
// anchorDate 2026-01-05 is interval #1; the next interval starts 2026-01-19 (#2). Creating via the
// journals:// URI exercises NumberingService.compute + CycleService.countRepeats against the real
// vault and writes the index into journal-index frontmatter — the runtime seam the unit tests fake.
describe("custom interval note creation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-custom", plugins: ["journals"] });
  });

  it("assigns index 1 to a note created at the interval anchor", async () => {
    await openViaUri({ journal: "sprint", date: "2026-01-05" });
    await waitForFrontmatter(
      "sprint/2026-01-05.md",
      (fm) => fm.journal === "sprint" && fm["journal-date"] === "2026-01-05" && fm["journal-index"] === 1,
      "the sprint anchor note did not receive journal-index 1",
    );
  });

  it("assigns index 2 to the following interval", async () => {
    await openViaUri({ journal: "sprint", date: "2026-01-19" });
    await waitForFrontmatter(
      "sprint/2026-01-19.md",
      (fm) => fm["journal-index"] === 2,
      "the second sprint note did not receive journal-index 2",
    );
  });
});
