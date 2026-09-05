import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { paletteLists } from "../support/commands.js";
import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openSettings,
  setModalText,
  submitModal,
  toggleSettingRow,
} from "../support/settings.js";
import { frontmatterOf, noteExists, seedNote, waitForFrontmatter } from "../support/vault.js";

// Renaming a notelet type is the highest-risk operation the feature has: the stored type name is
// what parseEntry resolves by, so the rename has to rewrite frontmatter across every notelet of
// the type AND move each file onto the type's templates. The counter-key rename is the same shape
// one level down. Both cascade over a real vault through NoteConnectionService; unit tests drive
// them against an in-memory host, which is exactly the seam the week-preset and type-deletion
// specs exist to cover for their own cascades.

const DAY = "2030-05-14";
const MEETING = `day/meetings/${DAY} Meeting 1.md`;

function noteletNote(type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${DAY}\njournal-notelet: ${type}\n${extra}---\nbody\n`;
}

async function openMeetingTypePage(): Promise<void> {
  await openSettings();
  await clickIcon(m.journal_dashboard_edit({ name: "daily" }));
  await expandSection(m.journal_notelet_section_title());
  await clickIcon(m.journal_notelet_edit());
  // The journal subpage carries a "Note creation" section of its own, so a caller that expands
  // one before this push has rendered silently opens the journal's instead of the type's.
  await $(`button[aria-label="${m.journal_notelet_rename_tooltip()}"]`).waitForExist({
    timeoutMsg: "the notelet type subpage did not open",
  });
}

async function seedMeeting(): Promise<void> {
  await seedNote(MEETING, noteletNote("Meeting", "journal-notelet-index: 1\n"));
  await waitForFrontmatter(
    MEETING,
    (frontmatter) => frontmatter["journal-notelet"] === "Meeting",
    "seeded notelet never reached metadataCache",
  );
}

// UiCollapsibleBlock keeps `expanded` in component-local state, and the freshly pushed type
// subpage re-renders once after mount — which throws that state away and re-collapses whatever
// was just opened. One click is therefore not reliably one expansion; click until the row we
// want is actually on screen.
async function revealCounterKeyButton(): Promise<void> {
  const button = $(`button[aria-label="${m.journal_notelet_counter_key_modal_title()}"]`);
  await browser.waitUntil(
    async () => {
      if (await button.isExisting()) return true;
      await expandSection(m.journal_edit_section_note_creation());
      return button.isExisting();
    },
    { timeout: 10_000, interval: 500, timeoutMsg: "the note creation section never revealed the counter key row" },
  );
}

describe("notelet type lifecycle", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  afterEach(closeSettings);

  // The fixture declares its types and their commands directly, so nothing else in the suite
  // proves that adding a type through the UI seeds one. Seeding is driven off the add flow, not
  // off the config, so a type added by hand to data.json would have no command at all.
  it("adds a type through the UI and seeds its command", async () => {
    await openSettings();
    await clickIcon(m.journal_dashboard_edit({ name: "daily" }));
    await expandSection(m.journal_notelet_section_title());

    await clickIcon(m.journal_notelet_add());
    await setModalText("Review");
    await submitModal();

    await waitForSettings(
      (settings) => Object.values(settings.journals?.daily?.notelets ?? {}).some((type) => type.name === "Review"),
      "the added notelet type never reached data.json",
    );
    await closeSettings();
    expect(await paletteLists(m.journal_notelet_command_name({ type: "Review" }))).toBe(true);
  });

  it("rewrites a connected notelet's stored type name when its type is renamed", async () => {
    await seedMeeting();

    await openMeetingTypePage();
    await clickIcon(m.journal_notelet_rename_tooltip());
    await setModalText("Standup");
    await submitModal();

    await waitForFrontmatter(
      MEETING,
      (frontmatter) => frontmatter["journal-notelet"] === "Standup",
      "the notelet's stored type name was not rewritten by the rename",
    );
    const frontmatter = await frontmatterOf(MEETING);
    expect(frontmatter?.journal).toBe("daily");
    expect(frontmatter?.["journal-date"]).toBe(DAY);
    // The number survives a rename untouched — only the type name moved.
    expect(frontmatter?.["journal-notelet-index"]).toBe(1);
    // A rename rewrites frontmatter only: renameNoteletsOfType does not re-render the note path,
    // so the file stays where it is even though the type it names has moved on.
    expect(await noteExists(MEETING)).toBe(true);
  });

  it("leaves another type's notelets alone when one type is renamed", async () => {
    await seedMeeting();
    const retro = `day/retros/${DAY} Retro.md`;
    await seedNote(retro, noteletNote("Retro"));

    await openMeetingTypePage();
    await clickIcon(m.journal_notelet_rename_tooltip());
    await setModalText("Standup");
    await submitModal();

    await waitForFrontmatter(
      MEETING,
      (frontmatter) => frontmatter["journal-notelet"] === "Standup",
      "the renamed type's notelet was not rewritten",
    );
    expect(await noteExists(retro)).toBe(true);
    const untouched = await frontmatterOf(retro);
    expect(untouched?.["journal-notelet"]).toBe("Retro");
  });

  // A config-only key rename would strand every existing count: #parseNotelet reads the counter by
  // key, so with no counter in the metadata the old key is never removed and the number is lost.
  it("moves an existing notelet's number onto the type's new counter property", async () => {
    await seedMeeting();

    await openMeetingTypePage();
    await revealCounterKeyButton();
    await clickIcon(m.journal_notelet_counter_key_modal_title());
    await setModalText("meeting-number");
    await submitModal();

    await waitForFrontmatter(
      MEETING,
      (frontmatter) => frontmatter["meeting-number"] === 1,
      "the notelet's number was not moved onto the new counter property",
    );
    const frontmatter = await frontmatterOf(MEETING);
    expect(frontmatter?.["journal-notelet-index"]).toBeUndefined();
    expect(frontmatter?.["journal-notelet"]).toBe("Meeting");
  });

  it("gives a clone its own copy of the source's notelet types and their commands", async () => {
    await openSettings();
    await clickIcon(m.journal_dashboard_clone({ name: "daily" }));
    await submitModal();
    await goBack();

    const copy = m.journal_clone_copy_name({ name: "daily" });
    await waitForSettings(
      (settings) => Object.keys(settings.journals?.[copy]?.notelets ?? {}).length === 2,
      "the clone did not receive the source's notelet types",
    );
    const settings = await getSettings();
    const sourceIds = Object.keys(settings.journals?.daily?.notelets ?? {});
    const copyIds = Object.keys(settings.journals?.[copy]?.notelets ?? {});
    // Fresh ids, not the source's: every config reference resolves by id, and ids are unique.
    expect(copyIds.some((id) => sourceIds.includes(id))).toBe(false);
    await closeSettings();
    expect(await paletteLists(m.journal_notelet_command_name({ type: "Meeting" }))).toBe(true);
  });

  it("gives a clone no notelet types when the copy toggle is off", async () => {
    await openSettings();
    await clickIcon(m.journal_dashboard_clone({ name: "daily" }));
    await toggleSettingRow(m.journal_clone_notelet_types_label());
    await submitModal();
    await goBack();

    const copy = m.journal_clone_copy_name({ name: "daily" });
    await waitForSettings((settings) => settings.journals?.[copy] !== undefined, "the clone never reached data.json");
    const settings = await getSettings();
    expect(Object.keys(settings.journals?.[copy]?.notelets ?? {})).toEqual([]);
  });
});
