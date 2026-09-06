import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { paletteLists } from "../support/commands.js";
import { waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  closeSettings,
  deleteInModal,
  expandSection,
  openSettings,
  selectModalSelect,
} from "../support/settings.js";
import { frontmatterOf, noteExists, seedNote } from "../support/vault.js";

// The three delete modes each drive NoteConnectionService over a real vault: clear rewrites
// frontmatter, delete trashes files, keep touches nothing. Two things only a real vault can
// falsify — that the purge is scoped to the deleted *type* rather than the journal (the Retro
// notelet must survive all three), and that clear strips the type's own counter key, which
// clearMutator can only know by enumerating the journal's types before the type is removed.

const DAY = "2030-04-08";
const MEETING = `day/meetings/${DAY} Meeting 1.md`;
const RETRO = `day/retros/${DAY} Retro.md`;

function noteletNote(type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${DAY}\njournal-notelet: ${type}\n${extra}---\nbody\n`;
}

async function seedBothNotelets(): Promise<void> {
  await seedNote(MEETING, noteletNote("Meeting", "journal-notelet-index: 1\n"));
  await seedNote(RETRO, noteletNote("Retro"));
  // The index has to have parsed both before the delete flow counts and purges them.
  await browser.waitUntil(
    async () => {
      const frontmatter = await frontmatterOf(MEETING);
      return frontmatter?.["journal-notelet"] === "Meeting";
    },
    { timeoutMsg: "seeded meeting notelet never reached metadataCache" },
  );
}

// Every type row's configure button carries the same "Edit notelet type" label, so it has to be
// scoped by the row's visible name rather than reached through clickIcon.
async function openTypePage(typeName: string): Promise<void> {
  await $(`//div[contains(@class,"notelet-type-row")][.//span[normalize-space(.)="${typeName}"]]//button`).click();
}

async function deleteMeetingWith(mode: "clear" | "delete" | "keep"): Promise<void> {
  await openSettings();
  await clickIcon(m.journal_dashboard_edit({ name: "daily" }));
  await expandSection(m.journal_notelet_section_title());
  await openTypePage("Meeting");
  await clickIcon(m.journal_notelet_delete_tooltip());
  await selectModalSelect(mode);
  await deleteInModal();
  await waitForSettings(
    (settings) => !("meeting" in (settings.journals?.daily?.notelets ?? {})),
    "deleted notelet type still present in data.json",
  );
  await closeSettings();
}

describe("notelet type deletion", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  it("leaves the notelets untouched in keep mode", async () => {
    await seedBothNotelets();

    await deleteMeetingWith("keep");

    expect(await noteExists(MEETING)).toBe(true);
    const frontmatter = await frontmatterOf(MEETING);
    expect(frontmatter?.journal).toBe("daily");
    // The name it still carries is what keeps an orphan reachable; nothing rewrites it.
    expect(frontmatter?.["journal-notelet"]).toBe("Meeting");
  });

  it("strips the journal and notelet keys in clear mode, keeping the file", async () => {
    await seedBothNotelets();

    await deleteMeetingWith("clear");

    expect(await noteExists(MEETING)).toBe(true);
    await browser.waitUntil(
      async () => {
        const frontmatter = await frontmatterOf(MEETING);
        return frontmatter?.journal === undefined;
      },
      { timeoutMsg: "journal frontmatter was not cleared from the notelet" },
    );
    const frontmatter = await frontmatterOf(MEETING);
    expect(frontmatter?.["journal-notelet"]).toBeUndefined();
    // clearMutator enumerates the journal's types to know this key exists; a flow that removed
    // the type from config first would leave it behind.
    expect(frontmatter?.["journal-notelet-index"]).toBeUndefined();
  });

  it("trashes the notelets in delete mode", async () => {
    await seedBothNotelets();

    await deleteMeetingWith("delete");

    await browser.waitUntil(async () => !(await noteExists(MEETING)), {
      timeoutMsg: "notelet was not trashed in delete mode",
    });
  });

  // Delete mode is the scope falsifier: a purge that matched the journal rather than the type
  // would trash the Retro notelet alongside the Meeting one.
  it("leaves another type's notelets alone when this type's notes are deleted", async () => {
    await seedBothNotelets();

    await deleteMeetingWith("delete");

    expect(await noteExists(RETRO)).toBe(true);
    const frontmatter = await frontmatterOf(RETRO);
    expect(frontmatter?.journal).toBe("daily");
    expect(frontmatter?.["journal-notelet"]).toBe("Retro");
  });

  it("retires the type's seeded command", async () => {
    expect(await paletteLists("Create Meeting")).toBe(true);

    await deleteMeetingWith("keep");

    expect(await paletteLists("Create Meeting")).toBe(false);
    // The sibling type's command is targeted at its own id and must survive.
    expect(await paletteLists("Create Retro")).toBe(true);
  });
});
