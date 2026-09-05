import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { openNote, seedNote, todayAnchor } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { LIVE_LEAF } from "./view.js";

// The Notelets *view block* is a different mount from the journal-notelets fence: it has no host
// note, so it resolves its period from the view's own date and a window kind, and it carries
// journal and type filters the fence does not. Follow-active-note is the notelet-specific part —
// opening a notelet has to move the view to that notelet's period, which is keyed on the active
// entry rather than on a period note.

const RIBBON = '[aria-label="Open Notelets"]';
const BLOCK = `${LIVE_LEAF} .journal-view-notelets`;
const ROW = ".journal-notelet-list__row";
const TYPE_HEADING = ".journal-notelet-list__type-heading";

function notelet(anchor: string, type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: ${type}\n${extra}---\n`;
}

// The fixture's view holds two notelets blocks: [0] a day window, [1] a week window filtered
// to the Retro type.
function block(index: number): ReturnType<typeof $> {
  return $$(BLOCK)[index];
}

async function openNoteletsView(): Promise<void> {
  await $(RIBBON).click();
  await $(BLOCK).waitForExist({ timeoutMsg: "the notelets view block did not render" });
}

function rowTextsIn(index: number): Promise<string[]> {
  return block(index)
    .$$(ROW)
    .map((row) => row.getText());
}

// Another day inside the same ISO week as today, so the week-window block reaches it while the
// day-window block does not. Yesterday unless today is a Monday, in which case tomorrow.
function otherDayInWeek(): string {
  const now = new Date();
  const shift = now.getDay() === 1 ? 1 : -1;
  const other = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const y = other.getFullYear();
  const mo = String(other.getMonth() + 1).padStart(2, "0");
  const d = String(other.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

describe("notelets view block", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelet-view", plugins: ["journals"] });
  });

  it("lists the view date's notelets, grouped by type, with a create control", async () => {
    const today = todayAnchor();
    await seedNote(`notelets/${today} Meeting 1.md`, notelet(today, "Meeting", "journal-notelet-index: 1\n"));
    await seedNote(`notelets/${today} Retro.md`, notelet(today, "Retro"));

    await openNoteletsView();

    await waitForState(
      () => rowTextsIn(0),
      (rows) => rows.length === 2,
      "the day window did not list both notelets",
    );
    const headings = await block(0)
      .$$(TYPE_HEADING)
      .map((heading) => heading.getText());
    expect(headings).toEqual(["Meeting", "Retro"]);
    await expect(block(0).$(`button[aria-label="${m.journal_notelet_list_create()}"]`)).toExist();
  });

  // The second block widens to the week AND filters to Retro, so a Meeting on another day of the
  // week is excluded by the type filter and a Retro on that day is included by the window. One
  // assertion cannot pass with either half broken.
  it("widens to the configured window and keeps only the configured types", async () => {
    const other = otherDayInWeek();
    await seedNote(`notelets/${other} Retro.md`, notelet(other, "Retro"));
    await seedNote(`notelets/${other} Meeting 1.md`, notelet(other, "Meeting", "journal-notelet-index: 1\n"));

    await openNoteletsView();

    await waitForState(
      () => rowTextsIn(1),
      (rows) => rows.length === 2 && rows.every((row) => row.includes("Retro")),
      "the week window did not list exactly the week's Retro notelets",
    );
    // The day-window block above still sees only today's, so the widening is the second block's.
    await waitForState(
      () => rowTextsIn(0),
      (rows) => rows.length === 2,
      "the day window changed with the week's",
    );
  });

  // Follow mode keys on the active entry's period. A notelet is an entry in its own right, so
  // opening one from another day has to move the view onto that day.
  it("follows the period of a notelet opened from another day", async () => {
    const other = otherDayInWeek();
    await seedNote(`notelets/${other} Retro.md`, notelet(other, "Retro"));
    await openNoteletsView();

    await openNote(`notelets/${other} Retro.md`);

    await waitForState(
      () => rowTextsIn(0),
      (rows) => rows.length > 0 && rows.every((row) => row.includes(other)),
      "the day-window block did not follow the opened notelet's period",
    );
  });
});
