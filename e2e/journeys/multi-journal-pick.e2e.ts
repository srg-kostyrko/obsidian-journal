import { $, browser, expect } from "@wdio/globals";

import { forceNativeMenus, nativeMenuLabels, restoreMenus } from "../support/native-menu.js";
import { closeAllLeaves, noteExists, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor } from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

// e2e-shelf-pick is issue #238's shape: two shelves, a day journal on each, and a calendar
// scoped to all journals. Every day is then covered by two journals, so clicking one cannot
// resolve to a single note and OpenDateFlow disambiguates through a menu at the pointer.
//
// That menu is the only one in the plugin whose *result* is a value — the picked name resolves
// a promise, and the menu closing cancels it. Obsidian's native menu inverts those two: it
// closes on Electron's "menu-will-close" and delivers the pick over IPC afterwards, so the pick
// arrives after the cancel has already been decided and is discarded. Nothing is logged and no
// note appears; on macOS, where `nativeMenus` defaults on, the calendar simply stopped creating
// notes for any date more than one journal covered.
//
// forceNativeMenus() puts every OS on that footing (wdio.conf.mts otherwise pins the DOM
// rendering suite-wide), so this holds the line everywhere rather than only on macOS. It runs
// inside the test body, not a hook: the conf's per-test reset would undo a `before`.
//
// One test, not three — the assertions share a single open menu, and splitting them would let
// the reset land between the click and the pick.
const ANCHOR = dayAnchor(12);

describe("multi-journal pick", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-shelf-pick", plugins: ["journals"] });
    await openCalendarView();
  });

  after(async () => {
    await restoreMenus();
    await closeAllLeaves();
  });

  it("opens the journal picked from the disambiguation menu", async () => {
    await forceNativeMenus();
    expect(await noteExists(`personal/${ANCHOR}.md`)).toBe(false);

    await calendar.cell(ANCHOR).click();

    await $(".menu").waitForExist({
      timeoutMsg: "the journal pick menu did not render in the document",
    });
    // A captured template means the menu went to Electron instead. Nothing can click it, and
    // the pick it would eventually deliver lands after the flow has read the close as a cancel.
    expect(await nativeMenuLabels()).toEqual([]);

    const titles = await browser.execute(() =>
      [...document.querySelectorAll(".menu-item-title")].map((el) => el.textContent ?? ""),
    );
    expect(titles).toEqual(["work", "personal"]);

    // Pick the second entry: resolving the choice by name is what this proves, and a regression
    // that silently took the first applicable journal would still pass on "work".
    await $(".menu-item-title=personal").click();

    await waitForActiveNote(`personal/${ANCHOR}.md`);
    await waitForJournalFrontmatter(`personal/${ANCHOR}.md`, { journal: "personal", date: ANCHOR });
    expect(await noteExists(`work/${ANCHOR}.md`)).toBe(false);
  });
});
