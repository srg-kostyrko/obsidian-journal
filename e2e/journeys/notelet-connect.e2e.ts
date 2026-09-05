import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { runCommand } from "../support/commands.js";
import {
  clickModalCta,
  pickModalDate,
  selectModalDropdownByLabel,
  toggleNamedModalToggle,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { frontmatterOf, noteExists, openNote, seedNote, todayAnchor, waitForFrontmatter } from "../support/vault.js";

// Connecting a note *as a notelet* is the branch that only a real vault exercises end to end: the
// modal's type picker chooses which of the journal's write shapes the note takes, and the rename
// and move toggles then run against the notelet type's own folder and name template rather than
// the journal's. A connect that fell through to the period-note path would write the same journal
// keys and move the file to the journal's own folder, so the destination folder is the falsifier.

const CONNECT_AS = m.connect_note_modal_kind_label();
const MOVE = m.connect_note_modal_move_label();

describe("connect a note as a notelet", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  it("writes the chosen type into the note and moves it into that type's folder", async () => {
    const today = todayAnchor();
    await seedNote("loose/standup.md", "notes from standup\n");
    await openNote("loose/standup.md");

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await selectModalDropdownByLabel(CONNECT_AS, "retro");
    await pickModalDate(today);
    await toggleNamedModalToggle(MOVE);
    await clickModalCta();
    await waitForDialogClosed();

    await waitForFrontmatter(
      "day/retros/standup.md",
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "the note was not connected as a Retro notelet in the type's folder",
    );
    const frontmatter = await frontmatterOf("day/retros/standup.md");
    expect(frontmatter?.journal).toBe("daily");
    expect(frontmatter?.["journal-date"]).toBe(today);
    // The move followed the *type's* folder, not the journal's own.
    expect(await noteExists("loose/standup.md")).toBe(false);
    expect(await noteExists(`day/standup.md`)).toBe(false);
  });

  it("connects as the journal's period note when no type is chosen", async () => {
    const today = todayAnchor();
    await seedNote("loose/plain.md", "just a note\n");
    await openNote("loose/plain.md");

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await pickModalDate(today);
    await clickModalCta();
    await waitForDialogClosed();

    await waitForFrontmatter(
      "loose/plain.md",
      (frontmatter) => frontmatter.journal === "daily",
      "the note was not connected to the journal",
    );
    // The period arm writes no notelet key at all — that absence is what separates the two arms.
    const frontmatter = await frontmatterOf("loose/plain.md");
    expect(frontmatter?.["journal-notelet"]).toBeUndefined();
    expect(frontmatter?.["journal-date"]).toBe(today);
  });
});
