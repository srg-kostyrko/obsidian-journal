import { browser, expect } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import { noteExists, waitForActiveNote, waitForFrontmatter, writeNote } from "../support/vault.js";

// Editing a journal note by hand goes through metadataCache -> "metadata-changed" -> JournalsIndex.
// register() returned early whenever the path's journal and anchor were unchanged, so an edit that
// only moved the entry's payload — its end date or its numbering value — never reached the index.
// The note read correctly off disk the whole time; only the live index stayed on the old value,
// until a restart rebuilt it and the sequence jumped.
//
// Both notes must exist at boot for that early return to be the path under test: a note the run
// creates is registered fresh and takes the full path instead. seedNote does not survive
// reloadObsidian, so they ship in the fixture rather than being staged here.
//
// Both journals are anchored 2026-01-05 with a 2-week duration, and carry one variable each so
// neither test can pass on the other's fix:
//
//   sprint    end date 2026-01-18 -> 2026-01-25, so 2026-01-20 belongs to the first interval
//             instead of starting the second one on 2026-01-19
//   cadence   index 1 -> 7, so the interval after it is numbered 8 instead of 2

const SPRINT = "sprint/2026-01-05.md";
const SPRINT_SECOND = "sprint/2026-01-19.md";
const CADENCE = "cadence/2026-01-05.md";
const CADENCE_SECOND = "cadence/2026-01-19.md";

const EXTENDED_END = "2026-01-25";
const RENUMBERED = 7;

describe("editing a journal note while Obsidian runs", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-interval-edit", plugins: ["journals"] });
  });

  it("extends the interval so a later date still belongs to it", async () => {
    await writeNote(
      SPRINT,
      `---\njournal: sprint\njournal-date: 2026-01-05\njournal-end-date: ${EXTENDED_END}\n---\n\nExtended by hand.\n`,
    );
    await waitForFrontmatter(
      SPRINT,
      (fm) => fm["journal-end-date"] === EXTENDED_END,
      "the extended end date never reached metadataCache",
    );

    await openViaUri({ journal: "sprint", date: "2026-01-20" });

    // Without the extension in the index this opens — and creates — the second interval instead.
    await waitForActiveNote(SPRINT);
    expect(await noteExists(SPRINT_SECOND)).toBe(false);
  });

  it("renumbers the interval so the next one continues from the corrected value", async () => {
    await writeNote(
      CADENCE,
      `---\njournal: cadence\njournal-date: 2026-01-05\njournal-index: ${RENUMBERED}\n---\n\nRenumbered by hand.\n`,
    );
    await waitForFrontmatter(
      CADENCE,
      (fm) => fm["journal-index"] === RENUMBERED,
      "the corrected index never reached metadataCache",
    );

    await openViaUri({ journal: "cadence", date: "2026-01-19" });

    await waitForFrontmatter(
      CADENCE_SECOND,
      (fm) => fm["journal-index"] === RENUMBERED + 1,
      `the interval after the renumbered one did not continue from ${RENUMBERED}`,
    );
  });
});
