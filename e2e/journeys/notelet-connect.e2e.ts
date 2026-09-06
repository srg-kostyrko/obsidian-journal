import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { runCommand } from "../support/commands.js";
import {
  clickDialogButton,
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

  // Retyping is the branch that has to strip the *old* type's own keys: Meeting is counted and
  // Retro is not, so a retype that only wrote the new name would leave the number behind under a
  // type that has no counter at all.
  it("strips the old type's keys when a connected notelet is retyped", async () => {
    const today = todayAnchor();
    await seedNote("loose/retype.md", "retype me\n");
    await openNote("loose/retype.md");

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await selectModalDropdownByLabel(CONNECT_AS, "meeting");
    await pickModalDate(today);
    await clickModalCta();
    await waitForDialogClosed();
    await waitForFrontmatter(
      "loose/retype.md",
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
      "the note was not connected as a Meeting notelet",
    );

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await selectModalDropdownByLabel(CONNECT_AS, "retro");
    await clickModalCta();
    await waitForDialogClosed();

    await waitForFrontmatter(
      "loose/retype.md",
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "the notelet was not retyped",
    );
    const frontmatter = await frontmatterOf("loose/retype.md");
    expect(frontmatter?.["journal-notelet-index"]).toBeUndefined();
    expect(frontmatter?.journal).toBe("daily");
  });

  it("strips every journal key when a connected notelet is disconnected", async () => {
    const today = todayAnchor();
    await seedNote("loose/drop.md", "drop me\n");
    await openNote("loose/drop.md");

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await selectModalDropdownByLabel(CONNECT_AS, "meeting");
    await pickModalDate(today);
    await clickModalCta();
    await waitForDialogClosed();
    await waitForFrontmatter(
      "loose/drop.md",
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
      "the note was not connected as a Meeting notelet",
    );

    await runCommand("journals:connect-note");
    await waitForModalOpen();
    await clickDialogButton(m.connect_note_modal_disconnect());
    await waitForDialogClosed();

    await browser.waitUntil(
      async () => {
        const frontmatter = await frontmatterOf("loose/drop.md");
        return frontmatter?.journal === undefined && frontmatter?.["journal-notelet"] === undefined;
      },
      { timeoutMsg: "the disconnected notelet kept its journal keys" },
    );
    expect(await noteExists("loose/drop.md")).toBe(true);
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
