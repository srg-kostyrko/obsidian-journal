import { browser, expect } from "@wdio/globals";

import { waitForSettings } from "../support/plugin-data.js";
import { clickIcon, deleteInModal, openSettings, selectModalSelect } from "../support/settings.js";
import { createNote, frontmatterOf, noteExists, waitForJournalFrontmatter } from "../support/vault.js";

// The integration seam for journal deletion. DeleteJournalFlow purges connected notes through the
// real NoteConnectionService (clear -> frontmatter write, delete -> vault trash) BEFORE removing
// the journal config; the `keep` branch leaves notes untouched. Only a real vault + metadataCache
// reproduces those writes, so these assertions cannot be made against __mocks__/obsidian.ts.
//
// Deleting the journal is terminal for this single-journal fixture, so each it reboots onto a fresh
// copy of e2e-daily (reloadObsidian re-copies fixtures) to restore the journal and clear prior notes.

async function deleteDailyWith(mode: "clear" | "delete" | "keep"): Promise<void> {
  await openSettings();
  await clickIcon("Delete daily");
  await selectModalSelect(mode);
  await deleteInModal();
  await waitForSettings((s) => !("daily" in (s.journals ?? {})), "deleted journal still present in data.json");
}

describe("journal deletion", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("strips journal frontmatter from a connected note when the clear mode is chosen", async () => {
    await createNote("2024-06-01.md");
    await waitForJournalFrontmatter("2024-06-01.md", { journal: "daily", date: "2024-06-01" });

    await deleteDailyWith("clear");

    // The clear mutator empties the note's frontmatter, so metadataCache may drop the block
    // entirely (fm undefined) or keep it without the journal keys — both mean the journal tag is
    // gone. Poll rather than assert once: the frontmatter write trails the settings save.
    await browser.waitUntil(
      async () => {
        const frontmatter = await frontmatterOf("2024-06-01.md");
        return frontmatter?.journal === undefined;
      },
      { timeoutMsg: "journal frontmatter was not cleared from the connected note after delete" },
    );
  });

  it("trashes a connected note when the delete mode is chosen", async () => {
    await createNote("2024-06-02.md");
    await waitForJournalFrontmatter("2024-06-02.md", { journal: "daily", date: "2024-06-02" });

    await deleteDailyWith("delete");

    await browser.waitUntil(async () => !(await noteExists("2024-06-02.md")), {
      timeoutMsg: "connected note was not trashed after delete",
    });
  });

  it("leaves a connected note's frontmatter intact when the keep mode is chosen", async () => {
    await createNote("2024-06-03.md");
    await waitForJournalFrontmatter("2024-06-03.md", { journal: "daily", date: "2024-06-03" });

    // keep never touches the note, so the journal's absence from data.json is the checkpoint that
    // the flow finished; the frontmatter observed above is then its final state.
    await deleteDailyWith("keep");

    expect(await noteExists("2024-06-03.md")).toBe(true);
    const frontmatter = await frontmatterOf("2024-06-03.md");
    expect(frontmatter?.journal).toBe("daily");
  });
});
